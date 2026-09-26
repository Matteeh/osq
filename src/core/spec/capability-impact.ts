import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scopeCoversPath } from '../run/scope.js';
import { getSpecsDir } from '../status/layout.js';
import { type LintFinding, makeFinding } from './lint-findings.js';
import { parseCodeOwnership } from './parser.js';

/**
 * The capability half of impact lint: a scoped file that imports code owned by
 * a capability the proposal neither reads nor writes, and a resolved scope path
 * owned by no capability with a delta. Both never affect validity.
 */

/** One living capability's declared Code ownership globs. */
export interface CapabilityOwnership {
  readonly capability: string;
  readonly globs: readonly string[];
}

/** Read every living spec's Code ownership globs, in capability name order. */
export async function readCapabilityOwnership(
  projectRoot: string,
  openspecRoot: string,
): Promise<CapabilityOwnership[]> {
  const specsDir = getSpecsDir(openspecRoot, projectRoot);
  let entries: Dirent[];
  try {
    entries = await fs.readdir(specsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const ownerships: CapabilityOwnership[] = [];
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  for (const entry of directories) {
    const content = await fs
      .readFile(path.join(specsDir, entry.name, 'spec.md'), 'utf8')
      .catch(() => null);
    if (content === null) continue;
    const globs = parseCodeOwnership(content);
    if (globs.length > 0) ownerships.push({ capability: entry.name, globs });
  }

  return ownerships;
}

/** Capabilities whose Code ownership globs cover one path, sorted by name. */
export function ownerCapabilities(
  ownerships: readonly CapabilityOwnership[],
  relativePath: string,
): string[] {
  return ownerships
    .filter((entry) => scopeCoversPath(entry.globs, relativePath))
    .map((entry) => entry.capability)
    .sort();
}

/** One task's resolved write surface for the write-without-delta check. */
export interface CapabilityWriteTask {
  readonly taskNumber: string;
  readonly taskPath: string;
  readonly existingPaths: readonly string[];
}

/**
 * Warn once per resolved scope path owned by capabilities none of which has a
 * delta in the change. Paths no living spec owns are left alone.
 */
export function writeWithoutDeltaFindings(
  tasks: readonly CapabilityWriteTask[],
  ownerships: readonly CapabilityOwnership[],
  deltaCapabilities: ReadonlySet<string>,
): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const task of tasks) {
    for (const scopePath of task.existingPaths) {
      const owners = ownerCapabilities(ownerships, scopePath);
      if (owners.length === 0) continue;
      if (owners.some((owner) => deltaCapabilities.has(owner))) continue;
      findings.push(
        makeFinding(
          'warning',
          { file: task.taskPath },
          `${scopePath} is owned by ${owners.join(', ')}, which has no delta in this change. Add a delta or move the file out of scope`,
        ),
      );
    }
  }

  return findings;
}

/** The direct imports a capability read check reads, plus what counts as declared. */
export interface CapabilityReadInput {
  readonly proposalPath: string;
  readonly scopedFiles: readonly string[];
  readonly importsOf: (file: string) => readonly string[];
  readonly filesInScope: ReadonlySet<string>;
  readonly ownerships: readonly CapabilityOwnership[];
  /** Capability names in `features.reads` or with a delta in the change. */
  readonly declared: ReadonlySet<string>;
}

/**
 * Warn once per capability owning code a scoped file imports directly, when no
 * owner of the imported file is read or has a delta and the file is out of every
 * task's scope.
 */
export function undeclaredReadFindings(input: CapabilityReadInput): LintFinding[] {
  const importersByCapability = new Map<string, Set<string>>();

  for (const scoped of input.scopedFiles) {
    for (const imported of input.importsOf(scoped)) {
      if (input.filesInScope.has(imported)) continue;
      const owners = ownerCapabilities(input.ownerships, imported);
      if (owners.length === 0) continue;
      if (owners.some((owner) => input.declared.has(owner))) continue;

      for (const owner of owners) {
        const importers = importersByCapability.get(owner) ?? new Set<string>();
        importers.add(scoped);
        importersByCapability.set(owner, importers);
      }
    }
  }

  return [...importersByCapability.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([capability, importers]) =>
      makeFinding(
        'warning',
        { file: input.proposalPath },
        `Scoped files import code owned by the ${capability} capability: ${[...importers].sort().join(', ')}. Add ${capability} to features.reads`,
      ),
    );
}
