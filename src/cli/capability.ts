import fs from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';
import { readMoveMap } from '../core/spec/capability-move-map.js';
import {
  type CapabilityMove,
  type CapabilityMoveResult,
  generateCapabilityMove,
} from '../core/spec/capability-move.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, type Writer, resolveInputs } from './command-inputs.js';

/** The command inputs plus the id of the unapproved change to write into. */
export interface CapabilityCommandOptions extends CommandInputs {
  readonly change: string;
}

/** Wrap any failure as the `Error: ` prefixed `CommandError` `runCli` prints. */
function asFailure(error: unknown): CommandError {
  const message = error instanceof Error ? error.message : String(error);
  return new CommandError(`Error: ${message}`);
}

/** Print each written path, then the count of files outside the specs. */
function report(result: CapabilityMoveResult, old: string, stdout: Writer): void {
  for (const rel of result.written) {
    stdout(`wrote ${rel}\n`);
  }
  stdout(`${result.naming.length} file(s) outside the specs name ${old}; proposal.md lists them\n`);
}

/**
 * Generate the deltas that move every requirement of `old` onto `new` inside an
 * unapproved change. Prints each written path and the naming-file count to
 * stdout; any failure, a config load included, throws a `CommandError` whose
 * message is `Error: <message>`.
 *
 * @scenario cli-foundation: Rename through the CLI
 * @adr 014
 */
export async function capabilityRenameCommand(
  old: string,
  next: string,
  options: CapabilityCommandOptions,
): Promise<void> {
  const inputs = resolveInputs(options);
  try {
    const config = await inputs.config();
    const move: CapabilityMove = { kind: 'rename', from: old, to: next };
    const result = await generateCapabilityMove(inputs.cwd, config, options.change, move);
    report(result, old, inputs.stdout);
  } catch (error) {
    throw asFailure(error);
  }
}

/**
 * Generate the deltas that move the requirements a YAML map assigns out of
 * `old` inside an unapproved change. The map is read relative to the working
 * directory inside the error handling, so a missing or malformed map throws the
 * same `Error: <message>` `CommandError` every failure does.
 *
 * @scenario cli-foundation: Split through the CLI
 * @scenario cli-foundation: Missing map file
 * @adr 014
 */
export async function capabilitySplitCommand(
  old: string,
  mapFile: string,
  options: CapabilityCommandOptions,
): Promise<void> {
  const inputs = resolveInputs(options);
  try {
    const config = await inputs.config();
    const text = await fs.readFile(path.resolve(inputs.cwd, mapFile), 'utf8');
    const move: CapabilityMove = { kind: 'split', from: old, targets: readMoveMap(text) };
    const result = await generateCapabilityMove(inputs.cwd, config, options.change, move);
    report(result, old, inputs.stdout);
  } catch (error) {
    throw asFailure(error);
  }
}

/**
 * Register `osq capability rename <old> <new> --change <id>` and
 * `osq capability split <old> --map <file> --change <id>` on the root program.
 *
 * @scenario cli-foundation: Help group
 * @adr 014
 */
export function registerCapabilityCommand(program: Command): void {
  const capability = program
    .command('capability')
    .description('generate the deltas that rename or split a capability into a change');
  capability
    .command('rename <old> <new>')
    .description('move every requirement of <old> to <new>')
    .requiredOption('--change <id>', 'unapproved change folder to write into')
    .action(async (old: string, next: string, options: { change: string }) => {
      await capabilityRenameCommand(old, next, { change: options.change });
    });
  capability
    .command('split <old>')
    .description('move the requirements a map file names out of <old>')
    .requiredOption('--map <file>', 'YAML map of target capabilities')
    .requiredOption('--change <id>', 'unapproved change folder to write into')
    .action(async (old: string, options: { map: string; change: string }) => {
      await capabilitySplitCommand(old, options.map, { change: options.change });
    });
}
