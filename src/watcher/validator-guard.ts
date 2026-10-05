/**
 * The validator tree guard. Before the validator spawns, it records every path
 * `vcs.status()` lists together with its bytes. After the spawn, it puts every
 * path the validator changed back: a path recorded before gets its contents
 * back, or is removed when it did not exist then, and any other path goes
 * through `vcs.discard`. Paths under the change's own `.run/validator/` and its
 * `.run/events/validator.jsonl` are the validator's to write and are left alone.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { Vcs } from '../core/vcs/vcs.js';

/** A path `vcs.status()` did not list at all, as opposed to one that is missing. */
const UNSET = Symbol('unset');

type Recorded = Buffer | null | typeof UNSET;

/** The status-derived state of the tree: a path to its bytes, or null when absent. */
export interface ValidatorTreeSnapshot {
  readonly paths: ReadonlyMap<string, Buffer | null>;
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

/** The change's validator directory and event file, project-relative POSIX. */
function guardedSkips(projectRoot: string, specFolderPath: string): { dir: string; file: string } {
  const changeFolder = toPosix(path.relative(projectRoot, specFolderPath));
  return {
    dir: `${changeFolder}/.run/validator/`,
    file: `${changeFolder}/.run/events/validator.jsonl`,
  };
}

async function readBytes(filePath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

async function writeBytes(filePath: string, data: Buffer | null): Promise<void> {
  if (data === null) {
    await fs.rm(filePath, { force: true });
    return;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
}

/** Every path `vcs.status()` lists, mapped to its bytes or null when missing. */
async function treeState(projectRoot: string, vcs: Vcs): Promise<Map<string, Buffer | null>> {
  const state = new Map<string, Buffer | null>();
  for (const entry of await vcs.status()) {
    state.set(entry.path, await readBytes(path.resolve(projectRoot, entry.path)));
  }
  return state;
}

/** Whether a path held the same state before and after the spawn. */
function stateEqual(before: Recorded, after: Recorded): boolean {
  if (before === UNSET || after === UNSET) return before === after;
  if (before === null || after === null) return before === after;
  return before.equals(after);
}

/** Record the tree the validator is about to run against. */
export async function snapshotValidatorTree(
  projectRoot: string,
  vcs: Vcs,
): Promise<ValidatorTreeSnapshot> {
  return { paths: await treeState(projectRoot, vcs) };
}

/**
 * Put back every path the validator changed and return their project-relative
 * paths, sorted. A path recorded before the spawn gets its bytes back, or is
 * removed when it was missing then; any other path goes through `vcs.discard`.
 */
export async function restoreValidatorTree(
  projectRoot: string,
  specFolderPath: string,
  vcs: Vcs,
  snapshot: ValidatorTreeSnapshot,
): Promise<string[]> {
  const { dir, file } = guardedSkips(projectRoot, specFolderPath);
  const after = await treeState(projectRoot, vcs);
  const candidates = [...new Set([...snapshot.paths.keys(), ...after.keys()])].sort();

  const restored: string[] = [];
  const rewrite: { readonly path: string; readonly data: Buffer | null }[] = [];
  const discard: string[] = [];
  for (const relative of candidates) {
    if (relative.startsWith(dir) || relative === file) continue;
    const before: Recorded = snapshot.paths.has(relative)
      ? (snapshot.paths.get(relative) as Buffer | null)
      : UNSET;
    const current: Recorded = after.has(relative) ? (after.get(relative) as Buffer | null) : UNSET;
    if (stateEqual(before, current)) continue;
    if (before === UNSET) discard.push(relative);
    else rewrite.push({ path: relative, data: before });
    restored.push(relative);
  }

  for (const item of rewrite) await writeBytes(path.resolve(projectRoot, item.path), item.data);
  if (discard.length > 0) await vcs.discard(discard);
  return restored;
}
