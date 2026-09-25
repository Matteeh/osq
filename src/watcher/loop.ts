import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { watch } from 'chokidar';
import type { OsqConfig } from '../core/foundation/config.js';
import { findHarness } from '../core/foundation/harness-catalog.js';
import { type Logger, resolveSymbol } from '../core/foundation/logger.js';
import { reapStaleLocks } from '../core/run/lock.js';
import type { StaleTaskAudit } from '../core/run/scope-hash.js';
import { resolveChangeDoc } from '../core/spec/parser.js';
import { getArchiveDir, getChangesDir, isActiveChangeFolderName } from '../core/status/layout.js';
import { compareNumericPrefix, deriveSpecState, readChangeFolder } from '../core/status/state.js';
import type { HarnessAdapter } from '../harness/types.js';
import { checkAndArchiveSpec } from './archiver.js';
import { runAutomaticRetries } from './auto-retry.js';
import { type BuildInfo, checkStaleBuild, resolveBuildInfo } from './build.js';
import { formatReapedMarker, recordDeadEvent, writeDeadMarker } from './outcome.js';
import { auditScopeRegressions } from './regression.js';
import { runTask } from './runner.js';

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
  const archiveDir = getArchiveDir(config.paths.openspecRoot, projectRoot);

  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(archiveDir, { withFileTypes: true });
  } catch {
    return undefined;
  }

  let latest: ArchivedSpecSummary | undefined;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const stat = await fs.stat(path.join(archiveDir, entry.name)).catch(() => null);
    if (!stat) continue;
    const summary: ArchivedSpecSummary = {
      id: entry.name.match(/^(\d+)/)?.[1] ?? entry.name,
      folder: entry.name,
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
): Promise<WatcherSummary> {
  const useSymbols = logger?.symbols === true;
  const tag = (symbol: string, word: string): string => resolveSymbol(symbol, word, useSymbols);

  // Resolved once per cycle (and cached in `build.ts`) so both the missing-specs
  // branch and the idle status row carry osq's own identity.
  const buildInfo = await resolveBuildInfo();

  const specsDir = getChangesDir(config.paths.openspecRoot, projectRoot);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(specsDir);
  } catch {
    logger?.status(
      formatIdleStatus(
        getChangesDir(config.paths.openspecRoot),
        0,
        undefined,
        undefined,
        buildInfo,
      ),
    );
    return { tasksRun: 0, retried: 0, specsArchived: 0, blockedByRegression: [] };
  }

  const specFolders = entries.filter((e) => isActiveChangeFolderName(e)).sort(compareNumericPrefix);

  let tasksRun = 0;
  let retried = 0;
  let specsArchived = 0;
  let approvedWaiting = 0;
  const blockedByRegression: {
    id: string;
    outcome: 'blocked_by_regression';
    tasks: readonly string[];
  }[] = [];

  const archiveCompletedSpec = async (
    folder: string,
    folderPath: string,
    specId: string,
  ): Promise<void> => {
    // Read the manual steps while the folder still exists: the archive move
    // relocates it, and this task never performs those steps itself.
    const humanSteps = await readHumanSteps(folderPath);
    const archived = await checkAndArchiveSpec(projectRoot, folderPath, config);
    if (!archived) {
      return;
    }
    specsArchived++;
    logger?.info(`${tag('✓ spec', '[archived]')} ${specId} archived (${folder})`);
    if (humanSteps) {
      logger?.info(`Human steps after completion:\n${humanSteps}`);
    }
  };

  for (const folder of specFolders) {
    const folderPath = path.join(specsDir, folder);
    try {
      const stat = await fs.stat(folderPath).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      // The reaper only detects and unlinks expired locks; the watcher owns the
      // dead marker and event so every artifact is written through outcome.ts.
      const runDir = path.join(folderPath, '.run');
      const reapedLocks = await reapStaleLocks(folderPath, config.timeouts.staleLockSeconds);
      for (const reaped of reapedLocks) {
        await writeDeadMarker(
          runDir,
          reaped.taskNumber,
          formatReapedMarker(reaped.reason, reaped.pid, reaped.startedAt),
          projectRoot,
        );
        await recordDeadEvent(folderPath, reaped.taskNumber, reaped.reason);
      }

      let specState = deriveSpecState(await readChangeFolder(projectRoot, folderPath));

      // The automatic-retry decision runs from disk for every approved change
      // after reaping and before the next task is picked. Renaming the active
      // dead marker is the commit point, so a restart loses no retry.
      if (specState.approvedHash) {
        const count = await runAutomaticRetries(projectRoot, folderPath, config, logger);
        if (count > 0) {
          retried += count;
          specState = deriveSpecState(await readChangeFolder(projectRoot, folderPath));
        }
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
        const taskNumber = specState.nextTask.taskNumber;
        logger?.info(`${tag('▶ spec', '[spec]')} ${specState.id} picked up (${folder})`);

        // Pre-dispatch scope audit runs before any lock: every earlier
        // automated done task is compared in one pass, stale tasks are
        // verified and recorded, and the upcoming task stays untouched.
        const earlier = specState.tasks
          .map((task) => task.taskNumber)
          .filter((number) => Number.parseInt(number, 10) < Number.parseInt(taskNumber, 10));
        const audit = await auditScopeRegressions({
          projectRoot,
          specFolderPath: folderPath,
          eligibleTaskNumbers: earlier,
          verifyTimeoutSeconds: config.timeouts.verifyTimeoutSeconds ?? 600,
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

        const taskResult = await runTask(
          projectRoot,
          folderPath,
          taskNumber,
          config,
          adapter,
          logger,
        );
        tasksRun++;

        if (taskResult.success) {
          await archiveCompletedSpec(folder, folderPath, specState.id);
        } else {
          logger?.info(
            `${tag('■ spec', '[halted]')} ${specState.id} halted (task ${taskNumber} dead)`,
          );
        }
      } else if (specState.status === 'done') {
        await archiveCompletedSpec(folder, folderPath, specState.id);
      }
    } catch (err) {
      logWatcherError(logger, useSymbols, err);
    }
  }

  if (tasksRun === 0) {
    const lastArchived = await findLatestArchivedSpec(projectRoot, config).catch(() => undefined);
    logger?.status(
      formatIdleStatus(
        getChangesDir(config.paths.openspecRoot),
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
    const cycle = await runWatcherCycle(projectRoot, config, adapter, logger);
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

  // A checkout running a stale compiled build is a footgun: refuse before the
  // first cycle unless the caller opted out or is executing from source.
  if (!options.allowStale && !options.dev) {
    await checkStaleBuild({ allowStale: options.allowStale });
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
    await runWatcherOnce(projectRoot, config, adapter, logger);
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
      await runWatcherCycle(projectRoot, config, adapter, logger);
    } catch (err) {
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

  const specsDir = getChangesDir(config.paths.openspecRoot, projectRoot);
  watcher = watch(specsDir, {
    ignoreInitial: true,
    depth: 3,
  });

  watcher.on('all', () => {
    cycleHandler().catch(() => {});
  });

  intervalId = setInterval(() => {
    cycleHandler().catch(() => {});
  }, options.pollIntervalMs || 1000);
}
