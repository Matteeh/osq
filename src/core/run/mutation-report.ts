/**
 * Mutation report reading: turn one run's untrusted JSON report into the
 * killed, survived, and invalid counts plus the survivors of the pick's file
 * and ranges. Nothing is trusted; every field is checked before use.
 */

import { readFileSync } from 'node:fs';

/** One mutant that survived a pick's mutation run. */
export interface MutationSurvivor {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly mutator: string;
  readonly replacement: string;
}

/** Counts and survivors read from one report. */
export interface MutationCounts {
  readonly killed: number;
  readonly survived: number;
  readonly invalid: number;
  readonly survivors: readonly MutationSurvivor[];
}

/** The longest replacement a survivor keeps. */
export const MUTATION_REPLACEMENT_LIMIT = 200;

const KILLED = new Set(['Killed', 'Timeout']);
const SURVIVED = new Set(['Survived', 'NoCoverage']);

/** Inclusive line intervals parsed from `<file>:<start>-<end>` ranges. */
function intervals(file: string, ranges: readonly string[]): [number, number][] {
  const prefix = `${file}:`;
  const parsed: [number, number][] = [];
  for (const range of ranges) {
    if (!range.startsWith(prefix)) continue;
    const [start, end] = range.slice(prefix.length).split('-');
    const first = Number(start);
    const last = Number(end);
    if (Number.isFinite(first) && Number.isFinite(last)) parsed.push([first, last]);
  }
  return parsed;
}

/** True when `line` falls in one of the intervals. */
function inRanges(line: number, parsed: readonly [number, number][]): boolean {
  return parsed.some(([start, end]) => line >= start && line <= end);
}

/** A non-null, non-array object, or null. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** One mutant's extracted fields, or null when a field is missing or mistyped. */
function mutantFields(
  mutant: unknown,
): { line: number; column: number; status: string; mutator: string; replacement: string } | null {
  const record = asRecord(mutant);
  if (record === null) return null;
  const start = asRecord(asRecord(record.location)?.start);
  const line = start?.line;
  const column = start?.column;
  const status = record.status;
  const mutator = record.mutatorName;
  const replacement = record.replacement;
  if (
    typeof line !== 'number' ||
    typeof column !== 'number' ||
    typeof status !== 'string' ||
    typeof mutator !== 'string' ||
    typeof replacement !== 'string'
  ) {
    return null;
  }
  return { line, column, status, mutator, replacement };
}

/** Fold one mutant into the counts, according to "Mutation report reading". */
function countMutant(
  mutant: unknown,
  file: string,
  parsed: readonly [number, number][],
  counts: { killed: number; survived: number; invalid: number; survivors: MutationSurvivor[] },
): void {
  const fields = mutantFields(mutant);
  if (fields === null) {
    counts.invalid += 1;
    return;
  }
  if (!inRanges(fields.line, parsed)) return;
  if (KILLED.has(fields.status)) {
    counts.killed += 1;
    return;
  }
  if (SURVIVED.has(fields.status)) {
    counts.survived += 1;
    counts.survivors.push({
      file,
      line: fields.line,
      column: fields.column,
      mutator: fields.mutator,
      replacement: fields.replacement.slice(0, MUTATION_REPLACEMENT_LIMIT),
    });
    return;
  }
  counts.invalid += 1;
}

/**
 * Read `files[<file>].mutants[]` from the report at `reportPath`. Returns null
 * when the report is missing, isn't JSON, or has no `files` object; otherwise
 * counts only the mutants whose start line falls in one of `ranges`.
 */
export function readMutationReport(
  reportPath: string,
  file: string,
  ranges: readonly string[],
): MutationCounts | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch {
    return null;
  }
  const files = asRecord(asRecord(parsed)?.files);
  if (files === null) return null;
  const mutants = asRecord(files[file])?.mutants;
  const counts = { killed: 0, survived: 0, invalid: 0, survivors: [] as MutationSurvivor[] };
  const parsedRanges = intervals(file, ranges);
  if (Array.isArray(mutants)) {
    for (const mutant of mutants) countMutant(mutant, file, parsedRanges, counts);
  }
  return counts;
}
