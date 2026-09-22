import { type OsqConfig, loadConfig } from '../core/config.js';
import { retrySpec } from '../core/retry.js';

export interface RetryCommandOptions {
  cwd?: string;
  config?: OsqConfig;
}

export async function retryCommand(
  specId: string,
  target: string,
  options: RetryCommandOptions = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const config = options.config || (await loadConfig(cwd));

  try {
    const result = await retrySpec(cwd, specId, target, config);
    const label = result.target === 'change' ? 'change' : `task ${result.target}`;
    if (result.recertification === 'passed') {
      console.log(`Recertified ${result.specId} ${label} (scope regression cleared)`);
    } else if (result.recertification === 'requeued') {
      console.log(
        `Requeued ${result.specId} ${label} for agent work (next attempt: ${result.attempt})`,
      );
    } else {
      console.log(`Retried ${result.specId} ${label} (next attempt: ${result.attempt})`);
    }
    console.log(`  Reason: ${result.reason}`);
    for (const marker of result.retainedMarkers) {
      console.log(`  Retained: ${marker}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error retrying ${specId} ${target}:\n  ${message}`);
    process.exit(1);
  }
}
