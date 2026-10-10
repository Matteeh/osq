/**
 * The delta text a generated capability move writes.
 *
 * Every moved requirement is carried verbatim, so the ADDED block is byte for
 * byte the REMOVED one. The builders here turn a `MovePlan` into the old
 * capability's REMOVED delta, each target's ADDED delta, and the list of files
 * to write in order.
 */

import type { MovePlan, PlannedTarget } from './capability-move-plan.js';

const CODE_OWNERSHIP = 'Code ownership';

/**
 * Each glob in backticks, joined as `a`, `a and b`, and `a, b, and c`.
 *
 * @scenario spec-lint-and-approve: Ownership list
 * @adr 016
 */
export function ownershipList(globs: readonly string[]): string {
  const quoted = globs.map((glob) => `\`${glob}\``);
  if (quoted.length === 0) return '';
  if (quoted.length === 1) return quoted[0];
  if (quoted.length === 2) return `${quoted[0]} and ${quoted[1]}`;
  return `${quoted.slice(0, -1).join(', ')}, and ${quoted[quoted.length - 1]}`;
}

function ownershipBlock(target: string, globs: readonly string[]): string {
  const list = ownershipList(globs);
  return [
    '### Requirement: Code ownership',
    `<!-- source: ${globs.join(', ')} -->`,
    `The ${target} capability SHALL own ${list}.`,
    '',
    '#### Scenario: Codebase ownership boundaries',
    `- **WHEN** file ownership is resolved for ${target}`,
    `- **THEN** system maps ${list} to ${target}`,
  ].join('\n');
}

function removedBlock(name: string, target: string, kind: string): string {
  return [
    `### Requirement: ${name}`,
    `**Reason**: Moved to ${target} by a generated capability ${kind}.`,
    `**Migration**: ${target} carries the same requirement, byte for byte.`,
  ].join('\n');
}

/**
 * The `specs/<old>/spec.md` delta text.
 *
 * @scenario spec-lint-and-approve: Rename moves every requirement
 * @scenario spec-lint-and-approve: Split empties the old capability
 * @adr 016
 */
export function removedDeltaText(old: string, plan: MovePlan): string {
  const blocks = plan.removed.map((entry) => removedBlock(entry.name, entry.target, plan.kind));
  if (plan.emptied && plan.hasCodeOwnership) {
    blocks.push(
      [
        `### Requirement: ${CODE_OWNERSHIP}`,
        `**Reason**: ${old} has no requirement left after this generated ${plan.kind}.`,
        '**Migration**: Each capability that takes its requirements declares its own Code ownership.',
      ].join('\n'),
    );
  }
  return `# Spec Delta: ${old}\n\n## REMOVED Requirements\n\n${blocks.join('\n\n')}\n`;
}

/**
 * The `specs/<target>/spec.md` delta text.
 *
 * @scenario spec-lint-and-approve: Rename moves every requirement
 * @scenario spec-lint-and-approve: Split into a new and a living capability
 * @adr 016
 */
export function targetDeltaText(target: PlannedTarget): string {
  const blocks = target.requirements.map((requirement) => requirement.raw);
  if (!target.living && target.globs.length > 0) {
    blocks.push(ownershipBlock(target.name, target.globs));
  }
  const lines = [`# Spec Delta: ${target.name}`, ''];
  if (!target.living) lines.push('## Purpose', '', target.purpose, '');
  lines.push('## ADDED Requirements', '', blocks.join('\n\n'));
  return `${lines.join('\n')}\n`;
}

/**
 * The files a plan writes, in write order, relative to the change folder.
 *
 * @scenario spec-lint-and-approve: Rename moves every requirement
 * @adr 016
 */
export function plannedWrites(old: string, plan: MovePlan): { rel: string; content: string }[] {
  const writes = [{ rel: `specs/${old}/spec.md`, content: removedDeltaText(old, plan) }];
  for (const target of plan.targets) {
    if (!target.living && target.sidecar !== null) {
      writes.push({ rel: `specs/${target.name}/osq.yml`, content: target.sidecar });
    }
    writes.push({ rel: `specs/${target.name}/spec.md`, content: targetDeltaText(target) });
  }
  return writes;
}
