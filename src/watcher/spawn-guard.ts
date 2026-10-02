import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../harness/types.js';
import { startProviderStallWatch } from './provider-outage.js';

/** Run an adapter's `spawn`, turning a throw or rejection into a crashed result. */
export async function spawnOrCrash(
  adapter: HarnessAdapter,
  options: SpawnTaskOptions,
): Promise<SpawnResult> {
  let pid: number | undefined;
  const onSpawn = options.onSpawn;
  const stopStallWatch = startProviderStallWatch({
    specFolderPath: options.specFolderPath,
    taskNumber: options.taskNumber,
    stallSeconds: options.config?.gates?.providerStallSeconds ?? 300,
    heartbeatSeconds: options.config?.log?.heartbeatSeconds ?? 60,
    pid: () => pid,
  });
  try {
    return await adapter.spawn({
      ...options,
      onSpawn: async (spawnedPid, details) => {
        pid = spawnedPid;
        await onSpawn?.(spawnedPid, details);
      },
    });
  } catch (error) {
    return { exitCode: -1, error: error instanceof Error ? error.message : String(error) };
  } finally {
    stopStallWatch();
  }
}
