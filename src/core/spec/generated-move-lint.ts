/**
 * Generated capability move lint.
 *
 * The `osq capability` generator writes a rename or split into a change as
 * byte-for-byte REMOVED and ADDED requirement blocks. This check compares the
 * two sides against the living `<from>` spec and reports a moved requirement
 * whose text differs, one that lands nowhere, or one no capability ADDS. A
 * proposal without `generated` gets no finding from it.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { type ParsedDelta, parseCapabilitySpec, parseDelta } from './delta.js';
import { readLivingCapabilityNames } from './digest-capability.js';
import { type LintFinding, makeFinding } from './lint-findings.js';

/** The one requirement name the move generator owns and lint leaves out. */
const CODE_OWNERSHIP = 'Code ownership';

/** The one malformed-`generated` message spec-lint-and-approve names. */
const MALFORMED_MESSAGE = 'generated must name kind rename or split, from, and a list to';

/** The parsed `generated` frontmatter field the generator writes. */
export interface GeneratedMove {
  readonly kind: 'rename' | 'split';
  readonly from: string;
  readonly to: readonly string[];
}

/** Inputs mirroring `collectCapabilityRelationFindings`. */
export interface GeneratedMoveLintInput {
  readonly projectRoot: string;
  readonly openspecRoot: string;
  readonly folderPath: string;
  readonly proposalPath: string;
  readonly data: Record<string, unknown>;
}

/** `null` when `generated` is absent, else the declaration or `'malformed'`. */
function readGeneratedMove(data: Record<string, unknown>): GeneratedMove | 'malformed' | null {
  const value = data.generated;
  if (value === undefined) {
    return null;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return 'malformed';
  }
  const record = value as Record<string, unknown>;
  const { kind, from, to } = record;
  if (kind !== 'rename' && kind !== 'split') {
    return 'malformed';
  }
  if (typeof from !== 'string') {
    return 'malformed';
  }
  if (!Array.isArray(to) || to.some((target) => typeof target !== 'string')) {
    return 'malformed';
  }
  return { kind, from, to: to as string[] };
}

/** Repository-relative POSIX path, matching lint's other finding locations. */
function repositoryPath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

/** Normalize a block the way `normalizeBlockRaw` in `delta.ts` does. */
function normalizeRaw(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').trim();
}

/** Read and parse one delta file, or null when it does not exist. */
async function readDeltaFile(filePath: string): Promise<ParsedDelta | null> {
  const content = await fs.readFile(filePath, 'utf8').catch(() => null);
  return content === null ? null : parseDelta(content);
}

/** The living `<from>` requirement blocks, keyed by name. */
async function readLivingBlocks(
  input: GeneratedMoveLintInput,
  from: string,
): Promise<Map<string, string>> {
  const specPath = path.join(input.projectRoot, input.openspecRoot, 'specs', from, 'spec.md');
  const content = await fs.readFile(specPath, 'utf8');
  const blocks = new Map<string, string>();
  for (const requirement of parseCapabilitySpec(content).requirements) {
    blocks.set(requirement.name, requirement.raw);
  }
  return blocks;
}

/** The REMOVED requirement names of the `from` delta, without Code ownership. */
function removedNames(fromDelta: ParsedDelta | null): Set<string> {
  const removed = new Set<string>();
  for (const requirement of fromDelta?.removed ?? []) {
    if (requirement.name !== CODE_OWNERSHIP) {
      removed.add(requirement.name);
    }
  }
  return removed;
}

/** Each target's parsed delta, keyed by target name in `to` order. */
async function readTargetDeltas(
  input: GeneratedMoveLintInput,
  targets: readonly string[],
): Promise<Map<string, ParsedDelta>> {
  const deltas = new Map<string, ParsedDelta>();
  for (const target of targets) {
    const delta = await readDeltaFile(path.join(input.folderPath, 'specs', target, 'spec.md'));
    if (delta !== null) {
      deltas.set(target, delta);
    }
  }
  return deltas;
}

/** The two ADDED-side findings for one target delta. */
function targetFindings(
  input: GeneratedMoveLintInput,
  generated: GeneratedMove,
  target: string,
  delta: ParsedDelta,
  livingBlocks: ReadonlyMap<string, string>,
  removed: ReadonlySet<string>,
): LintFinding[] {
  const file = repositoryPath(
    input.projectRoot,
    path.join(input.folderPath, 'specs', target, 'spec.md'),
  );
  const findings: LintFinding[] = [];
  for (const requirement of delta.added) {
    if (requirement.name === CODE_OWNERSHIP) {
      continue;
    }
    const livingRaw = livingBlocks.get(requirement.name);
    if (livingRaw !== undefined && normalizeRaw(livingRaw) !== normalizeRaw(requirement.raw)) {
      findings.push(
        makeFinding(
          'error',
          { file },
          `${target} ADDED "${requirement.name}" differs from the requirement REMOVED from ${generated.from}`,
        ),
      );
    }
    if (!removed.has(requirement.name)) {
      findings.push(
        makeFinding(
          'error',
          { file },
          `${target} ADDED "${requirement.name}", which the generated ${generated.kind} does not REMOVE from ${generated.from}`,
        ),
      );
    }
  }
  return findings;
}

/** The REMOVED-side findings: a `from` removal no target ADDS. */
function fromFindings(
  from: string,
  file: string,
  removed: ReadonlySet<string>,
  added: ReadonlySet<string>,
): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const name of removed) {
    if (!added.has(name)) {
      findings.push(
        makeFinding('error', { file }, `${from} REMOVED "${name}", which no capability in to ADDS`),
      );
    }
  }
  return findings;
}

/**
 * Collect the generated-move findings for one proposal change.
 *
 * @scenario spec-lint-and-approve: Untouched generated rename
 * @scenario spec-lint-and-approve: Edited requirement
 * @scenario spec-lint-and-approve: Extra requirement
 * @scenario spec-lint-and-approve: Dropped requirement
 * @scenario spec-lint-and-approve: Malformed field
 * @adr 016
 */
export async function collectGeneratedMoveFindings(
  input: GeneratedMoveLintInput,
): Promise<LintFinding[]> {
  const generated = readGeneratedMove(input.data);
  if (generated === null) {
    return [];
  }
  if (generated === 'malformed') {
    return [makeFinding('error', { file: input.proposalPath }, MALFORMED_MESSAGE)];
  }

  const living = await readLivingCapabilityNames(input.projectRoot, input.openspecRoot);
  if (!living.includes(generated.from)) {
    return [
      makeFinding(
        'error',
        { file: input.proposalPath },
        `generated names ${generated.from}, which has no living spec`,
      ),
    ];
  }

  const livingBlocks = await readLivingBlocks(input, generated.from);
  const fromDeltaPath = path.join(input.folderPath, 'specs', generated.from, 'spec.md');
  const removed = removedNames(await readDeltaFile(fromDeltaPath));
  const targetDeltas = await readTargetDeltas(input, generated.to);

  const added = new Set<string>();
  for (const delta of targetDeltas.values()) {
    for (const requirement of delta.added) {
      if (requirement.name !== CODE_OWNERSHIP) {
        added.add(requirement.name);
      }
    }
  }

  const findings: LintFinding[] = [];
  for (const [target, delta] of targetDeltas) {
    findings.push(...targetFindings(input, generated, target, delta, livingBlocks, removed));
  }
  findings.push(
    ...fromFindings(
      generated.from,
      repositoryPath(input.projectRoot, fromDeltaPath),
      removed,
      added,
    ),
  );
  return findings;
}
