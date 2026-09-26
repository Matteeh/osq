/**
 * Mutation outcomes in the report: across every active and archived change, the
 * latest measured `mutation_ran` event per `<file>#<function>`, grouped by the
 * opted-in capabilities its scenarios name. Every listed survivor counts as not
 * yet reviewed, because osq records no review. Nothing is persisted.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { compareNumericPrefix } from '../status/state.js';
import { asData, eventTimestampMs, parseEventLines } from './report-events.js';

/** One mutant that survived, with the function it belongs to. */
export interface MutationSurvivorEntry {
  readonly file: string;
  readonly function: string;
  readonly line: number;
  readonly column: number;
  readonly mutator: string;
  readonly replacement: string;
}

/** One opted-in capability's killed/survived sums and survivors. */
export interface CapabilityMutationScore {
  readonly capability: string;
  readonly killed: number;
  readonly survived: number;
  /** `killed / (killed + survived)` to three decimals, or null when both are zero. */
  readonly score: number | null;
  readonly survivors: readonly MutationSurvivorEntry[];
}

/** One measured `mutation_ran` event, reduced to what the report groups. */
interface MeasuredMutation {
  readonly file: string;
  readonly functionName: string;
  readonly scenarios: readonly string[];
  readonly killed: number;
  readonly survived: number;
  readonly survivors: readonly MutationSurvivorEntry[];
  readonly timestamp: number;
}

/** Mutable per-capability accumulator before it is sorted and frozen. */
interface MutationGroup {
  killed: number;
  survived: number;
  survivors: MutationSurvivorEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A trimmed non-empty string, or null. */
function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** A finite non-negative count, else zero. */
function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Non-empty strings from a value, in order; a non-array yields none. */
function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const entries: string[] = [];
  for (const entry of value) {
    const text = nonEmptyString(entry);
    if (text !== null) entries.push(text);
  }
  return entries;
}

/** One valid survivor of one measured event, or null when malformed. */
function survivorEntry(
  value: unknown,
  fallbackFile: string,
  functionName: string,
): MutationSurvivorEntry | null {
  if (!isRecord(value)) return null;
  const line = value.line;
  const column = value.column;
  const mutator = value.mutator;
  const replacement = value.replacement;
  if (typeof line !== 'number' || !Number.isFinite(line)) return null;
  if (typeof column !== 'number' || !Number.isFinite(column)) return null;
  if (typeof mutator !== 'string' || typeof replacement !== 'string') return null;
  return {
    file: nonEmptyString(value.file) ?? fallbackFile,
    function: functionName,
    line,
    column,
    mutator,
    replacement,
  };
}

/** Every valid survivor from a measured event's `survivors` array. */
function survivorEntries(
  value: unknown,
  file: string,
  functionName: string,
): MutationSurvivorEntry[] {
  if (!Array.isArray(value)) return [];
  const survivors: MutationSurvivorEntry[] = [];
  for (const entry of value) {
    const survivor = survivorEntry(entry, file, functionName);
    if (survivor !== null) survivors.push(survivor);
  }
  return survivors;
}

/** A measured mutation event's grouping fields, or null when not measured. */
function readMeasured(
  data: Record<string, unknown> | null,
  timestamp: number,
): MeasuredMutation | null {
  if (data === null || data.outcome !== 'measured') return null;
  const file = nonEmptyString(data.file);
  const functionName = nonEmptyString(data.function);
  if (file === null || functionName === null) return null;
  return {
    file,
    functionName,
    scenarios: stringArray(data.scenarios),
    killed: count(data.killed),
    survived: count(data.survived),
    survivors: survivorEntries(data.survivors, file, functionName),
    timestamp,
  };
}

/** Every measured `mutation_ran` event in the numbered streams of the folders. */
async function readMeasuredEvents(folders: readonly string[]): Promise<MeasuredMutation[]> {
  const measured: MeasuredMutation[] = [];
  for (const folderPath of folders) {
    const eventsDir = path.join(folderPath, '.run', 'events');
    let eventFiles: string[] = [];
    try {
      eventFiles = (await fs.readdir(eventsDir)).filter((entry) => /^\d+\.jsonl$/.test(entry));
    } catch {
      continue;
    }
    for (const eventFile of eventFiles.sort(compareNumericPrefix)) {
      const content = await fs.readFile(path.join(eventsDir, eventFile), 'utf8').catch(() => '');
      for (const event of parseEventLines(content)) {
        if (event.type !== 'mutation_ran') continue;
        const timestamp = eventTimestampMs(event);
        if (timestamp === null) continue;
        const parsed = readMeasured(asData(event), timestamp);
        if (parsed !== null) measured.push(parsed);
      }
    }
  }
  return measured;
}

/** The latest measured event per `<file>#<function>`, by timestamp. */
function latestByKey(measured: readonly MeasuredMutation[]): MeasuredMutation[] {
  const latest = new Map<string, MeasuredMutation>();
  for (const event of measured) {
    const key = `${event.file}#${event.functionName}`;
    const prior = latest.get(key);
    if (prior === undefined || event.timestamp >= prior.timestamp) latest.set(key, event);
  }
  return [...latest.values()];
}

/** True when the configuration opts a capability in. */
function isOptedIn(capabilities: 'all' | readonly string[], capability: string): boolean {
  return capabilities === 'all' || capabilities.includes(capability);
}

/** `killed / (killed + survived)` to three decimals, or null when both are zero. */
function mutationScore(killed: number, survived: number): number | null {
  const total = killed + survived;
  if (total === 0) return null;
  return Math.round((killed / total) * 1000) / 1000;
}

/** Fold one latest event into each opted-in capability its scenarios name. */
function addToGroups(
  groups: Map<string, MutationGroup>,
  event: MeasuredMutation,
  capabilities: 'all' | readonly string[],
): void {
  for (const label of event.scenarios) {
    const separator = label.indexOf(': ');
    if (separator < 0) continue;
    const capability = label.slice(0, separator).trim();
    if (!capability || !isOptedIn(capabilities, capability)) continue;
    const group = groups.get(capability) ?? { killed: 0, survived: 0, survivors: [] };
    group.killed += event.killed;
    group.survived += event.survived;
    group.survivors.push(...event.survivors);
    groups.set(capability, group);
  }
}

/**
 * Mutation scores per opted-in capability with at least one measured event, in
 * name order. Returns undefined when nothing is opted in or no measured event
 * names an opted-in capability, so the report is unchanged for other projects.
 */
export async function collectMutationScores(
  folders: readonly string[],
  config: OsqConfig,
): Promise<CapabilityMutationScore[] | undefined> {
  const capabilities = config.traceability?.capabilities ?? [];
  if (capabilities !== 'all' && capabilities.length === 0) return undefined;

  const groups = new Map<string, MutationGroup>();
  for (const event of latestByKey(await readMeasuredEvents(folders))) {
    addToGroups(groups, event, capabilities);
  }
  if (groups.size === 0) return undefined;

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([capability, group]) => ({
      capability,
      killed: group.killed,
      survived: group.survived,
      score: mutationScore(group.killed, group.survived),
      survivors: group.survivors,
    }));
}

/** Render the `Mutation:` section body, one entry and its survivors per capability. */
export function formatMutation(scores: readonly CapabilityMutationScore[]): string[] {
  const lines = ['Mutation:'];
  for (const entry of scores) {
    const total = entry.killed + entry.survived;
    const percent = entry.score === null ? '0.0' : (entry.score * 100).toFixed(1);
    lines.push(
      `  ${entry.capability}: ${entry.killed} of ${total} killed (${percent}%), ${entry.survivors.length} survivors not yet reviewed`,
    );
    for (const survivor of entry.survivors) {
      lines.push(
        `    survived: ${survivor.file}:${survivor.line}:${survivor.column} ${survivor.mutator} -> ${survivor.replacement}`,
      );
    }
  }
  return lines;
}
