import fs from 'node:fs/promises';
import path from 'node:path';
import { watch } from 'chokidar';
import type { OsqConfig } from '../core/config.js';
import { reapStaleLocks } from '../core/lock.js';
import { deriveSpecState } from '../core/state.js';
import type { HarnessAdapter } from '../harness/types.js';
import { checkAndArchiveSpec } from './archiver.js';
import { runTask } from './runner.js';

export interface WatcherSummary {
  tasksRun: number;
  specsArchived: number;
}

export async function runWatcherCycle(
  projectRoot: string,
  config: OsqConfig,
  adapter: HarnessAdapter,
): Promise<WatcherSummary> {
  const specsDir = path.join(projectRoot, config.paths.specs);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(specsDir);
  } catch {
    return { tasksRun: 0, specsArchived: 0 };
  }

  const specFolders = entries.filter((e) => !e.startsWith('_') && e !== 'archive');

  let tasksRun = 0;
  let specsArchived = 0;

  for (const folder of specFolders) {
    const folderPath = path.join(specsDir, folder);
    const stat = await fs.stat(folderPath).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;

    await reapStaleLocks(folderPath, config.timeouts.staleLockSeconds);

    const specState = await deriveSpecState(projectRoot, folderPath);

    if (specState.status === 'pending' && specState.nextTask) {
      const taskResult = await runTask(
        projectRoot,
        folderPath,
        specState.nextTask.taskNumber,
        config,
        adapter,
      );
      tasksRun++;

      if (taskResult.success) {
        const archived = await checkAndArchiveSpec(projectRoot, folderPath, config);
        if (archived) {
          specsArchived++;
        }
      }
    } else if (specState.status === 'done') {
      const archived = await checkAndArchiveSpec(projectRoot, folderPath, config);
      if (archived) {
        specsArchived++;
      }
    }
  }

  return { tasksRun, specsArchived };
}

export async function runWatcherOnce(
  projectRoot: string,
  config: OsqConfig,
  adapter: HarnessAdapter,
): Promise<WatcherSummary> {
  let totalTasksRun = 0;
  let totalSpecsArchived = 0;

  while (true) {
    const cycle = await runWatcherCycle(projectRoot, config, adapter);
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
  options: { once?: boolean; pollIntervalMs?: number; signal?: AbortSignal } = {},
): Promise<void> {
  if (options.once) {
    await runWatcherOnce(projectRoot, config, adapter);
    return;
  }

  const pollInterval = options.pollIntervalMs || 1000;
  let isRunningCycle = false;

  const cycleHandler = async () => {
    if (isRunningCycle) return;
    isRunningCycle = true;
    try {
      await runWatcherCycle(projectRoot, config, adapter);
    } finally {
      isRunningCycle = false;
    }
  };

  await cycleHandler();

  const specsDir = path.join(projectRoot, config.paths.specs);
  const watcher = watch(specsDir, {
    ignoreInitial: true,
    depth: 3,
  });

  watcher.on('all', () => {
    cycleHandler().catch(() => {});
  });

  const intervalId = setInterval(() => {
    cycleHandler().catch(() => {});
  }, pollInterval);

  if (options.signal) {
    options.signal.addEventListener('abort', () => {
      clearInterval(intervalId);
      watcher.close().catch(() => {});
    });
  }
}
