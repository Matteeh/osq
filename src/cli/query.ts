import type { Command } from 'commander';
import { QueryError, runQuery } from '../core/report/query-run.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';

export interface QueryCommandOptions extends CommandInputs {
  readonly json?: boolean;
  readonly select?: string;
}

/** Runs one history query and prints it, turning a refusal into a CommandError. */
export async function queryCommand(options: QueryCommandOptions): Promise<string> {
  const inputs = resolveInputs(options);
  const config = await inputs.config();

  let output: string;
  try {
    output = await runQuery(inputs.cwd, config, options.select ?? null, {
      json: options.json ?? false,
    });
  } catch (error) {
    if (error instanceof QueryError) throw new CommandError(error.message);
    throw error;
  }

  inputs.stdout(`${output}\n`);
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
