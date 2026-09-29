import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { applyOpenSpecDeltas } from '../spec/apply-deltas.js';
import {
  type CapabilitySpec,
  type ParsedDelta,
  parseCapabilitySpec,
  parseDelta,
} from '../spec/delta.js';
import type { LocatedChange } from '../status/change-locations.js';
import { getSpecsDir } from '../status/layout.js';
import { SyncStop } from './sync-stop.js';
import type { Vcs } from './vcs.js';

/** One requirement the change rewrites whose text moved on the default branch. */
export interface RequirementChange {
  readonly capability: string;
  readonly requirement: string;
}

/** The capabilities an archived change folder carries a delta for, sorted. */
export async function listDeltaCapabilities(changeFolderPath: string): Promise<string[]> {
  const entries = await fs
    .readdir(path.join(changeFolderPath, 'specs'), { withFileTypes: true })
    .catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** One capability's living spec path, relative to a repository root. */
export function livingSpecPath(config: OsqConfig, capability: string): string {
  return path
    .join(getSpecsDir(config.paths.openspecRoot), capability, 'spec.md')
    .split(path.sep)
    .join('/');
}

/** The requirement names a delta rewrites: MODIFIED, REMOVED, and rename sources. */
function rewritableNames(delta: ParsedDelta): string[] {
  return [
    ...delta.modified.map((requirement) => requirement.name),
    ...delta.removed.map((requirement) => requirement.name),
    ...delta.renamed.map((rename) => rename.from),
  ];
}

/** One requirement's verbatim text, or undefined when the spec lacks it. */
function requirementRaw(spec: CapabilitySpec | null, name: string): string | undefined {
  return spec?.requirements.find((requirement) => requirement.name === name)?.raw;
}

/** A spec parsed from `content`, or null when the ref has no such file. */
function parseSide(content: string | null): CapabilitySpec | null {
  return content === null ? null : parseCapabilitySpec(content);
}

/**
 * The requirements the change rewrites whose text differs between `.run/base`
 * and the default branch's tip, or that the default branch lacks.
 */
export async function changedRequirements(
  vcs: Vcs,
  changeFolderPath: string,
  baseCommit: string | null,
  defaultBranch: string,
  config: OsqConfig,
): Promise<RequirementChange[]> {
  const capabilities = await listDeltaCapabilities(changeFolderPath);
  const changed: RequirementChange[] = [];
  for (const capability of capabilities) {
    const deltaPath = path.join(changeFolderPath, 'specs', capability, 'spec.md');
    const deltaContent = await fs.readFile(deltaPath, 'utf8').catch(() => null);
    if (deltaContent === null) continue;
    const names = rewritableNames(parseDelta(deltaContent));
    if (names.length === 0) continue;

    const relative = livingSpecPath(config, capability);
    const [baseContent, defaultContent] = await Promise.all([
      baseCommit === null ? Promise.resolve(null) : vcs.show(baseCommit, relative),
      vcs.show(defaultBranch, relative),
    ]);
    const base = parseSide(baseContent);
    const current = parseSide(defaultContent);
    for (const name of names) {
      if (requirementRaw(base, name) !== requirementRaw(current, name)) {
        changed.push({ capability, requirement: name });
      }
    }
  }
  return changed;
}

/** Stop when any requirement the change rewrites moved on the default branch. */
export async function assertRequirementsUnchanged(
  vcs: Vcs,
  change: { readonly folderName: string; readonly folderPath: string },
  baseCommit: string | null,
  defaultBranch: string,
  config: OsqConfig,
): Promise<void> {
  const changed = await changedRequirements(
    vcs,
    change.folderPath,
    baseCommit,
    defaultBranch,
    config,
  );
  if (changed.length === 0) return;
  const list = changed.map((entry) => `${entry.capability}: ${entry.requirement}`).join(', ');
  throw new SyncStop(
    'sync_failed',
    `${change.folderName}: ${defaultBranch} changed requirements this change rewrites since it was approved: ${list}; reject the change and plan it again against ${defaultBranch}`,
  );
}

/** Write `content` at `target`, or remove `target` when there is none. */
async function writeOrRemove(target: string, content: string | null): Promise<void> {
  if (content === null) {
    await fs.rm(target, { force: true });
    return;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** Every capability folder directly under the merged worktree's living specs. */
async function listLivingCapabilities(worktreeRoot: string, config: OsqConfig): Promise<string[]> {
  const specsDir = getSpecsDir(config.paths.openspecRoot);
  const entries = await fs
    .readdir(path.join(worktreeRoot, specsDir), { withFileTypes: true })
    .catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Take the default branch's copy of every conflicting path under the archive. */
async function resolveArchiveConflicts(
  worktreeRoot: string,
  change: LocatedChange,
  vcs: Vcs,
  defaultBranch: string,
  conflicts: readonly string[],
  staged: Set<string>,
): Promise<void> {
  const archive = path.relative(worktreeRoot, change.tree.archiveDir).split(path.sep).join('/');
  for (const conflict of conflicts) {
    if (conflict !== archive && !conflict.startsWith(`${archive}/`)) continue;
    await writeOrRemove(path.join(worktreeRoot, conflict), await vcs.show(defaultBranch, conflict));
    staged.add(conflict);
  }
}

/**
 * Put the default branch's copy of every living spec in place, take the
 * default branch's copy of any conflicting archive path, and, for an archived
 * change only, re-apply the archived folder's deltas. Stages every file it
 * writes or removes.
 */
export async function rebuildLivingSpecs(
  worktreeRoot: string,
  change: LocatedChange,
  vcs: Vcs,
  defaultBranch: string,
  config: OsqConfig,
  archived: boolean,
  conflicts: readonly string[],
): Promise<void> {
  const changeFolderPath = change.folderPath;
  const staged = new Set<string>();
  await resolveArchiveConflicts(worktreeRoot, change, vcs, defaultBranch, conflicts, staged);
  const specsDir = getSpecsDir(config.paths.openspecRoot);
  const deltas = await listDeltaCapabilities(changeFolderPath);
  const capabilities = [
    ...new Set([...(await listLivingCapabilities(worktreeRoot, config)), ...deltas]),
  ].sort();
  for (const capability of capabilities) {
    const relative = livingSpecPath(config, capability);
    await writeOrRemove(
      path.join(worktreeRoot, specsDir, capability, 'spec.md'),
      await vcs.show(defaultBranch, relative),
    );
    staged.add(relative);
  }
  await vcs.stage([...staged]);
  if (!archived) return;
  await applyOpenSpecDeltas(worktreeRoot, changeFolderPath, config);
  for (const capability of deltas) staged.add(livingSpecPath(config, capability));
  await vcs.stage([...staged]);
}
