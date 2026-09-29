import type { Command } from 'commander';
import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import { syncChange } from '../core/vcs/sync-change.js';

export interface SyncCommandOptions {
  cwd?: string;
  config?: OsqConfig;
  stdout?: (msg: string) => void;
  stderr?: (msg: string) => void;
  /** Injectable process exit; defaults to setting `process.exitCode`. */
  exit?: (code: number) => void;
}

/**
 * Take the default branch into a change's branch. Prints the result line to
 * stdout and the sync's progress to stderr. A refusal or a stop prints only
 * its message to stderr and exits one.
 */
export async function syncCommand(id: string, options: SyncCommandOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const stdout = options.stdout ?? ((msg: string) => process.stdout.write(msg));
  const stderr = options.stderr ?? ((msg: string) => process.stderr.write(msg));
  const exit =
    options.exit ??
    ((code: number) => {
      process.exitCode = code;
    });

  try {
    const config = options.config || (await loadConfig(cwd));
    const line = await syncChange(cwd, config, id, (progress) => stderr(`${progress}\n`));
    stdout(`${line}\n`);
    exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`${message}\n`);
    exit(1);
  }
}

/** Register `osq sync <id>` on the root program. */
export function registerSyncCommand(program: Command): void {
  program
    .command('sync <id>')
    .description("merge the default branch into a change's branch")
    .action(async (id: string) => {
      await syncCommand(id);
    });
}
