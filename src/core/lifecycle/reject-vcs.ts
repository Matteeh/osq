import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { formatCommitMessage } from '../run/commit-message.js';
import type { ChangeTree } from '../status/change-locations.js';
import { selectVcs } from '../vcs/select.js';
import type { VcsStatusEntry } from '../vcs/vcs.js';

/** What a rejection did to the change's worktree. */
export interface WorktreeRejection {
  readonly path: string;
  readonly removed: boolean;
  /** Why the worktree was kept; absent when it was removed. */
  readonly why?: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The repository-root-relative, POSIX form of an absolute path. */
function relativeToRoot(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join('/');
}

/** Whether `candidate` is `prefix` itself or lies under it. */
function under(candidate: string, prefix: string): boolean {
  return candidate === prefix || candidate.startsWith(`${prefix}/`);
}

/** Every status path under one of the rejected change's two folders, sorted. */
function rejectedStatusPaths(
  entries: readonly VcsStatusEntry[],
  prefixes: readonly string[],
): string[] {
  const selected = new Set<string>();
  for (const entry of entries) {
    for (const candidate of [entry.path, entry.from]) {
      if (candidate !== undefined && prefixes.some((prefix) => under(candidate, prefix))) {
        selected.add(candidate);
      }
    }
  }
  return [...selected].sort();
}

/** Whether status lists anything outside the two rejected folders. */
function hasOtherChanges(entries: readonly VcsStatusEntry[], prefixes: readonly string[]): boolean {
  return entries.some((entry) => {
    const candidates = [entry.path, entry.from].filter(
      (value): value is string => value !== undefined,
    );
    return candidates.some((candidate) => !prefixes.some((prefix) => under(candidate, prefix)));
  });
}

/**
 * Commit a rejected change's move in its worktree, then remove the worktree
 * when it is clean. The rejection record is already written, so a failed
 * commit, leftover changes, or a failed removal keeps the worktree and reports
 * why instead of throwing. Returns null when git cannot be selected.
 */
export async function commitRejectedWorktree(
  tree: ChangeTree,
  config: OsqConfig,
  specId: string,
  sourcePath: string,
  destinationPath: string,
  reason: string,
): Promise<WorktreeRejection | null> {
  const vcs = await selectVcs(tree.root, config);
  if (vcs.kind !== 'git') return null;
  const root = (await vcs.root()) ?? tree.root;

  const author = config.vcs?.author;
  if (author === undefined || author.trim() === '') {
    return { path: root, removed: false, why: 'vcs.author is required to commit a rejection' };
  }

  const oldFolder = relativeToRoot(root, sourcePath);
  const rejectedFolder = relativeToRoot(root, destinationPath);
  const prefixes = [oldFolder, rejectedFolder];

  try {
    const paths = rejectedStatusPaths(await vcs.status(), prefixes);
    const message = formatCommitMessage({
      subject: `osq: ${specId} rejected`,
      title: reason,
      outcomeLine: `rejected to ${rejectedFolder}`,
      trailers: [{ key: 'Osq-Change', value: path.basename(sourcePath) }],
    });
    await vcs.commit(paths, message, author);
  } catch (err) {
    return { path: root, removed: false, why: errorMessage(err) };
  }

  if (hasOtherChanges(await vcs.status(), prefixes)) {
    return { path: root, removed: false, why: 'the worktree has other changes' };
  }

  try {
    await vcs.worktreeRemove(root);
    return { path: root, removed: true };
  } catch (err) {
    return { path: root, removed: false, why: errorMessage(err) };
  }
}
