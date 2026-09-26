import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import type { OsqConfig } from '../foundation/config.js';
import type { Vcs, VcsHead, VcsStash, VcsStatusEntry } from './vcs.js';

/** Default bound in seconds for each git read when `timeouts.gitSeconds` is unset. */
export const DEFAULT_GIT_SECONDS = 10;

/** Environment variables that would redirect osq's own git reads. */
const GIT_ENV_VARS = ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'] as const;

export interface GitResult {
  readonly code: number;
  readonly stdout: string;
}

/** The child environment with the variables that redirect git removed. */
function childGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of GIT_ENV_VARS) delete env[key];
  return env;
}

/** Run `git` with an argument list, never a shell, bounded by `timeoutSeconds`. */
export function runGit(
  binary: string,
  args: string[],
  cwd: string,
  timeoutSeconds: number,
): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      binary,
      args,
      { cwd, timeout: timeoutSeconds * 1000, env: childGitEnv() },
      (error, stdout) => {
        let code = 0;
        if (error) code = typeof error.code === 'number' ? error.code : 1;
        resolve({ code, stdout: String(stdout) });
      },
    );
  });
}

function nonEmpty(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseStashBranch(subject: string): string | null {
  const match = /^(?:WIP on|On) (.+?): /.exec(subject);
  if (match === null) return null;
  const branch = match[1] ?? '';
  return branch === '(no branch)' ? null : branch;
}

function parseStashes(output: string): VcsStash[] {
  const stashes: VcsStash[] = [];
  for (const line of output.split('\n')) {
    const [sha, subject] = line.split('\0');
    if (!sha) continue;
    stashes.push({ sha, branch: parseStashBranch(subject ?? '') });
  }
  return stashes;
}

function parseStatus(output: string): VcsStatusEntry[] {
  const fields = output.split('\0');
  const entries: VcsStatusEntry[] = [];
  let index = 0;
  while (index < fields.length) {
    const field = fields[index] ?? '';
    index += 1;
    if (field.length < 4) continue;
    const code = field.slice(0, 2);
    const entry: { path: string; code: string; from?: string } = {
      path: field.slice(3),
      code,
    };
    if (code.includes('R') || code.includes('C')) {
      const from = fields[index];
      index += 1;
      if (from !== undefined && from !== '') entry.from = from;
    }
    entries.push(entry);
  }
  return entries;
}

/** The git-backed port. Selection guarantees the project root is the top level. */
export class GitVcs implements Vcs {
  readonly kind = 'git' as const;
  readonly unavailableReason = null;

  constructor(
    private readonly projectRoot: string,
    private readonly config: OsqConfig,
    private readonly binary = 'git',
  ) {}

  private run(args: string[]): Promise<GitResult> {
    const seconds = this.config.timeouts.gitSeconds ?? DEFAULT_GIT_SECONDS;
    return runGit(this.binary, args, this.projectRoot, seconds);
  }

  async root(): Promise<string | null> {
    const result = await this.run(['rev-parse', '--show-toplevel']);
    const top = result.stdout.trim();
    if (result.code !== 0 || top === '') return null;
    return fs.realpath(top).catch(() => top);
  }

  async head(): Promise<VcsHead> {
    const [commit, branch] = await Promise.all([
      this.run(['rev-parse', '--verify', '--quiet', 'HEAD']),
      this.run(['symbolic-ref', '--quiet', '--short', 'HEAD']),
    ]);
    return {
      sha: commit.code === 0 ? nonEmpty(commit.stdout) : null,
      branch: branch.code === 0 ? nonEmpty(branch.stdout) : null,
    };
  }

  async indexDigest(): Promise<string> {
    const result = await this.run(['ls-files', '--stage', '-z']);
    if (result.code !== 0) return '';
    return createHash('sha256').update(result.stdout).digest('hex');
  }

  async stashList(): Promise<VcsStash[]> {
    const result = await this.run(['stash', 'list', '--format=%H%x00%gs']);
    if (result.code !== 0) return [];
    return parseStashes(result.stdout);
  }

  async status(): Promise<VcsStatusEntry[]> {
    const result = await this.run(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    if (result.code !== 0) return [];
    return parseStatus(result.stdout);
  }
}
