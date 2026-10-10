import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import type { PlanningObservation } from '../report/planning-observed.js';
import { appendObservedSessions } from '../report/planning-observed.js';
import { resolveOsqPackageVersion } from '../report/planning.js';
import { changeTrees, listChanges, matchesFolder } from '../status/change-locations.js';
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
  readonly hash: string | null;
  readonly base: string | null;
}

/** One awaited dependency: a folder name and its approved hash. */
export interface AwaitedDependency {
  readonly folder: string;
  readonly hash: string;
  /** The shared capabilities of an overlap line; absent for a declared entry. */
  readonly overlap?: readonly string[];
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

/** The dependency folder's state: `landed`, `approved`, `archived`, or `unapproved`. */
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
 * The awaited entries of a change folder: its `depends_on` entries that read
 * `approved` or `archived`, in order, then each `.run/stacked-on` overlap line
 * no entry names that still reads approved or archived with the recorded hash.
 *
 * @scenario spec-lint-and-approve: Overlap lines count while their change waits to land
 * @adr 003
 */
export async function awaitedDependencies(
  projectRoot: string,
  config: OsqConfig,
  vcs: Vcs,
  folderPath: string,
): Promise<AwaitedDependency[]> {
  const proposal = await parseSpecMdFromFolder(folderPath);
  const awaited: AwaitedDependency[] = [];
  const named = new Set<string>();
  for (const id of proposal?.dependsOn ?? []) {
    const folder = await resolveDependencyFolder(projectRoot, config, id);
    if (folder === null) continue;
    const state = await readDependencyState(projectRoot, config, vcs, folder);
    if (state.state !== 'approved' && state.state !== 'archived') continue;
    awaited.push({ folder, hash: state.hash ?? '' });
    named.add(folder);
  }
  const stackPath = path.join(folderPath, '.run', 'stacked-on');
  for (const line of parseStackedOn(await fs.readFile(stackPath, 'utf8').catch(() => ''))) {
    if (line.overlap === undefined || named.has(line.folder)) continue;
    const state = await readDependencyState(projectRoot, config, vcs, line.folder);
    if (state.state !== 'approved' && state.state !== 'archived') continue;
    if ((state.hash ?? '') !== line.hash) continue;
    named.add(line.folder);
    awaited.push({ folder: line.folder, hash: line.hash, overlap: line.overlap });
  }
  return awaited;
}

/**
 * The `.run/stacked-on` body: `<folder> <hash>` per declared entry, or
 * `<folder> <hash> overlap <capability>[,<capability>...]` per overlap entry.
 *
 * @scenario spec-lint-and-approve: Stacked-on lines read back
 * @adr 003
 */
export function formatStackedOn(entries: readonly AwaitedDependency[]): string {
  return entries
    .map((entry) =>
      entry.overlap === undefined
        ? `${entry.folder} ${entry.hash}`
        : `${entry.folder} ${entry.hash} overlap ${entry.overlap.join(',')}`,
    )
    .join('\n');
}

/**
 * @scenario spec-lint-and-approve: Stacked-on lines read back
 * @adr 003
 */
export function parseStackedOn(content: string): AwaitedDependency[] {
  const entries: AwaitedDependency[] = [];
  for (const raw of content.split('\n')) {
    const [folder, hash, marker, capabilities] = raw.trim().split(/\s+/);
    if (folder === undefined || hash === undefined) continue;
    if (marker === 'overlap' && capabilities !== undefined) {
      entries.push({ folder, hash, overlap: capabilities.split(',').filter(Boolean) });
    } else {
      entries.push({ folder, hash });
    }
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
  const userName = await vcs.configValue('user.name');
  const userEmail = await vcs.configValue('user.email');
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

/** Record a stacked approval: replace any existing one, copy and seal the checkout's folder. */
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
