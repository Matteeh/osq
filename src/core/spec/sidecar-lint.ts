/**
 * Lint findings for capability sidecars. A replacement sidecar a change carries
 * must parse and name a capability that exists or is created; a broken living
 * sidecar is a repository finding; and, with `capabilities.requireGroups`, every
 * capability the change creates or writes needs a real group. A missing sidecar
 * stays silent.
 */

import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type CreatesDeclaration, readCreates } from './capability-relations.js';
import {
  type SidecarParseResult,
  UNGROUPED,
  parseSidecar,
  readLivingSidecar,
} from './capability-sidecar.js';
import { readLivingCapabilityNames } from './digest-capability.js';
import { type LintFinding, makeFinding } from './lint-findings.js';

export interface SidecarLintInput {
  readonly projectRoot: string;
  readonly openspecRoot: string;
  readonly folderPath: string;
  readonly proposalPath: string;
  readonly data: Record<string, unknown>;
  readonly requireGroups: boolean;
}

/** Change findings that block, and repository findings that do not. */
export interface SidecarLintResult {
  readonly own: readonly LintFinding[];
  readonly repository: readonly LintFinding[];
}

interface ReplacementSidecar {
  readonly absolute: string;
  readonly parsed: SidecarParseResult;
}

/** Repository-relative POSIX path, matching lint's other finding locations. */
function repositoryPath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

function errorFinding(file: string, message: string): LintFinding {
  return makeFinding('error', { file }, message);
}

/** Read a file as UTF-8, or null when it is absent. */
async function readFileOrNull(filePath: string): Promise<string | null> {
  return fs.readFile(filePath, 'utf8').catch(() => null);
}

/** Capability dirs under `specs/` that hold `fileName`, in name order. */
async function readCapabilityDirs(folderPath: string, fileName: string): Promise<string[]> {
  const specsDir = path.join(folderPath, 'specs');
  const entries = await fs.readdir(specsDir, { withFileTypes: true }).catch((): Dirent[] => []);
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const exists = await fs
      .stat(path.join(specsDir, entry.name, fileName))
      .then(() => true)
      .catch(() => false);
    if (exists) names.push(entry.name);
  }
  return names.sort();
}

/** The change's replacement sidecars, keyed by capability, including dirs with no spec.md. */
async function readReplacementSidecars(
  folderPath: string,
): Promise<Map<string, ReplacementSidecar>> {
  const found = new Map<string, ReplacementSidecar>();
  for (const capability of await readCapabilityDirs(folderPath, 'osq.yml')) {
    const absolute = path.join(folderPath, 'specs', capability, 'osq.yml');
    const content = await readFileOrNull(absolute);
    if (content !== null) {
      found.set(capability, { absolute, parsed: parseSidecar(content) });
    }
  }
  return found;
}

/** Problems in each living sidecar, as repository findings; missing ones are silent. */
async function livingSidecarFindings(
  projectRoot: string,
  openspecRoot: string,
  living: readonly string[],
): Promise<LintFinding[]> {
  const findings: LintFinding[] = [];
  for (const capability of living) {
    const absolute = path.join(projectRoot, openspecRoot, 'specs', capability, 'osq.yml');
    const content = await readFileOrNull(absolute);
    if (content === null) continue;
    for (const problem of parseSidecar(content).problems) {
      findings.push(
        errorFinding(
          repositoryPath(projectRoot, absolute),
          `${openspecRoot}/specs/${capability}/osq.yml: ${problem}`,
        ),
      );
    }
  }
  return findings;
}

/** Problems in replacement sidecars, and replacements for no known capability. */
function replacementFindings(
  projectRoot: string,
  living: readonly string[],
  created: ReadonlySet<string>,
  replacements: ReadonlyMap<string, ReplacementSidecar>,
): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const capability of [...replacements.keys()].sort()) {
    const replacement = replacements.get(capability);
    if (replacement === undefined) continue;
    const file = repositoryPath(projectRoot, replacement.absolute);
    const relative = `specs/${capability}/osq.yml`;
    for (const problem of replacement.parsed.problems) {
      findings.push(errorFinding(file, `${relative}: ${problem}`));
    }
    if (!living.includes(capability) && !created.has(capability)) {
      findings.push(
        errorFinding(
          file,
          `${relative} replaces the sidecar of ${capability}, which has no living spec and is not created by this change`,
        ),
      );
    }
  }
  return findings;
}

/** A `creates` entry whose group is missing or the `ungrouped` placeholder. */
function createsGroupFindings(proposalPath: string, creates: CreatesDeclaration): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const entry of creates.entries) {
    if (entry.group !== null && entry.group !== UNGROUPED) continue;
    findings.push(
      errorFinding(
        proposalPath,
        `creates names ${entry.name} without a group; write creates: [{ name: ${entry.name}, group: <group> }]`,
      ),
    );
  }
  return findings;
}

/** A group-bearing replacement suppresses the finding only for a real group. */
function replacementGroup(replacement: ReplacementSidecar | undefined): string | null {
  return replacement?.parsed.sidecar?.group ?? null;
}

/** Living capabilities a delta writes with no sidecar group and no replacement group. */
async function writtenGroupFindings(
  input: SidecarLintInput,
  living: readonly string[],
  replacements: ReadonlyMap<string, ReplacementSidecar>,
): Promise<LintFinding[]> {
  const findings: LintFinding[] = [];
  for (const capability of await readCapabilityDirs(input.folderPath, 'spec.md')) {
    if (!living.includes(capability)) continue;
    const existing = await readLivingSidecar(input.projectRoot, input.openspecRoot, capability);
    if (existing !== null && existing.group !== UNGROUPED) continue;
    const replacement = replacementGroup(replacements.get(capability));
    if (replacement !== null && replacement !== UNGROUPED) continue;
    findings.push(
      errorFinding(
        input.proposalPath,
        `${capability} has no group; add specs/${capability}/osq.yml with a group to this change`,
      ),
    );
  }
  return findings;
}

/** Collect the sidecar findings for one proposal change. */
export async function collectSidecarFindings(input: SidecarLintInput): Promise<SidecarLintResult> {
  const creates = readCreates(input.data);
  const living = await readLivingCapabilityNames(input.projectRoot, input.openspecRoot);
  const replacements = await readReplacementSidecars(input.folderPath);

  const own = replacementFindings(input.projectRoot, living, new Set(creates.names), replacements);
  if (input.requireGroups) {
    own.push(...createsGroupFindings(input.proposalPath, creates));
    own.push(...(await writtenGroupFindings(input, living, replacements)));
  }

  const repository = await livingSidecarFindings(input.projectRoot, input.openspecRoot, living);
  return { own, repository };
}
