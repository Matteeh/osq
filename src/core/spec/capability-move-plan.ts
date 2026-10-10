/**
 * The plan a generated capability move is made of.
 *
 * `generateCapabilityMove` validates a move and turns it into a `MovePlan`
 * here: the requirement blocks each target receives, the removed blocks the old
 * capability loses, and each new target's sidecar and group.
 */

import type { MoveTarget } from './capability-move-map.js';
import { UNGROUPED, formatSidecar } from './capability-sidecar.js';
import type { CapabilitySpec, DeltaRequirement } from './delta.js';

const CODE_OWNERSHIP = 'Code ownership';

/** One target's share of a move, ready to write. */
export interface PlannedTarget {
  readonly name: string;
  readonly living: boolean;
  readonly purpose: string;
  readonly globs: readonly string[];
  readonly group: string | null;
  readonly sidecar: string | null;
  readonly requirements: readonly DeltaRequirement[];
}

/** A validated rename or split. */
export interface MovePlan {
  readonly kind: 'rename' | 'split';
  readonly targets: readonly PlannedTarget[];
  readonly removed: readonly { readonly name: string; readonly target: string }[];
  readonly emptied: boolean;
  readonly hasCodeOwnership: boolean;
}

/** The globs of a requirement block's `<!-- source: ... -->` comment. */
function sourceGlobs(raw: string): string[] {
  const match = /<!--\s*source:\s*([\s\S]*?)-->/i.exec(raw);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Build the plan for a rename that empties the old capability.
 *
 * @scenario spec-lint-and-approve: Rename moves every requirement
 * @scenario spec-lint-and-approve: Rename keeps the sidecar
 * @adr 016
 */
export function renamePlan(
  spec: CapabilitySpec,
  purpose: string,
  to: string,
  sidecarRaw: string | null,
  sidecarGroup: string | null,
): MovePlan {
  const code = spec.requirements.find((requirement) => requirement.name === CODE_OWNERSHIP);
  const moved = spec.requirements.filter((requirement) => requirement.name !== CODE_OWNERSHIP);
  return {
    kind: 'rename',
    targets: [
      {
        name: to,
        living: false,
        purpose,
        globs: code === undefined ? [] : sourceGlobs(code.raw),
        group: sidecarGroup ?? UNGROUPED,
        sidecar: sidecarRaw ?? formatSidecar({ group: UNGROUPED }),
        requirements: moved,
      },
    ],
    removed: moved.map((requirement) => ({ name: requirement.name, target: to })),
    emptied: true,
    hasCodeOwnership: code !== undefined,
  };
}

/**
 * Refuse a split whose targets the living `<old>` spec cannot satisfy.
 *
 * @scenario spec-lint-and-approve: Map refusals
 * @adr 016
 */
export function validateSplit(
  from: string,
  spec: CapabilitySpec,
  targets: readonly MoveTarget[],
  living: readonly string[],
): void {
  const names = new Set(spec.requirements.map((requirement) => requirement.name));
  for (const target of targets) {
    if (target.name === from) {
      throw new Error(`the map cannot name ${from}`);
    }
    if (living.includes(target.name)) {
      if (target.purpose !== null || target.group !== null || target.source !== null) {
        throw new Error(
          `map entry ${target.name} already has a living spec; leave out purpose, group and source`,
        );
      }
    } else if (target.purpose === null || target.source === null) {
      throw new Error(`map entry ${target.name} needs purpose and source`);
    }
    for (const requirement of target.requirements) {
      if (!names.has(requirement)) {
        throw new Error(`${from} has no requirement "${requirement}"`);
      }
    }
  }
}

/**
 * Build the plan for a split.
 *
 * @scenario spec-lint-and-approve: Split into a new and a living capability
 * @scenario spec-lint-and-approve: Split empties the old capability
 * @adr 016
 */
export function splitPlan(
  spec: CapabilitySpec,
  targets: readonly MoveTarget[],
  living: readonly string[],
  oldGroup: string | null,
): MovePlan {
  const code = spec.requirements.find((requirement) => requirement.name === CODE_OWNERSHIP);
  const owner = new Map<string, string>();
  for (const target of targets) {
    for (const requirement of target.requirements) owner.set(requirement, target.name);
  }
  const moved = spec.requirements.filter(
    (requirement) => requirement.name !== CODE_OWNERSHIP && owner.has(requirement.name),
  );
  const remaining = spec.requirements.filter(
    (requirement) => requirement.name !== CODE_OWNERSHIP && !owner.has(requirement.name),
  );
  const planned = targets.map((target): PlannedTarget => {
    const requirements = moved.filter((requirement) => owner.get(requirement.name) === target.name);
    if (living.includes(target.name)) {
      return {
        name: target.name,
        living: true,
        purpose: '',
        globs: [],
        group: null,
        sidecar: null,
        requirements,
      };
    }
    const group = target.group ?? oldGroup ?? UNGROUPED;
    return {
      name: target.name,
      living: false,
      purpose: target.purpose ?? '',
      globs: target.source ?? [],
      group,
      sidecar: formatSidecar({ group }),
      requirements,
    };
  });
  return {
    kind: 'split',
    targets: planned,
    removed: moved.map((requirement) => ({
      name: requirement.name,
      target: owner.get(requirement.name) as string,
    })),
    emptied: remaining.length === 0,
    hasCodeOwnership: code !== undefined,
  };
}
