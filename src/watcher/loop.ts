import fs from 'node:fs/promises';
import path from 'node:path';
import { watch } from 'chokidar';
import type { OsqConfig } from '../core/foundation/config.js';
import { findHarness } from '../core/foundation/harness-catalog.js';
import { type Logger, resolveSymbol } from '../core/foundation/logger.js';
import { reapStaleLocks } from '../core/run/lock.js';
import {
  type LocatedChange,
  changeTrees,
  changesDirLabel,
  listChanges,
} from '../core/status/change-locations.js';
import { deriveSpecState, readChangeFolder } from '../core/status/state.js';
import type { SpecState } from '../core/status/state.js';
import type { HarnessAdapter } from '../harness/types.js';
import { archiveCompletedSpec } from './archive-change.js';
import { restoreArchiveSpecs } from './archive-specs.js';
import { runAutomaticRetries } from './auto-retry.js';
import { type AutoSteerOptions, type SteeringPromptBuilder, runAutoSteer } from './auto-steer.js';
import { type AutopilotCommands, runAutopilotPass } from './autopilot.js';
import { type BuildInfo, StaleBuildError, resolveBuildInfo } from './build.js';
import { type ChangeLaneContext, logWatcherError, runChangeLane } from './change-lane.js';
import { catchUpWorktreeCommits } from './commit-catch-up.js';
import { ChangeLanes } from './lanes.js';
import { formatReapedMarker, recordDeadEvent, writeDeadMarker } from './outcome.js';
import { BuildWaitError } from './service-build.js';
import { runStackedChanges } from './stack-run.js';
import {
  type StaleCheck,
  assertNotStale,
  handleStaleBuild,
  startStaleCheck,
} from './stale-pass.js';
import { checkSync } from './sync-run.js';
import { findActivePause, removePassedPauses } from './usage-pause.js';
import { commitPendingVerifiedTasks, commitWorktreeDeadTask } from './worktree-commit.js';
import { approvalCommitted, checkWorktree, haltWorktreeChange } from './worktree-run.js';

export { extractHumanSteps } from './archive-change.js';

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
  /** A service worker's build check, used in place of the stale checks. */
  buildCheck?: StaleCheck;
  /** Builds the steering prompt the automatic planner runs on. */
  steeringPrompt?: SteeringPromptBuilder;
  /** Autopilot's command functions; the pass runs only when it is given. */
  autopilot?: AutopilotCommands;
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

/** What one cycle shares with the helpers that prepare and start its lanes. */
interface CycleContext {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  readonly adapter: HarnessAdapter;
  readonly logger?: Logger;
  readonly staleCheck?: StaleCheck;
  readonly activeChanges: readonly LocatedChange[];
  readonly steer: AutoSteerOptions;
  readonly lanes: ChangeLanes;
}

/** What one change contributed to the cycle's summary. */
interface ChangeAdvance {
  readonly retried: number;
  readonly approvedWaiting: number;
  readonly specsArchived: number;
}

const ZERO_ADVANCE: ChangeAdvance = { retried: 0, approvedWaiting: 0, specsArchived: 0 };

/** Reap expired locks and catch up worktree commits; false means leave the change alone. */
async function reapChange(
  change: LocatedChange,
  specId: string,
  config: OsqConfig,
  logger?: Logger,
): Promise<boolean> {
  const worktree = change.tree.worktreeFolder !== undefined;
  const runDir = path.join(change.folderPath, '.run');
  const reapedLocks = await reapStaleLocks(change.folderPath, config.timeouts.staleLockSeconds);
  for (const reaped of reapedLocks) {
    await writeDeadMarker(
      runDir,
      reaped.taskNumber,
      formatReapedMarker(reaped.reason, reaped.pid, reaped.startedAt),
      change.tree.root,
    );
    await recordDeadEvent(change.folderPath, reaped.taskNumber, reaped.reason);
    if (worktree) {
      const halt = await commitWorktreeDeadTask(change, config, reaped.taskNumber, reaped.reason);
      if (halt) {
        await haltWorktreeChange(change, specId, halt, logger, config.limits);
        return false;
      }
    }
  }
  if (worktree && !(await catchUpWorktreeCommits(change, specId, config, logger))) {
    return false;
  }
  return true;
}

/** Retry, steer, or clean the change's worktree; null means leave it alone this cycle. */
async function reconcileChange(
  change: LocatedChange,
  context: CycleContext,
): Promise<{ specState: SpecState; retried: number } | null> {
  const { config, logger } = context;
  let specState = deriveSpecState(await readChangeFolder(change.tree.root, change.folderPath));

  // The automatic-retry decision runs from disk for every approved change
  // after reaping and before the next task is picked. Renaming the active
  // dead marker is the commit point, so a restart loses no retry.
  let retried = 0;
  if (specState.approvedHash) {
    retried = await runAutomaticRetries(change.tree.root, change.folderPath, config, logger);
    // Re-derive so a task the automatic-retry step just marked stuck is seen
    // as steering in this same cycle.
    specState = deriveSpecState(await readChangeFolder(change.tree.root, change.folderPath));
  }

  // A change that needs steering waits for `osq plan` and `osq approve`: leave
  // its folder alone so a planner can edit it. With autoSteer on the watcher
  // runs that planner once here, before it leaves the change alone.
  if (specState.steering) {
    if ((await findActivePause(context.activeChanges, Date.now())) === null) {
      await runAutoSteer(context.projectRoot, change, specState, config, {
        ...context.steer,
        logger,
      });
    }
    return null;
  }

  const worktree = change.tree.worktreeFolder !== undefined;
  // A worktree change commits its pending done tasks before any check, so a
  // commit a hook rejected is retried by `osq retry <id> change`, then the
  // clean check runs against the resulting tree.
  if (worktree && specState.status !== 'regressed') {
    // A stopped archive may have left the living specs modified and the record
    // in the worktree; put them back before the dirty check.
    await restoreArchiveSpecs(change.tree.root, change.folderPath);
    const pendingHalt = await commitPendingVerifiedTasks(change, config);
    if (pendingHalt) {
      await haltWorktreeChange(change, specState.id, pendingHalt, logger, config.limits);
      return null;
    }
    const worktreeHalt = await checkWorktree(change, config);
    if (worktreeHalt) {
      await haltWorktreeChange(change, specState.id, worktreeHalt, logger, config.limits);
      return null;
    }
    specState = deriveSpecState(await readChangeFolder(change.tree.root, change.folderPath));
  }

  return { specState, retried };
}

/** Whether the change still counts as approved and waiting in the idle status. */
function isApprovedWaiting(specState: SpecState): boolean {
  return (
    specState.approvedHash !== null &&
    (specState.status === 'pending' ||
      specState.status === 'running' ||
      specState.status === 'blocked')
  );
}

/** Wait for a free lane, then recheck and start the change's next task there. */
async function startNextTask(
  change: LocatedChange,
  initialState: SpecState,
  context: CycleContext,
): Promise<void> {
  const { config, logger, lanes } = context;
  let specState = initialState;
  await lanes.waitForSlot();
  if (lanes.isClosed()) return;
  await assertNotStale(context.staleCheck);
  // While any active change holds a pause, no change starts a task.
  if ((await findActivePause(context.activeChanges, Date.now())) !== null) {
    return;
  }
  const worktree = change.tree.worktreeFolder !== undefined;
  if (worktree && specState.tasks.every((task) => task.status !== 'done')) {
    const syncHalt = await checkSync(context.projectRoot, change, config, logger);
    if (syncHalt) {
      await haltWorktreeChange(change, specState.id, syncHalt, logger, config.limits);
      return;
    }
    specState = deriveSpecState(await readChangeFolder(change.tree.root, change.folderPath));
  }
  if (!specState.nextTask) return;
  const taskNumber = specState.nextTask.taskNumber;
  const tag = (symbol: string, word: string): string =>
    resolveSymbol(symbol, word, logger?.symbols === true);
  logger?.info(`${tag('▶ spec', '[spec]')} ${specState.id} picked up (${change.folderName})`);

  const lane: ChangeLaneContext = {
    projectRoot: context.projectRoot,
    config,
    adapter: context.adapter,
    logger,
    staleCheck: context.staleCheck,
    change,
    specState,
    taskNumber,
    lanes,
  };
  lanes.start(change.folderPath, () => runChangeLane(lane));
}

/** Prepare one change and either start its lane or archive it when it is done. */
async function advanceChange(change: LocatedChange, context: CycleContext): Promise<ChangeAdvance> {
  const specId = change.folderName.match(/^(\d+)/)?.[1] ?? change.folderName;
  const worktree = change.tree.worktreeFolder !== undefined;
  // A worktree approval is not real until its commit lands: skip until
  // `.run/approved` exists at HEAD so no later step sees a half-written seal.
  if (worktree && !(await approvalCommitted(change, context.config))) {
    return ZERO_ADVANCE;
  }
  if (!(await reapChange(change, specId, context.config, context.logger))) {
    return ZERO_ADVANCE;
  }
  const reconciled = await reconcileChange(change, context);
  if (reconciled === null) {
    return ZERO_ADVANCE;
  }
  const { specState, retried } = reconciled;
  const approvedWaiting = isApprovedWaiting(specState) ? 1 : 0;

  if (specState.status === 'pending' && specState.nextTask) {
    await startNextTask(change, specState, context);
    return { retried, approvedWaiting, specsArchived: 0 };
  }
  if (specState.status === 'done') {
    const archived = await archiveCompletedSpec(change, specState.id, {
      projectRoot: context.projectRoot,
      config: context.config,
      logger: context.logger,
      staleCheck: context.staleCheck,
    });
    return { retried, approvedWaiting, specsArchived: archived ? 1 : 0 };
  }
  return { retried, approvedWaiting, specsArchived: 0 };
}

/** Add every finished lane's outcome to the running summary. */
function collectLaneOutcomes(lanes: ChangeLanes, summary: WatcherSummary): void {
  for (const outcome of lanes.takeOutcomes()) {
    summary.tasksRun += outcome.tasksRun;
    summary.specsArchived += outcome.specsArchived;
    summary.blockedByRegression.push(...outcome.blockedByRegression);
  }
}

/** Print the idle status row when this cycle ran no task and no lane runs. */
async function emitIdleStatus(
  projectRoot: string,
  config: OsqConfig,
  logger: Logger | undefined,
  approvedWaiting: number,
  summary: WatcherSummary,
  lanes: ChangeLanes,
  buildInfo: BuildInfo,
): Promise<void> {
  if (summary.tasksRun !== 0 || lanes.count() !== 0) return;
  const lastArchived = await findLatestArchivedSpec(projectRoot, config).catch(() => undefined);
  logger?.status(
    formatIdleStatus(changesDirLabel(config), approvedWaiting, lastArchived, undefined, buildInfo),
  );
}

/** Visit every active change in order, leaving a lane's own change alone. */
async function runActiveChanges(context: CycleContext, summary: WatcherSummary): Promise<number> {
  const { activeChanges, lanes, logger } = context;
  let approvedWaiting = 0;
  for (const change of activeChanges) {
    try {
      // A change in a stacked tree starts no task; it waits for "Stacked cut"
      // to give it a worktree.
      if (change.tree.stackedFolder !== undefined) continue;
      // Every cycle leaves a change alone while its lane runs.
      if (lanes.isRunning(change.folderPath)) {
        const specState = await deriveSpecState(change.tree.root, change.folderPath).catch(
          () => null,
        );
        if (specState !== null && isApprovedWaiting(specState)) approvedWaiting++;
        continue;
      }
      const advance = await advanceChange(change, context);
      summary.retried += advance.retried;
      summary.specsArchived += advance.specsArchived;
      approvedWaiting += advance.approvedWaiting;
    } catch (err) {
      if (err instanceof StaleBuildError) throw err;
      logWatcherError(logger, logger?.symbols === true, err);
    }
  }
  return approvedWaiting;
}

/**
 * Run one watcher cycle: start a lane for each change that can take a task and
 * leave a running lane's change alone. Without `lanes` the cycle owns them and
 * waits for every one before returning.
 *
 * @scenario watcher-and-harness: Two independent changes at once
 * @scenario watcher-and-harness: The cap holds
 * @scenario watcher-and-harness: One lane runs as before
 * @scenario watcher-and-harness: A pause stops new starts
 * @scenario watcher-and-harness: Lanes outlive a cycle
 * @adr 012
 */
export async function runWatcherCycle(
  projectRoot: string,
  config: OsqConfig,
  adapter: HarnessAdapter,
  logger?: Logger,
  staleCheck?: StaleCheck,
  steer: AutoSteerOptions = {},
  lanes?: ChangeLanes,
): Promise<WatcherSummary> {
  // Resolved once per cycle (and cached in `build.ts`) so both the idle status
  // row and every change carry osq's own identity.
  const buildInfo = await resolveBuildInfo();

  const ownsLanes = lanes === undefined;
  const activeLanes = lanes ?? new ChangeLanes(config.maxConcurrency);
  const kept = activeLanes.takeError();
  if (kept !== undefined) throw kept.value;

  await runStackedChanges(projectRoot, config, logger);

  const activeChanges = await listChanges(projectRoot, config, ['active']);

  // A pause whose reset has passed ends before anything runs this cycle.
  await removePassedPauses(activeChanges, Date.now());

  const summary: WatcherSummary = {
    tasksRun: 0,
    retried: 0,
    specsArchived: 0,
    blockedByRegression: [],
  };
  const context: CycleContext = {
    projectRoot,
    config,
    adapter,
    logger,
    staleCheck,
    activeChanges,
    steer,
    lanes: activeLanes,
  };
  const approvedWaiting = await runActiveChanges(context, summary);

  collectLaneOutcomes(activeLanes, summary);
  if (ownsLanes) {
    await activeLanes.waitAll();
    collectLaneOutcomes(activeLanes, summary);
  }
  const laneError = activeLanes.takeError();
  if (laneError !== undefined) throw laneError.value;

  await emitIdleStatus(
    projectRoot,
    config,
    logger,
    approvedWaiting,
    summary,
    activeLanes,
    buildInfo,
  );
  return summary;
}

/** Run autopilot's one step after a cycle, when it is on and commands exist. */
async function runAutopilotAfter(
  projectRoot: string,
  config: OsqConfig,
  autopilot: AutopilotCommands | undefined,
  logger?: Logger,
): Promise<boolean> {
  if (autopilot === undefined || config.autopilot?.enabled !== true) return false;
  return runAutopilotPass(projectRoot, config, autopilot, { logger });
}

export async function runWatcherOnce(
  projectRoot: string,
  config: OsqConfig,
  adapter: HarnessAdapter,
  logger?: Logger,
  staleCheck?: StaleCheck,
  steer: AutoSteerOptions = {},
  autopilot?: AutopilotCommands,
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
    const cycle = await runWatcherCycle(projectRoot, config, adapter, logger, staleCheck, steer);
    totalTasksRun += cycle.tasksRun;
    totalRetried += cycle.retried;
    totalSpecsArchived += cycle.specsArchived;
    blockedByRegression.push(...cycle.blockedByRegression);

    // With autopilot on, one step runs after each cycle; a step is progress on
    // its own, so `--once` keeps cycling while autopilot is still moving.
    const took = await runAutopilotAfter(projectRoot, config, autopilot, logger);

    // A retry is progress on its own: loop again so the retried task runs.
    if (!took && cycle.tasksRun === 0 && cycle.retried === 0) {
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

/**
 * Run the watcher continuously, or once. One set of changed lanes serves every
 * continuous cycle, and stopping waits for every lane to finish.
 *
 * @scenario watcher-and-harness: Lanes outlive a cycle
 * @scenario watcher-and-harness: A new build waits for running lanes
 * @scenario watcher-and-harness: Abort waits for running lanes
 * @adr 012
 */
export async function startWatcher(
  projectRoot: string,
  config: OsqConfig,
  adapter: HarnessAdapter,
  options: StartWatcherOptions = {},
): Promise<void> {
  const logger = options.logger;
  const exit = options.exit ?? process.exit;
  const staleDeps = { clearStatus: () => logger?.clearStatus(), exit };
  // The CLI's steering prompt builder reaches every cycle through this one
  // argument, so `startWatcher` never resolves the planner itself.
  const steer: AutoSteerOptions =
    options.steeringPrompt !== undefined ? { steeringPrompt: options.steeringPrompt } : {};

  // A checkout running a stale compiled build is a footgun: refuse before the
  // first cycle unless the caller opted out or is executing from source. The
  // start check also captures the current `dist/` mtime for every later pass.
  // A service worker supplies its own build check instead, so a new or stale
  // build is handled by the check rather than by the start-time refusal.
  let staleCheck: StaleCheck | undefined;
  if (options.buildCheck) {
    staleCheck = options.buildCheck;
  } else {
    try {
      staleCheck = await startStaleCheck(options);
    } catch (err) {
      if (handleStaleBuild(err, staleDeps)) {
        return;
      }
      throw err;
    }
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
      await runWatcherOnce(
        projectRoot,
        config,
        adapter,
        logger,
        staleCheck,
        steer,
        options.autopilot,
      );
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

  // A signal-driven watcher's promise resolves only once the abort has fired
  // and no cycle or lane is in flight. A watcher without a signal resolves
  // after setup as before and never awaits this.
  let resolveStopped: () => void = () => {};
  const stoppedPromise = new Promise<void>((resolve) => {
    resolveStopped = resolve;
  });
  let onSigint: () => void = () => {};
  let settleIfStopped: () => void = () => {};
  const lanes = new ChangeLanes(config.maxConcurrency, () => settleIfStopped());
  settleIfStopped = (): void => {
    if (stopped && !isRunningCycle && lanes.count() === 0) {
      process.removeListener('SIGINT', onSigint);
      resolveStopped();
    }
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    // Stopping closes the lanes so a cycle still in flight starts no task;
    // running lanes finish, and only then does the watcher settle.
    lanes.close();
    if (intervalId) clearInterval(intervalId);
    watcher?.close().catch(() => {});
    settleIfStopped();
  };

  const finishStopped = async (): Promise<void> => {
    if (!stopped && !interrupted) return;
    if (options.signal) {
      await stoppedPromise;
      return;
    }
    await lanes.waitAll();
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
    stop();
  };

  process.on('SIGINT', onSigint);

  const cycleHandler = async (): Promise<void> => {
    if (interrupted || stopped || isRunningCycle) return;
    isRunningCycle = true;
    try {
      // A service build check runs at the top of every continuous cycle, so a
      // new or stale build is seen even while the watcher is idle.
      // Wait for every lane's task to spawn first, so a stop found here can
      // never be followed by a spawn that was already on its way.
      if (options.buildCheck && lanes.allSpawned()) {
        await assertNotStale(options.buildCheck);
      }
      await runWatcherCycle(projectRoot, config, adapter, logger, staleCheck, steer, lanes);
      await runAutopilotAfter(projectRoot, config, options.autopilot, logger);
    } catch (err) {
      // A wait ends this cycle without stopping the loop or logging an error;
      // the next cycle checks again.
      if (err instanceof BuildWaitError) {
        return;
      }
      // A stop waits for every lane, so the service never restarts under a
      // running task (ADR 012), and a lane that has not spawned yet spawns none.
      if (err instanceof StaleBuildError) {
        lanes.close();
        await lanes.waitAll();
      }
      if (handleStaleBuild(err, staleDeps)) {
        stop();
        return;
      }
      if (err instanceof StaleBuildError) {
        stop();
      }
      logWatcherError(logger, useSymbols, err);
    } finally {
      isRunningCycle = false;
      settleIfStopped();
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
  if (interrupted || stopped) {
    await finishStopped();
    return;
  }

  const trees = await changeTrees(projectRoot, config);
  // An abort can land while `changeTrees` is in flight; create neither the
  // file watcher nor the poll interval once it has, and still wait for lanes.
  if (stopped || interrupted) {
    await finishStopped();
    return;
  }
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

  // A signal-driven watcher runs until its abort fires; only then does the
  // promise resolve, once the last cycle has finished.
  if (options.signal) {
    await stoppedPromise;
  }
}
