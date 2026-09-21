import { type OsqConfig, loadConfig } from '../core/config.js';
import { formatQueue, projectQueue } from '../core/queue.js';

export interface QueueCommandOptions {
  cwd?: string;
  stdout?: (msg: string) => void;
  config?: OsqConfig;
}

/** Thin CLI wrapper: load config, project the read-only queue, and print it. */
export async function queueCommand(options: QueueCommandOptions = {}): Promise<string> {
  const cwd = options.cwd || process.cwd();
  const config = options.config || (await loadConfig(cwd));

  try {
    const projection = await projectQueue(cwd, config);
    const formatted = formatQueue(projection);
    if (options.stdout) {
      options.stdout(formatted);
    } else {
      console.log(formatted);
    }
    return formatted;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Queue error: ${message}`);
    process.exit(1);
  }
}
