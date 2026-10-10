import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { awaitedDependencies } from '../spec/stack-dependencies.js';
import { awaitedForApproval } from '../spec/stack-overlap.js';
import { selectVcs } from '../vcs/select.js';
import type { RunsAfterEntry } from './show-types.js';

/**
 * The changes an active change runs after: `awaitedForApproval` of an
 * unapproved folder, `awaitedDependencies` of an approved one, and an empty
 * list without `vcs.enabled` or under `NoVcs`. `projectRoot` is the checkout's
 * project root, never a worktree's.
 *
 * @scenario status-inspection: Show a change that runs after another
 * @scenario status-inspection: Runs after in show JSON
 */
export async function readRunsAfter(
  projectRoot: string,
  config: OsqConfig,
  folderPath: string,
): Promise<RunsAfterEntry[]> {
  if (config.vcs?.enabled !== true) return [];
  const vcs = await selectVcs(projectRoot, config);
  if (vcs.kind !== 'git') return [];

  const approved = await fs
    .access(path.join(folderPath, '.run', 'approved'))
    .then(() => true)
    .catch(() => false);
  const awaited = approved
    ? await awaitedDependencies(projectRoot, config, vcs, folderPath)
    : await awaitedForApproval(projectRoot, config, vcs, folderPath, path.basename(folderPath));
  return awaited.map((entry) => ({
    folder: entry.folder,
    capabilities: entry.overlap === undefined ? null : [...entry.overlap],
  }));
}
