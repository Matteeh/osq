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
