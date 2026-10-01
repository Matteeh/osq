import type { Command } from 'commander';
import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import { QueryError, runQuery } from '../core/report/query-run.js';
import { CommandError } from './command-error.js';

export interface QueryCommandOptions {
  readonly cwd?: string;
  readonly stdout?: (msg: string) => void;
  readonly config?: OsqConfig;
  readonly json?: boolean;
  readonly select?: string;
}

/** Runs one history query and prints it, turning a refusal into a CommandError. */
export async function queryCommand(options: QueryCommandOptions): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const config = options.config ?? (await loadConfig(cwd));

  let output: string;
  try {
    output = await runQuery(cwd, config, options.select ?? null, { json: options.json ?? false });
  } catch (error) {
    if (error instanceof QueryError) throw new CommandError(error.message);
    throw error;
  }

  if (options.stdout) options.stdout(output);
  else console.log(output);
  return output;
}

/** Register `osq query [select]` on the root program. */
export function registerQueryCommand(program: Command): void {
  program
    .command('query [select]')
    .description('run one read-only SELECT over the osq history tables')
    .option('--json', 'print the rows as a JSON array of objects')
    .action(async (select: string | undefined, options: { json?: boolean }) => {
      await queryCommand({ ...options, select });
    });
}
