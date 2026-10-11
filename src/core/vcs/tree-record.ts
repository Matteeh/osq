import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { DEFAULT_GIT_SECONDS, runGit } from './git-vcs.js';

/** The record file, in the repository's common git directory. */
export const TREE_RECORD_FILE = 'osq-trees.jsonl';

/**
 * Resolve the tree record's absolute path for a root and a git binary: the
 * common git directory `git rev-parse --git-common-dir` prints, resolved
 * against the root, holding `TREE_RECORD_FILE`. Null when `vcs.enabled` is not
 * true, so no git runs, or when git prints no common directory.
 *
 * @scenario version-control: Record path
 * @adr 003
 */
export async function resolveTreeRecordPath(
  projectRoot: string,
  config: OsqConfig,
  binary = 'git',
): Promise<string | null> {
  if (config.vcs?.enabled !== true) return null;
  const seconds = config.timeouts.gitSeconds ?? DEFAULT_GIT_SECONDS;
  const result = await runGit(binary, ['rev-parse', '--git-common-dir'], projectRoot, seconds);
  if (result.code !== 0) return null;
  const common = result.stdout.trim();
  if (common === '') return null;
  return path.join(path.resolve(projectRoot, common), TREE_RECORD_FILE);
}

/**
 * The tree record's absolute path when `vcs.enabled` is true and git prints the
 * common directory, and null otherwise. Runs no git when `vcs.enabled` is not
 * true.
 *
 * @scenario version-control: Record path
 * @adr 003
 */
export async function treeRecordPath(
  projectRoot: string,
  config: OsqConfig,
): Promise<string | null> {
  return resolveTreeRecordPath(projectRoot, config, 'git');
}

/**
 * Append one `{"at","op","root"}` line to the record and swallow any failure,
 * so the write that recorded still returns what it returned before.
 *
 * @scenario version-control: Worktree add from the checkout
 * @scenario version-control: Commit in a linked worktree
 * @scenario version-control: Failed commit records nothing
 * @scenario version-control: Unwritable record
 * @adr 003
 */
export async function appendTreeRecord(
  recordPath: string,
  op: string,
  root: string,
): Promise<void> {
  const line = JSON.stringify({ at: new Date().toISOString(), op, root });
  await fs.appendFile(recordPath, `${line}\n`, 'utf8').catch(() => undefined);
}
