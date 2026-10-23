import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import { readDependencyState } from '../core/spec/stack-dependencies.js';
import { listChanges, matchesFolder } from '../core/status/change-locations.js';
import { getQueuePath } from '../core/status/queue-parser.js';
import { selectVcs } from '../core/vcs/select.js';

/** The refusal message for a change that has already landed or archived. */
function finishedMessage(folder: string, state: string, name: string, queue: string): string {
  return `${folder} has ${state}, so osq plan ${name} has nothing to reopen. Start new work with an item in ${queue} and osq plan --next, or with osq plan <name> --brief <file>.`;
}

/** The refusal message for a bare number that names no change. */
function numberMessage(name: string): string {
  return `osq plan ${name} names no change, and a number is not a name for a new change. Plan the next queue item with osq plan --next, or start a change with osq plan <name> --brief <file> and a descriptive name.`;
}

/**
 * Throw when `name` matches an archived change in any tree, naming how to start
 * new work instead; otherwise do nothing.
 *
 * @scenario cli-foundation: Plan a finished change
 * @adr 006
 */
export async function refuseFinishedChange(
  projectRoot: string,
  config: OsqConfig,
  name: string,
): Promise<void> {
  const trimmed = name.trim();
  if (trimmed.length === 0) return;

  const archived = await listChanges(projectRoot, config, ['archived']);
  const match = archived.find((change) => matchesFolder(change.folderName, trimmed));
  if (match === undefined) return;

  const vcs = await selectVcs(projectRoot, config);
  const dependency = await readDependencyState(projectRoot, config, vcs, match.folderName);
  const state = dependency.state === 'landed' ? 'landed' : 'archived';
  const queue = path
    .relative(projectRoot, getQueuePath(projectRoot, config))
    .split(path.sep)
    .join('/');
  throw new Error(finishedMessage(match.folderName, state, trimmed, queue));
}

/**
 * Throw when `name` is all digits and matches no active, archived or rejected
 * change; otherwise do nothing.
 *
 * @scenario cli-foundation: Plan a number that names no change
 * @adr 006
 */
export async function refuseNumberName(
  projectRoot: string,
  config: OsqConfig,
  name: string,
): Promise<void> {
  const trimmed = name.trim();
  if (!/^\d+$/.test(trimmed)) return;

  const changes = await listChanges(projectRoot, config);
  if (changes.some((change) => matchesFolder(change.folderName, trimmed))) return;

  throw new Error(numberMessage(trimmed));
}

/**
 * Reject a finished change first, then a number that names none, both before
 * the brief is read or any folder is created.
 *
 * @scenario cli-foundation: Plan a finished change
 * @scenario cli-foundation: Plan a number that names no change
 * @adr 006
 */
export async function refuseUnplannableName(
  projectRoot: string,
  config: OsqConfig,
  name: string,
): Promise<void> {
  await refuseFinishedChange(projectRoot, config, name);
  await refuseNumberName(projectRoot, config, name);
}
