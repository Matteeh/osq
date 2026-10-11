import type { DatabaseSync } from 'node:sqlite';
import type { Command } from 'commander';
import { QueryError, runQuery } from '../core/report/query-run.js';
import { buildHistoryTables } from '../core/report/query-tables.js';
import {
  type TrialLabelKind,
  readTrialLabels,
  writeTrialLabels,
} from '../core/report/trial-labels.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';

export interface QueryCommandOptions extends CommandInputs {
  readonly json?: boolean;
  readonly select?: string;
}

export interface LabelCommandOptions extends CommandInputs {
  readonly id: string;
  readonly value: string;
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

/** Whether one table holds a row with `id`. */
function tableHasId(db: DatabaseSync, table: string, id: string): boolean {
  return db.prepare(`SELECT 1 AS present FROM ${table} WHERE id = ? LIMIT 1`).get(id) !== undefined;
}

/**
 * Records one label for an id in `validator_findings`, `mutation_survivors` or
 * `link_findings`, writing the trial's committed file under the openspec root.
 *
 * @scenario metrics-and-reporting: Labelling items
 * @adr 008
 */
export const labelCommand = async (options: LabelCommandOptions): Promise<string> => {
  const { id, value } = options;
  if (value !== 'true' && value !== 'false') {
    throw new CommandError('label must be true or false');
  }
  const inputs = resolveInputs(options);

  let kind: TrialLabelKind | null = null;
  try {
    const config = await inputs.config();
    const db = await buildHistoryTables(inputs.cwd, config);
    try {
      if (tableHasId(db, 'validator_findings', id)) kind = 'validator';
      else if (tableHasId(db, 'mutation_survivors', id) || tableHasId(db, 'link_findings', id)) {
        kind = 'traceability';
      }
    } finally {
      db.close();
    }
    if (kind === null) {
      throw new CommandError(
        `no validator finding, mutation survivor or link finding has id ${id}`,
      );
    }
    const labels = await readTrialLabels(inputs.cwd, config);
    const existing = kind === 'validator' ? labels.validator : labels.traceability;
    const merged = new Map(existing);
    merged.set(id, value === 'true');
    const relativePath = await writeTrialLabels(inputs.cwd, config, kind, merged);
    const output = `${id}: ${value} in ${relativePath}`;
    inputs.stdout(`${output}\n`);
    return output;
  } catch (error) {
    if (error instanceof QueryError) throw new CommandError(error.message);
    throw error;
  }
};

/** Register `osq query [select]` and `osq label <id> <value>` on the root program. */
export function registerQueryCommand(program: Command): void {
  program
    .command('query [select]')
    .description('run one read-only SELECT over the osq history tables')
    .option('--json', 'print the rows as a JSON array of objects')
    .action(async (select: string | undefined, options: { json?: boolean }) => {
      await queryCommand({ ...options, select });
    });

  program
    .command('label <id> <value>')
    .description('label a validator finding, mutation survivor or link finding true or false')
    .action(async (id: string, value: string) => {
      await labelCommand({ id, value });
    });
}
