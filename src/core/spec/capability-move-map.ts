/**
 * The YAML map a capability split reads.
 *
 * The top level maps each target capability name to an entry with
 * `requirements`, a non-empty list of requirement names of the old capability,
 * and, for a new target, `purpose` and `source`. A new target's entry may carry
 * `group`. Only the checks the map text alone decides live here; the checks
 * against the living `<old>` spec belong to `generateCapabilityMove`.
 */

import YAML from 'yaml';

/** One split target as the map declares it, in map order. */
export interface MoveTarget {
  readonly name: string;
  readonly group: string | null;
  readonly purpose: string | null;
  readonly source: readonly string[] | null;
  readonly requirements: readonly string[];
}

const NO_CAPABILITY = 'the map must name at least one capability';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readSource(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const list = value.filter(isNonEmptyString).map((entry) => (entry as string).trim());
  return list.length > 0 ? list : null;
}

function readRequirements(name: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`map entry ${name} lists no requirement`);
  }
  const requirements: string[] = [];
  for (const raw of value) {
    if (!isNonEmptyString(raw)) {
      throw new Error(`map entry ${name} lists no requirement`);
    }
    const requirement = raw.trim();
    if (requirement === 'Code ownership') {
      throw new Error('Code ownership is generated; leave it out of the map');
    }
    if (requirements.includes(requirement)) {
      throw new Error(`requirement "${requirement}" is mapped twice`);
    }
    requirements.push(requirement);
  }
  return requirements;
}

/**
 * Parse the map text into its split targets in map order.
 *
 * @scenario spec-lint-and-approve: Map refusals
 * @adr 016
 */
export function readMoveMap(text: string): MoveTarget[] {
  let parsed: unknown;
  try {
    parsed = YAML.parse(text);
  } catch {
    throw new Error(NO_CAPABILITY);
  }
  const record = asRecord(parsed);
  if (record === null || Object.keys(record).length === 0) {
    throw new Error(NO_CAPABILITY);
  }

  const targets: MoveTarget[] = [];
  const seen = new Set<string>();
  for (const name of Object.keys(record)) {
    const entry = asRecord(record[name]) ?? {};
    const requirements = readRequirements(name, entry.requirements);
    for (const requirement of requirements) {
      if (seen.has(requirement)) {
        throw new Error(`requirement "${requirement}" is mapped twice`);
      }
      seen.add(requirement);
    }
    targets.push({
      name,
      group: isNonEmptyString(entry.group) ? entry.group.trim() : null,
      purpose: isNonEmptyString(entry.purpose) ? entry.purpose.trim() : null,
      source: readSource(entry.source),
      requirements,
    });
  }
  return targets;
}
