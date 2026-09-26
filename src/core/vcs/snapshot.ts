import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Vcs, VcsStash } from './vcs.js';

/** The git state fields the watcher compares across one task. */
export type VcsMovedField = 'head' | 'branch' | 'index' | 'stash';

/** The four git state values a `vcs_violation` event carries before and after. */
export interface VcsStateValues {
  readonly head: string | null;
  readonly branch: string | null;
  readonly index: string;
  readonly stash: readonly VcsStash[];
}

/** One hashed status entry: its porcelain code and content hash, null when deleted. */
export interface VcsFileState {
  readonly code: string;
  readonly hash: string | null;
}

/** A point-in-time read of git state plus the hashed files status lists. */
export interface VcsSnapshot {
  readonly values: VcsStateValues;
  readonly files: ReadonlyMap<string, VcsFileState>;
}

/** What moved between two snapshots and which status files changed during the task. */
export interface VcsComparison {
  readonly moved: VcsMovedField[];
  readonly changedFiles: string[];
}

function hashContent(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Hash one working-tree file, or null when it does not exist (a deletion). */
async function hashWorkingFile(projectRoot: string, relative: string): Promise<string | null> {
  try {
    return hashContent(await fs.readFile(path.join(projectRoot, relative)));
  } catch {
    return null;
  }
}

/**
 * Read HEAD, the index digest, the stash list, and status through the port and
 * hash every file status lists. Deleted files hash to null. This never runs git
 * itself; every read goes through the selected `Vcs`.
 */
export async function captureSnapshot(vcs: Vcs, projectRoot: string): Promise<VcsSnapshot> {
  const [head, index, stash, status] = await Promise.all([
    vcs.head(),
    vcs.indexDigest(),
    vcs.stashList(),
    vcs.status(),
  ]);
  const files = new Map<string, VcsFileState>();
  await Promise.all(
    status.map(async (entry) => {
      const hash = await hashWorkingFile(projectRoot, entry.path);
      files.set(entry.path, { code: entry.code, hash });
    }),
  );
  return { values: { head: head.sha, branch: head.branch, index, stash }, files };
}

function sameStash(before: readonly VcsStash[], after: readonly VcsStash[]): boolean {
  if (before.length !== after.length) return false;
  return before.every((entry, index) => {
    const other = after[index];
    return other !== undefined && entry.sha === other.sha && entry.branch === other.branch;
  });
}

/** Paths listed before or after whose status code or content hash differs. */
function diffChangedFiles(
  before: ReadonlyMap<string, VcsFileState>,
  after: ReadonlyMap<string, VcsFileState>,
): string[] {
  const changed: string[] = [];
  for (const file of new Set([...before.keys(), ...after.keys()])) {
    const previous = before.get(file) ?? null;
    const current = after.get(file) ?? null;
    if (previous === null || current === null) {
      changed.push(file);
    } else if (previous.code !== current.code || previous.hash !== current.hash) {
      changed.push(file);
    }
  }
  return changed.sort();
}

/** Compare two captures into the moved state fields and the changed status files. */
export function compareSnapshots(before: VcsSnapshot, after: VcsSnapshot): VcsComparison {
  const moved: VcsMovedField[] = [];
  if (before.values.head !== after.values.head) moved.push('head');
  if (before.values.branch !== after.values.branch) moved.push('branch');
  if (before.values.index !== after.values.index) moved.push('index');
  if (!sameStash(before.values.stash, after.values.stash)) moved.push('stash');
  return { moved, changedFiles: diffChangedFiles(before.files, after.files) };
}
