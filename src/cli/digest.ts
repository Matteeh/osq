import fs from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';
import {
  type ChangeDigest,
  DigestSelectionError,
  buildChangeDigest,
} from '../core/report/change-digest.js';
import { formatDigestMarkdown } from '../core/report/digest-markdown.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';
import { serializeSortedJson } from './report.js';

export interface DigestCommandOptions extends CommandInputs {
  readonly ids: readonly string[];
  readonly since?: string;
  readonly until?: string;
  readonly json?: boolean;
  readonly out?: string;
  readonly cost?: boolean;
}

/**
 * Prints the digest of the selected archived changes. A selection refusal
 * becomes a {@link CommandError} carrying the same message.
 */
export async function digestCommand(options: DigestCommandOptions): Promise<string> {
  const inputs = resolveInputs(options);
  const config = await inputs.config();

  let digest: ChangeDigest;
  try {
    digest = await buildChangeDigest(inputs.cwd, config, {
      ids: options.ids,
      since: options.since ?? null,
      until: options.until ?? null,
      cost: options.cost ?? true,
    });
  } catch (error) {
    if (error instanceof DigestSelectionError) throw new CommandError(error.message);
    throw error;
  }

  const output = options.json ? serializeSortedJson(digest) : formatDigestMarkdown(digest);
  if (options.out !== undefined) {
    await fs.writeFile(path.resolve(inputs.cwd, options.out), `${output}\n`, 'utf8');
    return output;
  }
  inputs.stdout(`${output}\n`);
  return output;
}

/** Register `osq digest` on the root program. */
export function registerDigestCommand(program: Command): void {
  program
    .command('digest [ids...]')
    .description('print a Markdown or JSON digest of archived changes')
    .option('--since <date>', 'start of the archived date range')
    .option('--until <date>', 'end of the archived date range')
    .option('--json', 'print the digest as JSON')
    .option('--out <file>', 'write the digest to a file instead of stdout')
    .option('--no-cost', 'leave out cost and executor models')
    .action(
      async (
        ids: string[],
        options: {
          since?: string;
          until?: string;
          json?: boolean;
          out?: string;
          cost?: boolean;
        },
      ) => {
        await digestCommand({ ...options, ids });
      },
    );
}
