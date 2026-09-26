import { createHash } from 'node:crypto';
import path from 'node:path';
import { hashFileContent } from '../core/run/manifest.js';
import type { Vcs } from '../core/vcs/vcs.js';

/**
 * The tree a baseline ran against: HEAD's commit plus a digest over every
 * dirty status entry outside `.run/`. Two equal keys mean a green baseline on
 * one key still covers the other tree.
 */
export interface BaselineKey {
  readonly commit: string;
  readonly treeDigest: string;
}

/** True when any segment of a project-relative path is `.run`. */
function insideRunFolder(entryPath: string): boolean {
  return entryPath.split('/').some((segment) => segment === '.run');
}

function byPath(a: { path: string }, b: { path: string }): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

/**
 * Read the baseline key under `vcs`. There is no key under `NoVcs` or when HEAD
 * has no commit. Each status entry contributes its path, status code, and the
 * SHA-256 of its content, with null for a deleted file, in path order.
 */
export async function readBaselineKey(vcs: Vcs, projectRoot: string): Promise<BaselineKey | null> {
  if (vcs.kind !== 'git') return null;
  const head = await vcs.head();
  if (head.sha === null) return null;
  const entries = (await vcs.status()).filter((entry) => !insideRunFolder(entry.path)).sort(byPath);
  const parts: string[] = [];
  for (const entry of entries) {
    const content = await hashFileContent(path.join(projectRoot, entry.path));
    parts.push(`${entry.path}\0${entry.code}\0${content ?? ''}`);
  }
  const digest = createHash('sha256').update(parts.join('\n'), 'utf8').digest('hex');
  return { commit: head.sha, treeDigest: `sha256:${digest}` };
}
