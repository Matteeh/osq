/** One change's lane body: scope audit, task, mutation check, commit, archive. */

import type { OsqConfig } from '../core/foundation/config.js';
import { type Logger, resolveSymbol } from '../core/foundation/logger.js';
import type { StaleTaskAudit } from '../core/run/scope-hash.js';
import type { LocatedChange } from '../core/status/change-locations.js';
import { type SpecState, compareNumericPrefix } from '../core/status/state.js';
import type { HarnessAdapter, SpawnTaskOptions } from '../harness/types.js';
import { archiveCompletedSpec } from './archive-change.js';
import { StaleBuildError } from './build.js';
import type { BlockedByRegression, ChangeLanes, LaneOutcome } from './lanes.js';
import { runMutationCheck } from './mutation-check.js';
import type { RunTaskResult } from './outcome.js';
import { auditScopeRegressions } from './regression.js';
import { runTask } from './runner.js';
import type { StaleCheck } from './stale-pass.js';
import { discardPausedWorktreeChanges } from './usage-pause.js';
import { commitWorktreeDeadTask, commitWorktreeVerifiedTask } from './worktree-commit.js';
import { haltWorktreeChange } from './worktree-run.js';

/** The mutable outcome a lane builds up as it runs. */
interface MutableLaneOutcome {
  tasksRun: number;
  specsArchived: number;
  blockedByRegression: BlockedByRegression[];
}

/** Everything one lane body needs from the cycle that started it. */
export interface ChangeLaneContext {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  readonly adapter: HarnessAdapter;
  readonly logger?: Logger;
  readonly staleCheck?: StaleCheck;
  readonly change: LocatedChange;
  readonly specState: SpecState;
  readonly taskNumber: string;
  readonly lanes: ChangeLanes;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Log a non-build watcher error on the permanent error line.
 *
 * @scenario watcher-and-harness: Stopping waits for running lanes
 */
export function logWatcherError(
  logger: Logger | undefined,
  useSymbols: boolean,
  err: unknown,
): void {
  logger?.error(`${resolveSymbol('✗', '[error]', useSymbols)} watcher error: ${errorMessage(err)}`);
}

/**
 * Permanent stale-task log line: task number plus compact per-path attribution.
 *
 * @scenario watcher-and-harness: What a lane runs
 */
export function formatScopeRegressionLine(stale: StaleTaskAudit, symbols: boolean): string {
  const detail = stale.attribution
    .map((entry) => `${entry.path} -> ${entry.attribution}`)
    .join(', ');
  return `${resolveSymbol('?', '[regressed]', symbols)} task ${stale.taskNumber} regressed (reason: scope_regression, attribution: ${detail || 'none'})`;
}

/** Wrap an adapter so the lane records the moment its task actually spawns. */
function trackedAdapter(
  adapter: HarnessAdapter,
  lanes: ChangeLanes,
  folderPath: string,
): HarnessAdapter {
  return new Proxy(adapter, {
    get(target, property) {
      if (property === 'spawn') {
        return (options: SpawnTaskOptions) => {
          lanes.markSpawned(folderPath);
          return target.spawn(options);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** Run the pre-dispatch scope audit; return the blocked entry it found, if any. */
async function runScopeAudit(context: ChangeLaneContext): Promise<BlockedByRegression | null> {
  const { change, config, logger, specState, taskNumber } = context;
  const useSymbols = logger?.symbols === true;
  const tag = (symbol: string, word: string): string => resolveSymbol(symbol, word, useSymbols);
  const folderPath = change.folderPath;
  const earlier = specState.tasks
    .map((task) => task.taskNumber)
    .filter((number) => Number.parseInt(number, 10) < Number.parseInt(taskNumber, 10));
  const audit = await auditScopeRegressions({
    projectRoot: change.tree.root,
    specFolderPath: folderPath,
    eligibleTaskNumbers: earlier,
    verifyTimeoutSeconds: config.timeouts.verifyTimeoutSeconds ?? 600,
    limits: config.limits,
  });
  for (const recertified of audit.recertified) {
    const paths = audit.recertifiedPaths[recertified] ?? [];
    logger?.info(
      `${tag('↻', '[recertified]')} task ${recertified} recertified automatically (${paths.join(', ') || 'no differing paths'})`,
    );
  }
  if (audit.stale.length === 0) return null;
  const staleNumbers = audit.stale.map((stale) => stale.taskNumber).sort(compareNumericPrefix);
  for (const stale of audit.stale) {
    logger?.info(formatScopeRegressionLine(stale, useSymbols));
  }
  logger?.info(
    `${resolveSymbol('■', '[halted]', useSymbols)} spec ${specState.id} halted: tasks ${staleNumbers.join(', ')} require recertification`,
  );
  return { id: specState.id, outcome: 'blocked_by_regression', tasks: staleNumbers };
}

/** Finish a task's lane: mutation check, commit or dead record, then archive a pass. */
async function finishLaneTask(
  context: ChangeLaneContext,
  taskResult: RunTaskResult,
  outcome: MutableLaneOutcome,
): Promise<void> {
  const { change, config, logger, specState, taskNumber } = context;
  const worktree = change.tree.worktreeFolder !== undefined;
  const specId = specState.id;
  const tag = (symbol: string, word: string): string =>
    resolveSymbol(symbol, word, logger?.symbols === true);

  if (taskResult.success) {
    await runMutationCheck(change.tree.root, change.folderPath, taskNumber, config, logger);
    if (worktree) {
      const halt = await commitWorktreeVerifiedTask(change, config, taskNumber);
      if (halt) {
        await haltWorktreeChange(change, specId, halt, logger, config.limits);
        return;
      }
    }
    const archived = await archiveCompletedSpec(change, specId, {
      projectRoot: context.projectRoot,
      config,
      logger,
      staleCheck: context.staleCheck,
    });
    if (archived) outcome.specsArchived = 1;
    return;
  }
  if (taskResult.paused) {
    // A pause writes no dead record and halts nothing: discard the agent's
    // edits outside the change folder and wait for the reset.
    if (worktree) {
      await discardPausedWorktreeChanges(change, config);
    }
    return;
  }
  if (
    worktree &&
    taskResult.reason !== undefined &&
    taskResult.reason !== 'regressed' &&
    taskResult.reason !== 'already_running'
  ) {
    const halt = await commitWorktreeDeadTask(change, config, taskNumber, taskResult.reason);
    if (halt) {
      await haltWorktreeChange(change, specId, halt, logger, config.limits);
      return;
    }
  }
  logger?.info(`${tag('■ spec', '[halted]')} ${specId} halted (task ${taskNumber} dead)`);
}

/**
 * Run one change's lane: the pre-dispatch scope audit, the task, the mutation
 * check, the task's commit or dead record, and the archive after a pass. A
 * logged error ends this lane alone; a build error is rethrown so the watcher
 * stops only after every lane has finished.
 *
 * @scenario watcher-and-harness: What a lane runs
 * @scenario watcher-and-harness: A stacked change waits
 * @scenario watcher-and-harness: Stopping waits for running lanes
 * @adr 012
 */
export async function runChangeLane(context: ChangeLaneContext): Promise<LaneOutcome> {
  const { logger } = context;
  const useSymbols = logger?.symbols === true;
  const outcome: MutableLaneOutcome = {
    tasksRun: 0,
    specsArchived: 0,
    blockedByRegression: [],
  };

  try {
    // A stop that landed before this lane spawned starts no task here.
    if (context.lanes.isClosed()) return outcome;
    const blocked = await runScopeAudit(context);
    if (blocked !== null) {
      outcome.blockedByRegression.push(blocked);
      return outcome;
    }
    if (context.lanes.isClosed()) return outcome;

    const taskResult = await runTask(
      context.change.tree.root,
      context.change.folderPath,
      context.taskNumber,
      context.config,
      trackedAdapter(context.adapter, context.lanes, context.change.folderPath),
      logger,
    );
    outcome.tasksRun = 1;
    await finishLaneTask(context, taskResult, outcome);
  } catch (err) {
    if (err instanceof StaleBuildError) {
      throw err;
    }
    logWatcherError(logger, useSymbols, err);
  }
  return outcome;
}
