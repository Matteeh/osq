import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../harness/types.js';

/** Run an adapter's `spawn`, turning a throw or rejection into a crashed result. */
export async function spawnOrCrash(
  adapter: HarnessAdapter,
  options: SpawnTaskOptions,
): Promise<SpawnResult> {
  try {
    return await adapter.spawn(options);
  } catch (error) {
    return { exitCode: -1, error: error instanceof Error ? error.message : String(error) };
  }
}
