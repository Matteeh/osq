import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { type LocatedChange, changeTrees } from '../status/change-locations.js';
import { selectVcs } from '../vcs/select.js';
import type { Vcs } from '../vcs/vcs.js';
import { worktreeBranch, worktreePath } from '../vcs/worktree.js';
import { runPrepare } from './approve-worktree.js';
import {
  type AwaitedDependency,
  type DependencyStatus,
  parseStackedOn,
  readDependencyState,
} from './stack-dependencies.js';

/** The stacked-specific halt reasons a cut can report. */
export type StackCutReason = 'dependency_changed' | 'dependency_diverged';

/** What one stacked change's cycle should do: wait, halt, or cut at a base. */
export type StackCutDecision =
  | { readonly kind: 'wait' }
  | { readonly kind: 'halt'; readonly reason: StackCutReason; readonly detail: string }
  | { readonly kind: 'cut'; readonly base: string };

/** One stacked change and the fixed context every read shares. */
export interface StackCutInput {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  readonly change: LocatedChange;
  readonly vcs: Vcs;
}

/** A signed decision to cut one stacked change at `base`. */
export interface CutStackedChangeInput extends StackCutInput {
  readonly base: string;
}

/** The change's numeric spec id, falling back to its folder name. */
function specIdOf(folderName: string): string {
  return folderName.match(/^(\d+)/)?.[1] ?? folderName;
}

/** The project root tree's changes and archive directories, POSIX-relative. */
async function checkoutDirs(
  projectRoot: string,
  config: OsqConfig,
): Promise<{ changes: string; archive: string }> {
  const [tree] = await changeTrees(projectRoot, config);
  const posix = (target: string): string =>
    path.relative(tree.root, target).split(path.sep).join('/');
  return { changes: posix(tree.changesDir), archive: posix(tree.archiveDir) };
}

/** The `.run/stacked-on` entries of a stacked copy, empty when absent. */
async function readStackedOn(folderPath: string): Promise<AwaitedDependency[]> {
  const content = await fs
    .readFile(path.join(folderPath, '.run', 'stacked-on'), 'utf8')
    .catch(() => '');
  return parseStackedOn(content);
}

/** A `dependency_changed` halt for an unapproved or re-approved dependency. */
function changedHalt(dependency: string, id: string, rejected: boolean): StackCutDecision {
  const reason = rejected
    ? `${dependency} was rejected or is no longer approved`
    : `${dependency} was approved again after ${id}`;
  return { kind: 'halt', reason: 'dependency_changed', detail: `${reason}; approve ${id} again` };
}

/**
 * The base to cut from once no dependency waits or halts: the default branch
 * when all are landed, else the first archived dependency whose branch holds
 * every other archived dependency's archive. None holding all halts diverged.
 */
async function resolveArchivedBase(
  projectRoot: string,
  config: OsqConfig,
  vcs: Vcs,
  id: string,
  states: readonly { entry: AwaitedDependency; status: DependencyStatus }[],
): Promise<StackCutDecision> {
  const archived = states.filter((state) => state.status.state === 'archived');
  const { archive } = await checkoutDirs(projectRoot, config);
  for (const candidate of archived) {
    const branch = candidate.status.base ?? worktreeBranch(candidate.entry.folder);
    const others = archived.filter((other) => other.entry.folder !== candidate.entry.folder);
    const held = await Promise.all(
      others.map((other) => vcs.pathExists(branch, `${archive}/${other.entry.folder}`)),
    );
    if (held.every(Boolean)) return { kind: 'cut', base: branch };
  }
  const folders = archived.map((state) => state.entry.folder).join(' and ');
  return {
    kind: 'halt',
    reason: 'dependency_diverged',
    detail: `${folders} archived on separate branches; land one and approve ${id} again`,
  };
}

/**
 * Decide what to do with one stacked change: wait while a dependency is
 * approved, halt when one is unapproved or re-approved, or cut at the default
 * branch or the archived dependency branch that holds every other archive.
 */
export async function decideStackCut(input: StackCutInput): Promise<StackCutDecision> {
  const { projectRoot, config, change, vcs } = input;
  const id = specIdOf(change.folderName);
  const entries = await readStackedOn(change.folderPath);
  const states: { entry: AwaitedDependency; status: DependencyStatus }[] = [];
  for (const entry of entries) {
    const status = await readDependencyState(projectRoot, config, vcs, entry.folder);
    if (status.state === 'unapproved') return changedHalt(entry.folder, id, true);
    if (
      (status.state === 'approved' || status.state === 'archived') &&
      status.hash !== entry.hash
    ) {
      return changedHalt(entry.folder, id, false);
    }
    states.push({ entry, status });
  }
  if (states.some((state) => state.status.state === 'approved')) return { kind: 'wait' };
  if (states.every((state) => state.status.state === 'landed')) {
    return { kind: 'cut', base: await vcs.defaultBranch() };
  }
  return resolveArchivedBase(projectRoot, config, vcs, id, states);
}

/** Replace the worktree's change folder with the stacked copy and commit it. */
async function writeApprovedCopy(
  config: OsqConfig,
  change: LocatedChange,
  wtPath: string,
  changes: string,
  id: string,
  author: string,
): Promise<void> {
  const worktreeFolder = path.join(wtPath, changes, change.folderName);
  await fs.rm(worktreeFolder, { recursive: true, force: true });
  await fs.cp(change.folderPath, worktreeFolder, { recursive: true });
  const worktreeVcs = await selectVcs(wtPath, config);
  const head = await worktreeVcs.head();
  await fs.writeFile(path.join(worktreeFolder, '.run', 'base'), `${head.sha ?? ''}\n`, 'utf8');
  const relative = path.relative(wtPath, worktreeFolder).split(path.sep).join('/');
  await worktreeVcs.commit([relative], `osq: ${id} approved`, author);
}

/**
 * Cut `osq/<folder>` at `base`: create the branch and worktree unless they
 * exist, run prepare, seal the stacked copy as the approved commit unless the
 * branch tip already holds it, then delete the stacked approval directory.
 * A failure rethrows and keeps the branch, the worktree it added, and the
 * stacked approval, so a later cut reuses them.
 */
export async function cutStackedChange(input: CutStackedChangeInput): Promise<string> {
  const { projectRoot, config, change, vcs, base } = input;
  const vcsConfig = config.vcs;
  if (vcsConfig === undefined || vcsConfig.author === undefined) {
    throw new Error('vcs.author is required when vcs.enabled is true');
  }
  const id = specIdOf(change.folderName);
  const { changes } = await checkoutDirs(projectRoot, config);
  const branch = worktreeBranch(change.folderName);
  const repoRoot = (await vcs.root()) ?? projectRoot;
  const wtPath = worktreePath(vcsConfig, repoRoot, change.folderName);
  if (!(await vcs.listBranches(branch)).includes(branch)) {
    await vcs.createBranch(branch, base);
  }
  if (!(await vcs.worktreeList()).some((entry) => entry.branch === branch)) {
    await fs.mkdir(path.dirname(wtPath), { recursive: true });
    await vcs.worktreeAdd(wtPath, branch);
  }
  await runPrepare(wtPath, config, branch);
  if (!(await vcs.pathExists(branch, `${changes}/${change.folderName}/.run/approved`))) {
    await writeApprovedCopy(config, change, wtPath, changes, id, vcsConfig.author);
  }
  await fs.rm(change.tree.root, { recursive: true, force: true });
  return wtPath;
}
