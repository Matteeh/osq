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
import { getSpecsDir } from '../status/layout.js';
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
  throw new Error(
    `${change.folderName}: ${defaultBranch} changed requirements this change rewrites since it was approved: ${list}; reject the change and plan it again against ${defaultBranch}`,
  );
}

/**
 * Rebuild every living spec the change's deltas write from the default branch's
 * copy, then re-apply the archived folder's deltas and stage the result.
 */
export async function rebuildLivingSpecs(
  worktreeRoot: string,
  changeFolderPath: string,
  vcs: Vcs,
  defaultBranch: string,
  config: OsqConfig,
): Promise<void> {
  const capabilities = await listDeltaCapabilities(changeFolderPath);
  const specsDir = getSpecsDir(config.paths.openspecRoot);
  const staged: string[] = [];
  for (const capability of capabilities) {
    const relative = livingSpecPath(config, capability);
    const content = await vcs.show(defaultBranch, relative);
    const target = path.join(worktreeRoot, specsDir, capability, 'spec.md');
    if (content === null) {
      await fs.rm(target, { force: true });
    } else {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, 'utf8');
    }
    staged.push(relative);
  }
  await applyOpenSpecDeltas(worktreeRoot, changeFolderPath, config);
  await vcs.stage(staged);
}
