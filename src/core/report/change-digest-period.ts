/** Range totals for a digest of archived changes. */

import type { Adr } from '../foundation/decisions.js';
import type { DigestChange } from './change-digest.js';

/** Requirement counts across the selected changes. */
export interface DigestPeriodRequirements {
  readonly added: number;
  readonly modified: number;
  readonly removed: number;
  readonly renamed: number;
}

/** One capability touched by the selected changes and how many wrote it. */
export interface DigestPeriodCapability {
  readonly name: string;
  readonly changes: number;
}

/** One ADR dated inside the selected range. */
export interface DigestPeriodAdr {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly date: string;
}

/** A total plus how many selected changes recorded one. */
export interface DigestPeriodTotal {
  readonly total: number;
  readonly recorded: number;
}

/** The period totals that open a range digest. */
export interface DigestPeriod {
  readonly changeCount: number;
  readonly requirements: DigestPeriodRequirements;
  readonly capabilities: readonly DigestPeriodCapability[];
  readonly adrs: readonly DigestPeriodAdr[];
  readonly halts: number;
  readonly elapsedMs: DigestPeriodTotal;
  readonly cost?: DigestPeriodTotal;
}

/** Counts requirements and touched capabilities over the selected changes. */
function countRequirements(changes: readonly DigestChange[]): {
  requirements: DigestPeriodRequirements;
  capabilities: readonly DigestPeriodCapability[];
} {
  const requirements = { added: 0, modified: 0, removed: 0, renamed: 0 };
  const counts = new Map<string, number>();
  for (const change of changes) {
    for (const capability of change.capabilities) {
      counts.set(capability.name, (counts.get(capability.name) ?? 0) + 1);
      requirements.added += capability.added.length;
      requirements.modified += capability.modified.length;
      requirements.removed += capability.removed.length;
      requirements.renamed += capability.renamed.length;
    }
  }
  const capabilities = [...counts.entries()]
    .map(([name, changes]) => ({ name, changes }))
    .sort(compareCapabilities);
  return { requirements, capabilities };
}

/** Most changes first, then by capability name. */
function compareCapabilities(a: DigestPeriodCapability, b: DigestPeriodCapability): number {
  if (a.changes !== b.changes) return b.changes - a.changes;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/** Total halts, elapsed, and cost over the selected changes. */
function countTotals(changes: readonly DigestChange[]): {
  halts: number;
  elapsed: DigestPeriodTotal;
  cost: DigestPeriodTotal;
} {
  let halts = 0;
  let elapsedTotal = 0;
  let elapsedRecorded = 0;
  let costTotal = 0;
  let costRecorded = 0;
  for (const change of changes) {
    if (change.tasks.halts !== null) halts += change.tasks.halts;
    if (change.elapsedMs !== null) {
      elapsedTotal += change.elapsedMs;
      elapsedRecorded += 1;
    }
    if (change.cost !== undefined && change.cost !== null) {
      costTotal += change.cost;
      costRecorded += 1;
    }
  }
  return {
    halts,
    elapsed: { total: elapsedTotal, recorded: elapsedRecorded },
    cost: { total: costTotal, recorded: costRecorded },
  };
}

/** ADRs from the decisions folder whose date falls inside the range. */
function datedAdrs(adrs: readonly Adr[], since: string, until: string | null): DigestPeriodAdr[] {
  const inRange = adrs.filter(
    (adr) => adr.date !== null && adr.date >= since && (until === null || adr.date <= until),
  );
  return inRange.map((adr) => ({
    id: `ADR-${adr.number}`,
    number: adr.number,
    title: adr.title,
    date: adr.date as string,
  }));
}

/** Computes the period totals of a range selection. */
export function buildDigestPeriod(
  changes: readonly DigestChange[],
  adrs: readonly Adr[],
  since: string,
  until: string | null,
  cost: boolean,
): DigestPeriod {
  const { requirements, capabilities } = countRequirements(changes);
  const totals = countTotals(changes);
  return {
    changeCount: changes.length,
    requirements,
    capabilities,
    adrs: datedAdrs(adrs, since, until),
    halts: totals.halts,
    elapsedMs: totals.elapsed,
    ...(cost ? { cost: totals.cost } : {}),
  };
}
