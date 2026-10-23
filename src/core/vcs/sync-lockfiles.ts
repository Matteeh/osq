import fs from 'node:fs/promises';
import path from 'node:path';
import { lockRebuildCommand } from '../../kernel/languages/lockfiles.js';
import type { OsqConfig } from '../foundation/config.js';
import { runVerificationCommand } from '../run/verification.js';
import type { LocatedChange } from '../status/change-locations.js';
import { getSpecsDir } from '../status/layout.js';
import { SyncStop } from './sync-stop.js';
import type { Vcs } from './vcs.js';
import { worktreeBranch } from './worktree.js';

/** Whether `target` is `prefix` or under it. */
function isUnder(prefix: string, target: string): boolean {
  return target === prefix || target.startsWith(`${prefix}/`);
}

/** The lock files among `conflicts` that osq knows how to rebuild, in path order. */
function rebuildableLockfiles(conflicts: readonly string[]): string[] {
  return conflicts.filter((conflict) => lockRebuildCommand(conflict) !== null).sort();
}

/**
 * The conflict paths neither the living specs, the archive directory, nor a
 * rebuildable lock file owns.
 *
 * @scenario version-control: Both add a crate to one Cargo workspace
 * @scenario version-control: Lock file and code conflict
 * @scenario version-control: Lock file that cannot be rebuilt
 * @adr 017
 */
export function blockedConflicts(
  conflicts: readonly string[],
  config: OsqConfig,
  change: LocatedChange,
): string[] {
  const specs = getSpecsDir(config.paths.openspecRoot).split(path.sep).join('/');
  const archive = path.relative(change.tree.root, change.tree.archiveDir).split(path.sep).join('/');
  return conflicts.filter(
    (conflict) =>
      !isUnder(specs, conflict) &&
      !isUnder(archive, conflict) &&
      lockRebuildCommand(conflict) === null,
  );
}

/** The last `limit` non-blank lines of command output. */
function outputTail(output: string, limit: number): string {
  const lines = output.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop();
  return lines.slice(Math.max(0, lines.length - limit)).join('\n');
}

/** Put the default branch's copy of `lockfile` in the worktree. */
async function writeDefaultCopy(
  worktreeRoot: string,
  vcs: Vcs,
  defaultBranch: string,
  lockfile: string,
): Promise<void> {
  const target = path.join(worktreeRoot, lockfile);
  const content = await vcs.show(defaultBranch, lockfile);
  if (content === null) {
    await fs.rm(target, { force: true });
    return;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/**
 * Step 3's lock file rebuild: for each conflicting lock file, in path order,
 * put the default branch's copy in place, rebuild it from the change's
 * manifests with the language's offline command, and stage it. A failed
 * rebuild is a `SyncStop` with reason `sync_failed`.
 *
 * @scenario version-control: Both add a crate to one Cargo workspace
 * @scenario version-control: Lock file that cannot be rebuilt
 * @adr 017
 */
export async function rebuildLockfiles(
  worktreeRoot: string,
  change: LocatedChange,
  vcs: Vcs,
  config: OsqConfig,
  defaultBranch: string,
  conflicts: readonly string[],
): Promise<void> {
  for (const lockfile of rebuildableLockfiles(conflicts)) {
    const command = lockRebuildCommand(lockfile);
    if (command === null) continue;
    await writeDefaultCopy(worktreeRoot, vcs, defaultBranch, lockfile);
    const result = await runVerificationCommand(
      path.join(worktreeRoot, path.dirname(lockfile)),
      command,
      config.timeouts.verifyTimeoutSeconds,
      null,
      { role: 'prepare', config },
    );
    if (result.exitCode !== 0) {
      throw new SyncStop(
        'sync_failed',
        `${change.folderName}: rebuilding ${lockfile} failed on ${worktreeBranch(change.folderName)} merged with ${defaultBranch}:\n${outputTail(result.output, config.limits.cardOutputLines)}`,
      );
    }
    await vcs.stage([lockfile]);
  }
}
