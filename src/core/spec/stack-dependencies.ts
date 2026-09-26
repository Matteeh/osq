import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import type { PlanningObservation } from '../report/planning-observed.js';
import { appendObservedSessions } from '../report/planning-observed.js';
import { resolveOsqPackageVersion } from '../report/planning.js';
import { changeTrees, listChanges } from '../status/change-locations.js';
import type { Vcs } from '../vcs/vcs.js';
import { stackedPath, worktreeBranch } from '../vcs/worktree.js';
import { readBriefHash, writeApprovalSeal } from './approve-worktree-shared.js';
import type { ApprovalDigest } from './digest.js';
import { parseSpecMdFromFolder } from './parser.js';

/** The state of one `depends_on` entry, read from git and files. */
export type DependencyState = 'landed' | 'approved' | 'archived' | 'unapproved';

/** One dependency's state, its approved hash, and the archive branch. */
export interface DependencyStatus {
  readonly folder: string;
  readonly state: DependencyState;
  /** The approved or archived hash; null for `landed` and `unapproved`. */
  readonly hash: string | null;
  /** The branch an archived dependency's archive lives on; else null. */
  readonly base: string | null;
}

/** One awaited dependency: a folder name and its approved hash. */
export interface AwaitedDependency {
  readonly folder: string;
  readonly hash: string;
}

/** The project root tree's changes and archive directories, relative to its root. */
async function changeDirs(
  projectRoot: string,
  config: OsqConfig,
): Promise<{ root: string; changes: string; archive: string }> {
  const [tree] = await changeTrees(projectRoot, config);
  const posix = (target: string): string =>
    path.relative(tree.root, target).split(path.sep).join('/');
  return { root: tree.root, changes: posix(tree.changesDir), archive: posix(tree.archiveDir) };
}

/** A file's trimmed contents, or null when it does not exist. */
async function readTrimmed(target: string): Promise<string | null> {
  const content = await fs.readFile(target, 'utf8').catch(() => null);
  return content === null ? null : content.trim();
}

/** Whether a branch exists, by exact name. */
async function branchExists(vcs: Vcs, branch: string): Promise<boolean> {
  return (await vcs.listBranches(branch)).includes(branch);
}

/** Build a status, defaulting `base` to null. */
function status(
  folder: string,
  state: DependencyState,
  hash: string | null,
  base: string | null = null,
): DependencyStatus {
  return { folder, state, hash, base };
}

/**
 * The state of the dependency folder `<dep>`: `landed` when the default branch
 * holds its archive, then what `osq/<dep>` holds, then its stacked approval,
 * then the checkout, then `unapproved`. Never reads a worktree.
 */
export async function readDependencyState(
  projectRoot: string,
  config: OsqConfig,
  vcs: Vcs,
  folder: string,
): Promise<DependencyStatus> {
  const { root, changes, archive } = await changeDirs(projectRoot, config);
  if (await vcs.pathExists(await vcs.defaultBranch(), `${archive}/${folder}`)) {
    return status(folder, 'landed', null);
  }

  const branch = worktreeBranch(folder);
  if (await branchExists(vcs, branch)) {
    const archived = await vcs.show(branch, `${archive}/${folder}/.run/approved`);
    if (archived !== null) return status(folder, 'archived', archived.trim(), branch);
    const approved = await vcs.show(branch, `${changes}/${folder}/.run/approved`);
    if (approved !== null) return status(folder, 'approved', approved.trim());
    return status(folder, 'unapproved', null);
  }

  if (config.vcs !== undefined) {
    const repoRoot = (await vcs.root()) ?? projectRoot;
    const stackedRoot = stackedPath(config.vcs, repoRoot, folder);
    const stackedHash = await readTrimmed(
      path.join(stackedRoot, changes, folder, '.run', 'approved'),
    );
    if (stackedHash !== null) return status(folder, 'approved', stackedHash);
  }

  const checkout =
    (await readTrimmed(path.join(root, changes, folder, '.run', 'approved'))) ??
    (await readTrimmed(path.join(root, archive, folder, '.run', 'approved')));
  if (checkout !== null) return status(folder, 'approved', checkout);
  return status(folder, 'unapproved', null);
}

/** Whether a folder name matches a query as `findChange` matches an active one. */
function matchesFolder(folderName: string, query: string): boolean {
  const trimmed = query.trim();
  const num = Number.parseInt(trimmed, 10);
  const padded = !Number.isNaN(num) ? String(num).padStart(3, '0') : trimmed;
  return (
    folderName === trimmed ||
    folderName === padded ||
    folderName.startsWith(`${trimmed}-`) ||
    folderName.startsWith(`${padded}-`)
  );
}

/** Resolve one `depends_on` entry to a folder name, or null when none matches. */
export async function resolveDependencyFolder(
  projectRoot: string,
  config: OsqConfig,
  idOrPrefix: string,
): Promise<string | null> {
  const changes = await listChanges(projectRoot, config);
  return changes.find((change) => matchesFolder(change.folderName, idOrPrefix))?.folderName ?? null;
}

/**
 * The awaited entries of a change folder's `depends_on`: every entry that reads
 * `approved` or `archived`, as `{ folder, hash }`, in `depends_on` order.
 */
export async function awaitedDependencies(
  projectRoot: string,
  config: OsqConfig,
  vcs: Vcs,
  folderPath: string,
): Promise<AwaitedDependency[]> {
  const proposal = await parseSpecMdFromFolder(folderPath);
  const awaited: AwaitedDependency[] = [];
  for (const id of proposal?.dependsOn ?? []) {
    const folder = await resolveDependencyFolder(projectRoot, config, id);
    if (folder === null) continue;
    const state = await readDependencyState(projectRoot, config, vcs, folder);
    if (state.state === 'approved' || state.state === 'archived') {
      awaited.push({ folder, hash: state.hash ?? '' });
    }
  }
  return awaited;
}

/** The `.run/stacked-on` body: one `<folder> <hash>` line per entry. */
export function formatStackedOn(entries: readonly AwaitedDependency[]): string {
  return entries.map((entry) => `${entry.folder} ${entry.hash}`).join('\n');
}

/** Parse a `.run/stacked-on` body into `{ folder, hash }` entries. */
export function parseStackedOn(content: string): AwaitedDependency[] {
  const entries: AwaitedDependency[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const space = line.indexOf(' ');
    if (space === -1) continue;
    entries.push({ folder: line.slice(0, space), hash: line.slice(space + 1).trim() });
  }
  return entries;
}

/** Everything a stacked approval needs to seal the checkout's copy. */
export interface RecordStackedApprovalInput {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  readonly vcs: Vcs;
  readonly folderName: string;
  readonly folderPath: string;
  readonly hash: string;
  readonly digest: ApprovalDigest;
  readonly mode: 'shown' | 'confirmed';
  readonly observations: readonly PlanningObservation[];
  readonly awaited: readonly AwaitedDependency[];
}

/** The stacked approval's root and the sealed copy it holds. */
export interface StackedApproval {
  readonly path: string;
  readonly copyFolder: string;
}

/** Write `.run/approver` as "Approval into a worktree" does, without `.run/base`. */
async function writeApprover(vcs: Vcs, folder: string): Promise<void> {
  const [userName, userEmail] = await Promise.all([
    vcs.configValue('user.name'),
    vcs.configValue('user.email'),
  ]);
  await fs.writeFile(
    path.join(folder, '.run', 'approver'),
    `${userName ?? ''} <${userEmail ?? ''}>\n`,
    'utf8',
  );
}

/** Write `.run/base` and `.run/approver` into a worktree's folder copy. */
export async function writeProvenance(
  vcs: Vcs,
  folder: string,
  base: string | null,
): Promise<void> {
  await fs.writeFile(path.join(folder, '.run', 'base'), `${base ?? ''}\n`, 'utf8');
  await writeApprover(vcs, folder);
}

/**
 * Record a stacked approval: replace any existing one, copy the checkout's
 * folder into it, seal it with the checkout's hash and the awaited lines, and
 * write nothing to the checkout or git.
 */
export async function recordStackedApproval(
  input: RecordStackedApprovalInput,
): Promise<StackedApproval> {
  const { projectRoot, config, vcs, folderName, folderPath, hash, digest, mode, awaited } = input;
  if (config.vcs === undefined) throw new Error('vcs.enabled is required to stack an approval');
  const repoRoot = (await vcs.root()) ?? projectRoot;
  const root = stackedPath(config.vcs, repoRoot, folderName);
  await fs.rm(root, { recursive: true, force: true });

  const copyFolder = path.join(root, path.relative(projectRoot, folderPath));
  await fs.mkdir(path.dirname(copyFolder), { recursive: true });
  await fs.cp(folderPath, copyFolder, { recursive: true });

  await appendObservedSessions(copyFolder, input.observations, {
    briefHash: await readBriefHash(folderPath),
    osqVersion: await resolveOsqPackageVersion(),
  });
  await writeApprovalSeal(root, copyFolder, config, digest, mode, hash);
  await writeApprover(vcs, copyFolder);
  await fs.writeFile(path.join(copyFolder, '.run', 'stacked-on'), formatStackedOn(awaited), 'utf8');
  return { path: root, copyFolder };
}
