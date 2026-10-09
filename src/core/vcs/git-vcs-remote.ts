import type { GitResult } from './git-vcs.js';
import type { VcsPushResult } from './vcs.js';

/** Runs one git command for a remote operation, bounded by the remote timeout. */
export type GitRemoteRun = (args: string[]) => Promise<GitResult>;

/** Git's combined output, stdout first, as one error message. */
function combined(result: GitResult): string {
  return [result.stdout, result.stderr].filter((part) => part.length > 0).join('');
}

/** Git's stdout, or throw an `Error` holding its combined output. */
function ok(result: GitResult): string {
  if (result.code !== 0) throw new Error(combined(result));
  return result.stdout;
}

/** Whether git's porcelain push output reports a rejected, non-fast-forward update. */
function isRejected(result: GitResult): boolean {
  return result.stdout
    .split('\n')
    .some((line) => line.trimStart().startsWith('!') && line.includes('[rejected]'));
}

/**
 * Fetch `branch` from `remote` into `FETCH_HEAD` and return the commit it
 * names, leaving every local branch, the working tree and the index untouched.
 *
 * @scenario version-control: Fetch a branch
 * @scenario version-control: No such remote
 * @adr 003
 * @adr 014
 */
export async function fetchBranch(
  run: GitRemoteRun,
  remote: string,
  branch: string,
): Promise<string> {
  const fetched = await run(['fetch', '--no-tags', remote, `refs/heads/${branch}`]);
  ok(fetched);
  return ok(await run(['rev-parse', '--verify', '--quiet', 'FETCH_HEAD'])).trim();
}

/**
 * Push `commit` to `remote`'s `branch` as a fast-forward only: the refspec
 * never starts with `+` and no force option is passed.
 *
 * @scenario version-control: Push a fast-forward
 * @scenario version-control: Push refused when the remote moved
 * @adr 003
 * @adr 014
 */
export async function pushBranch(
  run: GitRemoteRun,
  remote: string,
  commit: string,
  branch: string,
): Promise<VcsPushResult> {
  const result = await run(['push', '--porcelain', remote, `${commit}:refs/heads/${branch}`]);
  const output = combined(result);
  if (result.code === 0) return { status: 'done', output };
  if (isRejected(result)) return { status: 'rejected', output };
  throw new Error(output);
}
