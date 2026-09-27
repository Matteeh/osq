/**
 * Capability relations for a change. A proposal relates to a capability by
 * writing a delta or naming one in `features.reads`; every read names a living
 * capability or one the change declares in `creates`; and a delta that creates
 * a capability must be declared. The `creates` checks apply in every project;
 * the relation checks apply once the project holds a living capability spec.
 */

import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseDelta } from './delta.js';
import { nearestCapability, readLivingCapabilityNames } from './digest-capability.js';
import { type LintFinding, makeFinding } from './lint-findings.js';

/** The `creates` frontmatter declaration: its trimmed names and malformedness. */
export interface CreatesDeclaration {
  readonly names: readonly string[];
  readonly malformed: boolean;
}

/**
 * Reads `creates` from proposal frontmatter: the trimmed names, an empty list
 * when absent, and `malformed` when present but not a list of strings.
 */
export function readCreates(data: Record<string, unknown>): CreatesDeclaration {
  const value = data.creates;
  if (value === undefined) {
    return { names: [], malformed: false };
  }
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    return { names: [], malformed: true };
  }
  return { names: value.map((entry) => entry.trim()), malformed: false };
}

export interface CapabilityRelationsInput {
  readonly projectRoot: string;
  readonly folderPath: string;
  readonly openspecRoot: string;
  readonly proposalPath: string;
  readonly data: Record<string, unknown>;
  readonly reads: readonly string[];
}

/** Repository-relative POSIX path, matching lint's other finding locations. */
function repositoryPath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

/**
 * Delta spec paths under `specs/<capability>/spec.md`, keyed by capability in
 * name order. Directories without a `spec.md` are ignored, as in delta lint.
 */
async function readDeltaFiles(folderPath: string): Promise<Map<string, string>> {
  const deltasDir = path.join(folderPath, 'specs');
  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(deltasDir, { withFileTypes: true });
  } catch {
    return new Map();
  }

  const found = new Map<string, string>();
  for (const name of entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()) {
    const deltaPath = path.join(deltasDir, name, 'spec.md');
    const exists = await fs
      .stat(deltaPath)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      found.set(name, deltaPath);
    }
  }
  return found;
}

/** True when the named delta adds at least one requirement. */
async function deltaAddsRequirement(deltaPath: string | undefined): Promise<boolean> {
  if (deltaPath === undefined) {
    return false;
  }
  const content = await fs.readFile(deltaPath, 'utf8').catch(() => null);
  return content !== null && parseDelta(content).added.length > 0;
}

/** The `; did you mean <nearest>?` suffix, empty when there is no nearest. */
function nearestSuffix(name: string, living: readonly string[]): string {
  const nearest = nearestCapability(name, living);
  return nearest === null ? '' : `; did you mean ${nearest}?`;
}

/** The `creates` findings, which apply in every project. */
async function createsFindings(
  input: CapabilityRelationsInput,
  creates: CreatesDeclaration,
  living: readonly string[],
  deltaFiles: ReadonlyMap<string, string>,
): Promise<LintFinding[]> {
  const findings: LintFinding[] = [];
  if (creates.malformed) {
    findings.push(
      makeFinding(
        'error',
        { file: input.proposalPath },
        'creates must be a list of capability names',
      ),
    );
  }

  for (const name of creates.names) {
    if (living.includes(name)) {
      findings.push(
        makeFinding(
          'error',
          { file: input.proposalPath },
          `creates names ${name}, which already has a living spec`,
        ),
      );
    } else if (!(await deltaAddsRequirement(deltaFiles.get(name)))) {
      findings.push(
        makeFinding(
          'error',
          { file: input.proposalPath },
          `creates names ${name}, but no delta under specs/${name}/spec.md adds a requirement`,
        ),
      );
    }
  }
  return findings;
}

/** The relation findings, which apply once a living capability spec exists. */
function relationFindings(
  input: CapabilityRelationsInput,
  creates: ReadonlySet<string>,
  living: readonly string[],
  deltaFiles: ReadonlyMap<string, string>,
): LintFinding[] {
  const findings: LintFinding[] = [];

  if (deltaFiles.size === 0 && input.reads.length === 0) {
    findings.push(
      makeFinding(
        'error',
        { file: input.proposalPath },
        'proposal.md relates to no capability; write a delta under specs/<capability>/spec.md or name a capability in features.reads',
      ),
    );
  }

  for (const read of input.reads) {
    if (living.includes(read) || creates.has(read)) {
      continue;
    }
    findings.push(
      makeFinding(
        'error',
        { file: input.proposalPath },
        `features.reads names unknown capability ${read}${nearestSuffix(read, living)}`,
      ),
    );
  }

  for (const [capability, deltaPath] of deltaFiles) {
    if (living.includes(capability) || creates.has(capability)) {
      continue;
    }
    findings.push(
      makeFinding(
        'error',
        { file: repositoryPath(input.projectRoot, deltaPath) },
        `specs/${capability}/spec.md creates capability ${capability}, which creates does not list${nearestSuffix(capability, living)}`,
      ),
    );
  }

  return findings;
}

/** Collect the `creates` and relation findings for one proposal change. */
export async function collectCapabilityRelationFindings(
  input: CapabilityRelationsInput,
): Promise<LintFinding[]> {
  const creates = readCreates(input.data);
  const living = await readLivingCapabilityNames(input.projectRoot, input.openspecRoot);
  const deltaFiles = await readDeltaFiles(input.folderPath);

  const findings = await createsFindings(input, creates, living, deltaFiles);
  if (living.length === 0) {
    return findings;
  }
  return [...findings, ...relationFindings(input, new Set(creates.names), living, deltaFiles)];
}
