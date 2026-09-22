import type { WebCoverage, WebGraph, WebTokenGroup } from '../../../../src/core/web-data-types.js';
import { round } from './scales.js';

/** One landed change with its ordered, change-level chart observations. */
export interface LandedChange {
  readonly folderKey: string;
  readonly id: number | null;
  readonly title: string;
  readonly landed: string;
  readonly landedMs: number;
  readonly executionCost: number | null;
  readonly executionCoverage: WebCoverage;
  readonly planningCost: number | null;
  readonly planningCoverage: WebCoverage;
  readonly tokens: readonly WebTokenGroup[];
  readonly firstAttemptPass: WebCoverage;
  readonly durations: readonly number[];
  readonly writes: readonly string[];
}

function finiteNonNegative(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Archived changes with a valid recorded landed time, ordered by timestamp then
 * folder key. Active and rejected nodes never enter a landed timeline, and a
 * missing or malformed date is dropped rather than fabricated.
 */
export function landedChanges(graph: WebGraph): LandedChange[] {
  const writesByChange = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'writes') continue;
    const list = writesByChange.get(edge.from) ?? [];
    if (!list.includes(edge.to)) list.push(edge.to);
    writesByChange.set(edge.from, list);
  }

  const changes: LandedChange[] = [];
  for (const node of graph.changes) {
    if (node.state !== 'archived' || node.landed === null) continue;
    const landedMs = Date.parse(node.landed);
    if (!Number.isFinite(landedMs)) continue;
    changes.push({
      folderKey: node.folderKey,
      id: node.id,
      title: node.title,
      landed: node.landed,
      landedMs,
      executionCost: finiteNonNegative(node.execution.cost),
      executionCoverage: node.execution.costCoverage,
      planningCost: finiteNonNegative(node.planning.cost),
      planningCoverage: node.planning.costCoverage,
      tokens: [...node.execution.tokens, ...node.planning.tokens],
      firstAttemptPass: node.execution.firstAttemptPass,
      durations: node.execution.durations.filter((value) => Number.isFinite(value) && value >= 0),
      writes: writesByChange.get(node.folderKey) ?? [],
    });
  }

  return changes.sort((a, b) => a.landedMs - b.landedMs || a.folderKey.localeCompare(b.folderKey));
}

/** Index of the first landed change with a valid planning record, or -1. */
export function planningBoundaryIndex(changes: readonly LandedChange[]): number {
  return changes.findIndex(
    (change) => change.planningCost !== null || change.planningCoverage.total > 0,
  );
}

/** One harness/model token total with its recorded cache share. */
export interface TokenTotal {
  readonly harness: string;
  readonly model: string | null;
  readonly input: number;
  readonly cachedInput: number;
  readonly output: number;
  readonly reasoning: number;
  readonly total: number;
  readonly cacheShare: number | null;
}

function mergeGroup(groups: Map<string, TokenTotal>, group: WebTokenGroup): void {
  const key = `${group.harness}\u0000${group.model ?? ''}`;
  const current = groups.get(key);
  if (current === undefined) {
    groups.set(key, {
      harness: group.harness,
      model: group.model,
      input: group.input,
      cachedInput: group.cachedInput,
      output: group.output,
      reasoning: group.reasoning,
      total: group.total,
      cacheShare: null,
    });
    return;
  }
  groups.set(key, {
    ...current,
    input: current.input + group.input,
    cachedInput: current.cachedInput + group.cachedInput,
    output: current.output + group.output,
    reasoning: current.reasoning + group.reasoning,
    total: current.total + group.total,
  });
}

/**
 * Token totals across every non-rejected change, grouped only by the recorded
 * harness and nullable model. Unlike provenance never merges, and cache share
 * stays unavailable when no input basis was recorded.
 */
export function aggregateTokens(graph: WebGraph): TokenTotal[] {
  const groups = new Map<string, TokenTotal>();
  for (const change of graph.changes) {
    if (change.state === 'rejected') continue;
    for (const group of [...change.execution.tokens, ...change.planning.tokens]) {
      mergeGroup(groups, group);
    }
  }
  return [...groups.values()]
    .map((group) => {
      const basis = group.input + group.cachedInput;
      return { ...group, cacheShare: basis > 0 ? round(group.cachedInput / basis) : null };
    })
    .sort(
      (a, b) => a.harness.localeCompare(b.harness) || (a.model ?? '').localeCompare(b.model ?? ''),
    );
}

/** The maximum number of landed changes summarized by one pass window. */
export const PASS_WINDOW_SIZE = 5;

/** One consecutive landed window with summed first-attempt pass evidence. */
export interface PassWindow {
  readonly index: number;
  readonly changes: readonly LandedChange[];
  readonly reported: number;
  readonly total: number;
  readonly rate: number | null;
}

/** Consecutive landed slices of at most {@link PASS_WINDOW_SIZE} changes. */
export function passWindows(changes: readonly LandedChange[]): PassWindow[] {
  const windows: PassWindow[] = [];
  for (let start = 0; start < changes.length; start += PASS_WINDOW_SIZE) {
    const slice = changes.slice(start, start + PASS_WINDOW_SIZE);
    let reported = 0;
    let total = 0;
    for (const change of slice) {
      reported += change.firstAttemptPass.reported;
      total += change.firstAttemptPass.total;
    }
    windows.push({
      index: windows.length + 1,
      changes: slice,
      reported,
      total,
      rate: total > 0 ? reported / total : null,
    });
  }
  return windows;
}

/** One fixed duration bucket derived from covered task durations only. */
export interface DurationBin {
  readonly label: string;
  readonly count: number;
}

const DURATION_BINS: readonly { readonly label: string; readonly max: number }[] = [
  { label: 'under 5s', max: 5 },
  { label: '5 to 15s', max: 15 },
  { label: '15 to 60s', max: 60 },
  { label: '1 to 5m', max: 300 },
  { label: '5m or more', max: Number.POSITIVE_INFINITY },
];

/** Counts finite non-negative covered task durations into fixed bins. */
export function durationHistogram(graph: WebGraph): DurationBin[] {
  const bins = DURATION_BINS.map((bin) => ({ label: bin.label, count: 0 }));
  for (const change of graph.changes) {
    if (change.state === 'rejected') continue;
    for (const duration of change.execution.durations) {
      if (!Number.isFinite(duration) || duration < 0) continue;
      const found = DURATION_BINS.findIndex((bin) => duration < bin.max);
      const index = found === -1 ? bins.length - 1 : found;
      bins[index] = { label: bins[index].label, count: bins[index].count + 1 };
    }
  }
  return bins;
}

/** One capability's cumulative landed write count over landed changes. */
export interface CapabilitySeries {
  readonly id: string;
  readonly points: readonly { readonly change: string; readonly cumulative: number }[];
  readonly total: number;
}

/**
 * Cumulative landed writes per capability. Current capability order is the
 * stable series order; capabilities named only by a writes edge follow in
 * sorted order. A capability is incremented once per landed change's unique
 * writes edge, and untouched capabilities are omitted.
 */
export function capabilityWriteSeries(
  graph: WebGraph,
  changes: readonly LandedChange[],
): CapabilitySeries[] {
  const order = graph.capabilities.map((node) => node.id);
  const known = new Set(order);
  const extras = new Set<string>();
  for (const change of changes) {
    for (const capability of change.writes) {
      if (!known.has(capability)) extras.add(capability);
    }
  }
  const ids = [...order, ...[...extras].sort()].filter((id) =>
    changes.some((change) => change.writes.includes(id)),
  );
  return ids.map((id) => {
    let cumulative = 0;
    const points = changes.map((change) => {
      if (change.writes.includes(id)) cumulative += 1;
      return { change: change.folderKey, cumulative };
    });
    return { id, points, total: cumulative };
  });
}
