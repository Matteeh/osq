import fs from 'node:fs/promises';
import path from 'node:path';
import { watch } from 'chokidar';
import type { OsqConfig } from '../core/foundation/config.js';
import { findHarness } from '../core/foundation/harness-catalog.js';
import { type Logger, resolveSymbol } from '../core/foundation/logger.js';
import { reapStaleLocks } from '../core/run/lock.js';
import type { StaleTaskAudit } from '../core/run/scope-hash.js';
import { parseSpecMdFromFolder, resolveChangeDoc } from '../core/spec/parser.js';
import {
  type LocatedChange,
  changeTrees,
  changesDirLabel,
  listChanges,
} from '../core/status/change-locations.js';
import { compareNumericPrefix, deriveSpecState, readChangeFolder } from '../core/status/state.js';
import type { HarnessAdapter } from '../harness/types.js';
import { restoreArchiveSpecs } from './archive-specs.js';
import { checkAndArchiveSpec } from './archiver.js';
import { runAutomaticRetries } from './auto-retry.js';
import { type BuildInfo, StaleBuildError, resolveBuildInfo } from './build.js';
import { runMutationCheck } from './mutation-check.js';
import { formatReapedMarker, recordDeadEvent, writeDeadMarker } from './outcome.js';
import { auditScopeRegressions } from './regression.js';
import { runTask } from './runner.js';
import { runStackedChanges } from './stack-run.js';
import {
  type StaleCheck,
  assertNotStale,
  handleStaleBuild,
  startStaleCheck,
} from './stale-pass.js';
import { checkSync } from './sync-run.js';
import {
  commitPendingVerifiedTasks,
  commitWorktreeArchive,
  commitWorktreeDeadTask,
  commitWorktreeVerifiedTask,
  newArchiveName,
  readArchiveNames,
} from './worktree-commit.js';
import { approvalCommitted, checkWorktree, haltWorktreeChange } from './worktree-run.js';

const SHOW_CURSOR = '\x1b[?25h';
const EXIT_SIGINT = 130;

export interface WatcherSummary {
  tasksRun: number;
  /** Automatic retries the watcher made; progress even when no task ran. */
  retried: number;
  specsArchived: number;
  /** Changes whose pre-dispatch scope audit found newly stale tasks. */
  blockedByRegression: {
    readonly id: string;
    readonly outcome: 'blocked_by_regression';
    readonly tasks: readonly string[];
  }[];
}

export interface StartWatcherOptions {
  once?: boolean;
  pollIntervalMs?: number;
  signal?: AbortSignal;
  logger?: Logger;
  allowStale?: boolean;
  dev?: boolean;
  packageRoot?: string;
  exit?: (code: number) => void;
}

export interface ArchivedSpecSummary {
  id: string;
  folder: string;
  archivedAt: number;
}

export function formatAgo(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Single idle status line: the active build identity, the watched spec
 * directory, how many approved specs are still waiting, and when the last spec
 * was archived. Pure so the exact shape is testable without a watcher. The
 * `osq v<version> (<commit>)` prefix is omitted when no build info is supplied.
 */
export function formatIdleStatus(
  specsDir: string,
  approvedWaiting: number,
  lastArchived?: ArchivedSpecSummary,
  now: number = Date.now(),
  buildInfo?: BuildInfo,
): string {
  const last = lastArchived
    ? `last: ${lastArchived.id} archived ${formatAgo(now - lastArchived.archivedAt)}`
    : 'last: none';
  const prefix = buildInfo ? `osq v${buildInfo.version} (${buildInfo.commit}) · ` : '';
  return `${prefix}watching ${specsDir} · ${approvedWaiting} approved waiting · ${last}`;
}

const HUMAN_STEPS_HEADING = /^##[ \t]+Human steps[ \t]*\r?$/im;

/**
 * Extract the `## Human steps` section from a change document. osq never
 * performs these steps itself; they are printed once the change completes so
 * the human knows which manual actions remain (for the layout cut-over: stop
 * the watcher, run the migration, restart). Returns an empty string when the
 * document has no such section or the section is blank.
 */
export function extractHumanSteps(content: string): string {
  const match = HUMAN_STEPS_HEADING.exec(content);
  if (!match || match.index === undefined) {
    return '';
  }
  const remainder = content.slice(match.index + match[0].length);
  const nextHeading = remainder.search(/^##[ \t]+\S/m);
  const section = nextHeading === -1 ? remainder : remainder.slice(0, nextHeading);
  return section.trim();
}

/**
 * Read the `## Human steps` section from a change folder, preferring the
 * OpenSpec `proposal.md` and falling back to a legacy `spec.md`. Never moves
 * anything: the cut-over is always performed by the human.
 */
async function readHumanSteps(specFolderPath: string): Promise<string> {
  const resolved = await resolveChangeDoc(specFolderPath);
  if (!resolved) {
    return '';
  }
  const content = await fs.readFile(resolved.path, 'utf8').catch(() => '');
  return extractHumanSteps(content);
}

/**
 * Most recently archived spec folder, derived from the archive directory's
 * modification times so the idle status survives a watcher restart.
 */
export async function findLatestArchivedSpec(
  projectRoot: string,
  config: OsqConfig,
): Promise<ArchivedSpecSummary | undefined> {
  const archived = await listChanges(projectRoot, config, ['archived']);

  let latest: ArchivedSpecSummary | undefined;
  for (const change of archived) {
    const stat = await fs.stat(change.folderPath).catch(() => null);
    if (!stat) continue;
    const summary: ArchivedSpecSummary = {
      id: change.folderName.match(/^(\d+)/)?.[1] ?? change.folderName,
      folder: change.folderName,
      archivedAt: stat.mtimeMs,
    };
    if (!latest || summary.archivedAt > latest.archivedAt) {
      latest = summary;
    }
  }
  return latest;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function logWatcherError(logger: Logger | undefined, useSymbols: boolean, err: unknown): void {
  logger?.error(`${resolveSymbol('✗', '[error]', useSymbols)} watcher error: ${errorMessage(err)}`);
}

/** Permanent stale-task log line: task number plus compact per-path attribution. */
function formatScopeRegressionLine(stale: StaleTaskAudit, symbols: boolean): string {
  const detail = stale.attribution
    .map((entry) => `${entry.path} -> ${entry.attribution}`)
    .join(', ');
  return `${resolveSymbol('?', '[regressed]', symbols)} task ${stale.taskNumber} regressed (reason: scope_regression, attribution: ${detail || 'none'})`;
}

export async function runWatcherCycle(
  projectRoot: string,
  config: OsqConfig,
  adapter: HarnessAdapter,
  logger?: Logger,
  staleCheck?: StaleCheck,
): Promise<WatcherSummary> {
  const useSymbols = logger?.symbols === true;
  const tag = (symbol: string, word: string): string => resolveSymbol(symbol, word, useSymbols);

  // Resolved once per cycle (and cached in `build.ts`) so both the idle status
  // row and every change carry osq's own identity.
  const buildInfo = await resolveBuildInfo();

  await runStackedChanges(projectRoot, config, logger);

  const activeChanges = await listChanges(projectRoot, config, ['active']);

  let tasksRun = 0;
  let retried = 0;
  let specsArchived = 0;
  let approvedWaiting = 0;
  const blockedByRegression: {
    id: string;
    outcome: 'blocked_by_regression';
    tasks: readonly string[];
  }[] = [];

  const archiveCompletedSpec = async (change: LocatedChange, specId: string): Promise<void> => {
    await assertNotStale(staleCheck);
    const folder = change.folderName;
    const folderPath = change.folderPath;
    const root = change.tree.root;
    const worktree = change.tree.worktreeFolder !== undefined;
    // Read the manual steps while the folder still exists: the archive move
    // relocates it, and this task never performs those steps itself.
    const humanSteps = await readHumanSteps(folderPath);
    if (worktree) {
      const halt = await checkWorktree(change, config);
      if (halt) {
        await haltWorktreeChange(change, specId, halt, logger);
        return;
      }
      const archiveState = deriveSpecState(await readChangeFolder(root, folderPath));
      if (archiveState.status === 'done') {
        const syncHalt = await checkSync(projectRoot, change, config, logger);
        if (syncHalt) {
          await haltWorktreeChange(change, specId, syncHalt, logger);
          return;
        }
      }
    }
    const proposalTitle = worktree
      ? ((await parseSpecMdFromFolder(folderPath).catch(() => null))?.title ?? '')
      : '';
    const before = worktree ? await readArchiveNames(change.tree.archiveDir) : null;
    const archived = await checkAndArchiveSpec(root, folderPath, config);
    if (!archived) {
      return;
    }
    specsArchived++;
    logger?.info(`${tag('✓ spec', '[archived]')} ${specId} archived (${folder})`);
    if (worktree && before !== null) {
      const archiveName = await newArchiveName(change.tree.archiveDir, before);
      if (archiveName !== null) {
        await commitWorktreeArchive(change, config, archiveName, proposalTitle, logger);
      }
    }
    if (humanSteps) {
      logger?.info(`Human steps after completion:\n${humanSteps}`);
    }
  };

  for (const change of activeChanges) {
    const folder = change.folderName;
    const folderPath = change.folderPath;
    const treeRoot = change.tree.root;
    const worktree = change.tree.worktreeFolder !== undefined;
    const specId = folder.match(/^(\d+)/)?.[1] ?? folder;
    try {
      // A worktree approval is not real until its commit lands: skip until
      // `.run/approved` exists at HEAD so no later step sees a half-written seal.
      if (worktree && !(await approvalCommitted(change, config))) {
        continue;
      }
      // The reaper only detects and unlinks expired locks; the watcher owns the
      // dead marker and event so every artifact is written through outcome.ts.
      const runDir = path.join(folderPath, '.run');
      const reapedLocks = await reapStaleLocks(folderPath, config.timeouts.staleLockSeconds);
      let reaperHalted = false;
      for (const reaped of reapedLocks) {
        await writeDeadMarker(
          runDir,
          reaped.taskNumber,
          formatReapedMarker(reaped.reason, reaped.pid, reaped.startedAt),
          treeRoot,
        );
        await recordDeadEvent(folderPath, reaped.taskNumber, reaped.reason);
        if (worktree) {
          const halt = await commitWorktreeDeadTask(
            change,
            config,
            reaped.taskNumber,
            reaped.reason,
          );
          if (halt) {
            await haltWorktreeChange(change, specId, halt, logger);
            reaperHalted = true;
            break;
          }
        }
      }
      if (reaperHalted) continue;

      let specState = deriveSpecState(await readChangeFolder(treeRoot, folderPath));

      // The automatic-retry decision runs from disk for every approved change
      // after reaping and before the next task is picked. Renaming the active
      // dead marker is the commit point, so a restart loses no retry.
      if (specState.approvedHash) {
        const count = await runAutomaticRetries(treeRoot, folderPath, config, logger);
        if (count > 0) {
          retried += count;
        }
        // Re-derive so a task the automatic-retry step just marked stuck is
        // seen as steering in this same cycle.
        specState = deriveSpecState(await readChangeFolder(treeRoot, folderPath));
      }

      // A change that needs steering waits for `osq plan` and `osq approve`:
      // leave its folder alone so a planner can edit it.
      if (specState.steering) {
        continue;
      }

      // A worktree change commits its pending done tasks before any check, so a
      // commit a hook rejected is retried by `osq retry <id> change`, then the
      // clean check runs against the resulting tree.
      if (worktree && specState.status !== 'regressed') {
        // A stopped archive may have left the living specs modified and the
        // record in the worktree; put them back before the dirty check.
        await restoreArchiveSpecs(change.tree.root, change.folderPath);
        const pendingHalt = await commitPendingVerifiedTasks(change, config);
        if (pendingHalt) {
          await haltWorktreeChange(change, specId, pendingHalt, logger);
          continue;
        }
        const worktreeHalt = await checkWorktree(change, config);
        if (worktreeHalt) {
          await haltWorktreeChange(change, specId, worktreeHalt, logger);
          continue;
        }
        specState = deriveSpecState(await readChangeFolder(treeRoot, folderPath));
      }

      if (
        specState.approvedHash &&
        (specState.status === 'pending' ||
          specState.status === 'running' ||
          specState.status === 'blocked')
      ) {
        approvedWaiting++;
      }

      if (specState.status === 'pending' && specState.nextTask) {
        await assertNotStale(staleCheck);
        if (worktree && specState.tasks.every((task) => task.status !== 'done')) {
          const syncHalt = await checkSync(projectRoot, change, config, logger);
          if (syncHalt) {
            await haltWorktreeChange(change, specId, syncHalt, logger);
            continue;
          }
          specState = deriveSpecState(await readChangeFolder(treeRoot, folderPath));
        }
        if (!specState.nextTask) {
          continue;
        }
        const taskNumber = specState.nextTask.taskNumber;
        logger?.info(`${tag('▶ spec', '[spec]')} ${specState.id} picked up (${folder})`);

        // Pre-dispatch scope audit runs before any lock: every earlier
        // automated done task is compared in one pass, stale tasks are
        // verified and recorded, and the upcoming task stays untouched.
        const earlier = specState.tasks
          .map((task) => task.taskNumber)
          .filter((number) => Number.parseInt(number, 10) < Number.parseInt(taskNumber, 10));
        const audit = await auditScopeRegressions({
          projectRoot: treeRoot,
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
        if (audit.stale.length > 0) {
          const staleNumbers = audit.stale
            .map((stale) => stale.taskNumber)
            .sort(compareNumericPrefix);
          for (const stale of audit.stale) {
            logger?.info(formatScopeRegressionLine(stale, useSymbols));
          }
          logger?.info(
            `${resolveSymbol('■', '[halted]', useSymbols)} spec ${specState.id} halted: tasks ${staleNumbers.join(', ')} require recertification`,
          );
          blockedByRegression.push({
            id: specState.id,
            outcome: 'blocked_by_regression',
            tasks: staleNumbers,
          });
          continue;
        }

        const taskResult = await runTask(treeRoot, folderPath, taskNumber, config, adapter, logger);
        tasksRun++;

        if (taskResult.success) {
          await runMutationCheck(treeRoot, folderPath, taskNumber, config, logger);
          if (worktree) {
            const halt = await commitWorktreeVerifiedTask(change, config, taskNumber);
            if (halt) {
              await haltWorktreeChange(change, specId, halt, logger);
              continue;
            }
          }
          await archiveCompletedSpec(change, specState.id);
        } else {
          if (
            worktree &&
            taskResult.reason !== undefined &&
            taskResult.reason !== 'regressed' &&
            taskResult.reason !== 'already_running'
          ) {
            const halt = await commitWorktreeDeadTask(
              change,
              config,
              taskNumber,
              taskResult.reason,
            );
            if (halt) {
              await haltWorktreeChange(change, specId, halt, logger);
              continue;
            }
          }
          logger?.info(
            `${tag('■ spec', '[halted]')} ${specState.id} halted (task ${taskNumber} dead)`,
          );
        }
      } else if (specState.status === 'done') {
        await archiveCompletedSpec(change, specState.id);
      }
    } catch (err) {
      if (err instanceof StaleBuildError) {
        throw err;
      }
      logWatcherError(logger, useSymbols, err);
    }
  }

  if (tasksRun === 0) {
    const lastArchived = await findLatestArchivedSpec(projectRoot, config).catch(() => undefined);
    logger?.status(
      formatIdleStatus(
        changesDirLabel(config),
        approvedWaiting,
        lastArchived,
        undefined,
        buildInfo,
      ),
    );
  }

  return { tasksRun, retried, specsArchived, blockedByRegression };
}

export async function runWatcherOnce(
  projectRoot: string,
  config: OsqConfig,
  adapter: HarnessAdapter,
  logger?: Logger,
  staleCheck?: StaleCheck,
): Promise<WatcherSummary> {
  let totalTasksRun = 0;
  let totalRetried = 0;
  let totalSpecsArchived = 0;
  const blockedByRegression: {
    id: string;
    outcome: 'blocked_by_regression';
    tasks: readonly string[];
  }[] = [];

  while (true) {
    const cycle = await runWatcherCycle(projectRoot, config, adapter, logger, staleCheck);
    totalTasksRun += cycle.tasksRun;
    totalRetried += cycle.retried;
    totalSpecsArchived += cycle.specsArchived;
    blockedByRegression.push(...cycle.blockedByRegression);

    // A retry is progress on its own: loop again so the retried task runs.
    if (cycle.tasksRun === 0 && cycle.retried === 0) {
      break;
    }
  }

  return {
    tasksRun: totalTasksRun,
    retried: totalRetried,
    specsArchived: totalSpecsArchived,
    blockedByRegression,
  };
}

export async function startWatcher(
  projectRoot: string,
  config: OsqConfig,
  adapter: HarnessAdapter,
  options: StartWatcherOptions = {},
): Promise<void> {
  const logger = options.logger;
  const exit = options.exit ?? process.exit;
  const staleDeps = { clearStatus: () => logger?.clearStatus(), exit };

  // A checkout running a stale compiled build is a footgun: refuse before the
  // first cycle unless the caller opted out or is executing from source. The
  // start check also captures the current `dist/` mtime for every later pass.
  let staleCheck: StaleCheck | undefined;
  try {
    staleCheck = await startStaleCheck(options);
  } catch (err) {
    if (handleStaleBuild(err, staleDeps)) {
      return;
    }
    throw err;
  }

  // Invoke the selected adapter's optional preflight port directly. There is no
  // harness-name gate and no adapter-specific fallback: the adapter either owns
  // its preflight or the watcher proceeds. Catalogued harnesses that declare no
  // external executable have no process to probe, so their port is not invoked
  // even when a caller supplies a preflight implementation.
  const selected = findHarness(config.harness);
  if (adapter.preflight && selected && selected.executable(config) !== null) {
    await adapter.preflight(projectRoot, config);
  }

  if (options.once) {
    try {
      await runWatcherOnce(projectRoot, config, adapter, logger, staleCheck);
    } catch (err) {
      if (handleStaleBuild(err, staleDeps)) {
        return;
      }
      throw err;
    }
    return;
  }

  const useSymbols = logger?.symbols === true;
  let interrupted = false;
  let stopped = false;
  let isRunningCycle = false;
  let intervalId: NodeJS.Timeout | null = null;
  let watcher: ReturnType<typeof watch> | null = null;

  let onSigint: () => void = () => {};

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    if (intervalId) clearInterval(intervalId);
    watcher?.close().catch(() => {});
    process.removeListener('SIGINT', onSigint);
  };

  onSigint = () => {
    if (interrupted) {
      process.exit(EXIT_SIGINT);
    }
    interrupted = true;
    logger?.clearStatus();
    if (logger?.interactive) {
      process.stderr.write(SHOW_CURSOR);
    }
    logger?.info('waiting for running task to exit (press Ctrl+C again to kill)');
    if (!isRunningCycle) {
      stop();
    }
  };

  process.on('SIGINT', onSigint);

  const cycleHandler = async (): Promise<void> => {
    if (interrupted || stopped || isRunningCycle) return;
    isRunningCycle = true;
    try {
      await runWatcherCycle(projectRoot, config, adapter, logger, staleCheck);
    } catch (err) {
      if (err instanceof StaleBuildError) {
        stop();
      }
      if (handleStaleBuild(err, staleDeps)) {
        return;
      }
      logWatcherError(logger, useSymbols, err);
    } finally {
      isRunningCycle = false;
      if (interrupted) stop();
    }
  };

  if (options.signal) {
    if (options.signal.aborted) {
      stop();
      return;
    }
    options.signal.addEventListener('abort', stop);
  }

  await cycleHandler();
  if (interrupted || stopped) return;

  const trees = await changeTrees(projectRoot, config);
  watcher = watch(
    trees.map((tree) => tree.changesDir),
    { ignoreInitial: true, depth: 3 },
  );

  watcher.on('all', () => {
    cycleHandler().catch(() => {});
  });

  intervalId = setInterval(() => {
    cycleHandler().catch(() => {});
  }, options.pollIntervalMs || 1000);
}
