import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { watch } from 'chokidar';
import type { OsqConfig } from '../core/config.js';
import { reapStaleLocks } from '../core/lock.js';
import { type Logger, resolveSymbol } from '../core/logger.js';
import { compareNumericPrefix, deriveSpecState } from '../core/state.js';
import { preflightOpencode } from '../harness/opencode.js';
import type { HarnessAdapter } from '../harness/types.js';
import { checkAndArchiveSpec } from './archiver.js';
import { runTask } from './runner.js';

const SHOW_CURSOR = '\x1b[?25h';
const EXIT_SIGINT = 130;

export interface WatcherSummary {
  tasksRun: number;
  specsArchived: number;
}

export interface StartWatcherOptions {
  once?: boolean;
  pollIntervalMs?: number;
  signal?: AbortSignal;
  logger?: Logger;
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
 * Single idle status line: the watched spec directory, how many approved specs
 * are still waiting, and when the last spec was archived. Pure so the exact
 * shape is testable without a watcher.
 */
export function formatIdleStatus(
  specsDir: string,
  approvedWaiting: number,
  lastArchived?: ArchivedSpecSummary,
  now: number = Date.now(),
): string {
  const last = lastArchived
    ? `last: ${lastArchived.id} archived ${formatAgo(now - lastArchived.archivedAt)}`
    : 'last: none';
  return `watching ${specsDir} · ${approvedWaiting} approved waiting · ${last}`;
}

/**
 * Most recently archived spec folder, derived from the archive directory's
 * modification times so the idle status survives a watcher restart.
 */
export async function findLatestArchivedSpec(
  projectRoot: string,
  config: OsqConfig,
): Promise<ArchivedSpecSummary | undefined> {
  const archiveDir = path.join(projectRoot, config.paths.archive);

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

export async function runWatcherCycle(
  projectRoot: string,
  config: OsqConfig,
  adapter: HarnessAdapter,
  logger?: Logger,
): Promise<WatcherSummary> {
  const useSymbols = logger?.symbols === true;
  const tag = (symbol: string, word: string): string => resolveSymbol(symbol, word, useSymbols);

  const specsDir = path.join(projectRoot, config.paths.specs);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(specsDir);
  } catch {
    logger?.status(formatIdleStatus(config.paths.specs, 0));
    return { tasksRun: 0, specsArchived: 0 };
  }

  const specFolders = entries
    .filter((e) => !e.startsWith('_') && e !== 'archive')
    .sort(compareNumericPrefix);

  let tasksRun = 0;
  let specsArchived = 0;
  let approvedWaiting = 0;

  for (const folder of specFolders) {
    const folderPath = path.join(specsDir, folder);
    try {
      const stat = await fs.stat(folderPath).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      await reapStaleLocks(folderPath, config.timeouts.staleLockSeconds);

      const specState = await deriveSpecState(projectRoot, folderPath);

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
          const archived = await checkAndArchiveSpec(projectRoot, folderPath, config);
          if (archived) {
            specsArchived++;
            logger?.info(`${tag('✓ spec', '[archived]')} ${specState.id} archived (${folder})`);
          }
        } else {
          logger?.info(
            `${tag('■ spec', '[halted]')} ${specState.id} halted (task ${taskNumber} dead)`,
          );
        }
      } else if (specState.status === 'done') {
        const archived = await checkAndArchiveSpec(projectRoot, folderPath, config);
        if (archived) {
          specsArchived++;
          logger?.info(`${tag('✓ spec', '[archived]')} ${specState.id} archived (${folder})`);
        }
      }
    } catch (err) {
      logWatcherError(logger, useSymbols, err);
    }
  }

  if (tasksRun === 0) {
    const lastArchived = await findLatestArchivedSpec(projectRoot, config).catch(() => undefined);
    logger?.status(formatIdleStatus(config.paths.specs, approvedWaiting, lastArchived));
  }

  return { tasksRun, specsArchived };
}

export async function runWatcherOnce(
  projectRoot: string,
  config: OsqConfig,
  adapter: HarnessAdapter,
  logger?: Logger,
): Promise<WatcherSummary> {
  let totalTasksRun = 0;
  let totalSpecsArchived = 0;

  while (true) {
    const cycle = await runWatcherCycle(projectRoot, config, adapter, logger);
    totalTasksRun += cycle.tasksRun;
    totalSpecsArchived += cycle.specsArchived;

    if (cycle.tasksRun === 0) {
      break;
    }
  }

  return { tasksRun: totalTasksRun, specsArchived: totalSpecsArchived };
}

export async function startWatcher(
  projectRoot: string,
  config: OsqConfig,
  adapter: HarnessAdapter,
  options: StartWatcherOptions = {},
): Promise<void> {
  const logger = options.logger;

  if (adapter.name === 'opencode' || config.harness === 'opencode') {
    if (adapter.preflight) {
      await adapter.preflight(projectRoot, config);
    } else {
      await preflightOpencode(projectRoot, config);
    }
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

  const specsDir = path.join(projectRoot, config.paths.specs);
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
