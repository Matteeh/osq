import fs from 'node:fs/promises';
import type { OsqConfig } from '../foundation/config.js';
import { RecordingGitVcs } from './git-vcs-recording.js';
import { DEFAULT_GIT_SECONDS, runGit } from './git-vcs.js';
import { NoVcs } from './no-vcs.js';
import type { Vcs } from './vcs.js';

/** Reasons git checks are off, in the order selection tests them. */
const VCS_REASONS = {
  notFound: 'git not found',
  notRepository: 'not a git repository',
  notRoot: 'not the repository root',
} as const;

async function realpath(target: string): Promise<string> {
  return fs.realpath(target).catch(() => target);
}

/**
 * A project root inside a git repository but not at its top level, which git
 * writes would otherwise reach the enclosing repository through.
 */
export class NestedRootError extends Error {
  constructor(root: string, top: string) {
    super(
      `${root} is inside the git repository at ${top} but is not its top level; ` +
        `run osq from ${top} or set vcs.enabled to false`,
    );
    this.name = 'NestedRootError';
  }
}

/**
 * Select the one `Vcs` the watcher and doctor read through. `GitVcs` wins only
 * when the git binary runs and the project root, symlinks resolved, is the top
 * level of a git repository. With `vcs.enabled` on, a root below the top level
 * throws a `NestedRootError` instead of selecting `NoVcs`.
 * @scenario version-control: Folder below the root with git on
 * @scenario version-control: Commands below the root with git on
 */
export async function selectVcs(
  projectRoot: string,
  config: OsqConfig,
  options?: { gitBinary?: string },
): Promise<Vcs> {
  const binary = options?.gitBinary ?? 'git';
  const seconds = config.timeouts.gitSeconds ?? DEFAULT_GIT_SECONDS;

  const version = await runGit(binary, ['--version'], projectRoot, seconds);
  if (version.code !== 0) return new NoVcs(VCS_REASONS.notFound);

  const top = await runGit(binary, ['rev-parse', '--show-toplevel'], projectRoot, seconds);
  const topPath = top.stdout.trim();
  if (top.code !== 0 || topPath === '') return new NoVcs(VCS_REASONS.notRepository);

  const [rootReal, topReal] = await Promise.all([realpath(projectRoot), realpath(topPath)]);
  if (rootReal !== topReal) {
    if (config.vcs?.enabled === true) throw new NestedRootError(rootReal, topReal);
    return new NoVcs(VCS_REASONS.notRoot);
  }

  return new RecordingGitVcs(projectRoot, config, binary);
}
