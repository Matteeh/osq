/**
 * The capability move generator.
 *
 * `generateCapabilityMove` writes a rename or a split into an unapproved change
 * as byte-for-byte REMOVED and ADDED requirement blocks copied from the living
 * spec, each new capability's `osq.yml`, its generated Code ownership, and the
 * `## Generated` section that lists every file outside the specs naming the old
 * capability. Every refusal throws before anything is written.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import type { LocatedChange } from '../status/change-locations.js';
import { findChange } from '../status/change-locations.js';
import type { MoveTarget } from './capability-move-map.js';
import { type MovePlan, renamePlan, splitPlan, validateSplit } from './capability-move-plan.js';
import { editGeneratedProposal, readGeneratedNames } from './capability-move-proposal.js';
import { plannedWrites } from './capability-move-text.js';
import { findNamingFiles } from './capability-naming.js';
import { UNGROUPED, livingSidecarPath, parseSidecar } from './capability-sidecar.js';
import { type CapabilitySpec, extractPurposeSection, parseCapabilitySpec } from './delta.js';
import { readLivingCapabilityNames } from './digest-capability.js';

const CAPABILITY_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A capability rename or split, as `generateCapabilityMove` takes it. */
export type CapabilityMove =
  | { readonly kind: 'rename'; readonly from: string; readonly to: string }
  | { readonly kind: 'split'; readonly from: string; readonly targets: readonly MoveTarget[] };

/** What the generator wrote and which files still name the old capability. */
export interface CapabilityMoveResult {
  readonly folderPath: string;
  readonly written: readonly string[];
  readonly naming: readonly string[];
}

/** One written file: its path relative to the change folder and its bytes. */
interface PlannedWrite {
  readonly rel: string;
  readonly content: string;
}

interface OldContext {
  readonly living: readonly string[];
  readonly spec: CapabilitySpec;
  readonly purpose: string;
  readonly sidecarRaw: string | null;
  readonly sidecarGroup: string | null;
}

/** `true` when the path exists. */
async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

function assertCapabilityName(name: string): void {
  if (!CAPABILITY_NAME.test(name)) {
    throw new Error(`${name} is not a capability name; use lowercase words joined by -`);
  }
}

/** Resolve the change and refuse one that is already approved. */
async function resolveUnapproved(
  projectRoot: string,
  config: OsqConfig,
  changeId: string,
): Promise<LocatedChange> {
  const change = await findChange(path.resolve(projectRoot), config, changeId);
  if (await exists(path.join(change.folderPath, '.run', 'approved'))) {
    throw new Error(
      `change ${change.folderName} is approved; generate the move into an unapproved change`,
    );
  }
  return change;
}

function validateNames(move: CapabilityMove): void {
  assertCapabilityName(move.from);
  if (move.kind === 'rename') {
    assertCapabilityName(move.to);
    return;
  }
  for (const target of move.targets) assertCapabilityName(target.name);
}

/** Read the living old spec, its purpose, sidecar, and the living names. */
async function readOldContext(
  projectRoot: string,
  config: OsqConfig,
  from: string,
): Promise<OldContext> {
  const openspecRoot = config.paths.openspecRoot;
  const living = await readLivingCapabilityNames(projectRoot, openspecRoot);
  if (!living.includes(from)) {
    throw new Error(`capability ${from} has no living spec`);
  }
  const oldContent = await fs.readFile(
    path.join(projectRoot, openspecRoot, 'specs', from, 'spec.md'),
    'utf8',
  );
  const sidecarRaw = await fs
    .readFile(livingSidecarPath(projectRoot, openspecRoot, from), 'utf8')
    .catch(() => null);
  return {
    living,
    spec: parseCapabilitySpec(oldContent),
    purpose: extractPurposeSection(oldContent) ?? '',
    sidecarRaw,
    sidecarGroup: sidecarRaw === null ? null : (parseSidecar(sidecarRaw).sidecar?.group ?? null),
  };
}

function buildPlan(move: CapabilityMove, context: OldContext): MovePlan {
  if (move.kind === 'rename') {
    return renamePlan(
      context.spec,
      context.purpose,
      move.to,
      context.sidecarRaw,
      context.sidecarGroup,
    );
  }
  validateSplit(move.from, context.spec, move.targets, context.living);
  return splitPlan(context.spec, move.targets, context.living, context.sidecarGroup);
}

/** Remove an earlier move's folders, write every file, and edit the proposal. */
async function writeMove(
  change: LocatedChange,
  proposalContent: string,
  move: CapabilityMove,
  plan: MovePlan,
  naming: readonly string[],
  writes: readonly PlannedWrite[],
): Promise<void> {
  for (const name of readGeneratedNames(proposalContent)) {
    await fs.rm(path.join(change.folderPath, 'specs', name), { recursive: true, force: true });
  }
  for (const write of writes) {
    const absolute = path.join(change.folderPath, write.rel);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, write.content, 'utf8');
  }
  const creates = plan.targets
    .filter((target) => !target.living)
    .map((target) => ({ name: target.name, group: target.group ?? UNGROUPED }));
  await fs.writeFile(
    path.join(change.folderPath, 'proposal.md'),
    editGeneratedProposal(proposalContent, {
      kind: move.kind,
      from: move.from,
      to: plan.targets.map((target) => target.name),
      creates,
      written: writes.map((write) => write.rel),
      naming,
    }),
    'utf8',
  );
}

/**
 * Write a capability rename or split into an unapproved change.
 *
 * @scenario spec-lint-and-approve: Rename moves every requirement
 * @scenario spec-lint-and-approve: Moved text is byte for byte
 * @scenario spec-lint-and-approve: Ownership list
 * @scenario spec-lint-and-approve: Rename keeps the sidecar
 * @scenario spec-lint-and-approve: Approved change refused
 * @scenario spec-lint-and-approve: Rename onto a living capability refused
 * @scenario spec-lint-and-approve: Running it again
 * @scenario spec-lint-and-approve: Split into a new and a living capability
 * @scenario spec-lint-and-approve: Split empties the old capability
 * @adr 016
 */
export async function generateCapabilityMove(
  projectRoot: string,
  config: OsqConfig,
  changeId: string,
  move: CapabilityMove,
): Promise<CapabilityMoveResult> {
  const change = await resolveUnapproved(projectRoot, config, changeId);
  validateNames(move);
  const context = await readOldContext(projectRoot, config, move.from);
  if (move.kind === 'rename' && context.living.includes(move.to)) {
    throw new Error(`capability ${move.to} already has a living spec`);
  }

  const plan = buildPlan(move, context);
  const proposalContent = await fs.readFile(path.join(change.folderPath, 'proposal.md'), 'utf8');
  const naming = await findNamingFiles(projectRoot, config, move.from);
  const writes = plannedWrites(move.from, plan);
  await writeMove(change, proposalContent, move, plan, naming, writes);
  return { folderPath: change.folderPath, written: writes.map((write) => write.rel), naming };
}
