/**
 * Validator outcomes in the report: the latest `validator_ran` event in each
 * archived change's `.run/events/change.jsonl`, counted by outcome and by the
 * findings of validated runs. Read through the shared reader; nothing is
 * persisted.
 */

import path from 'node:path';
import { compareNumericPrefix } from '../status/state.js';
import { asData, eventTimestampMs } from './report-events.js';
import { readEventStream } from './stream-reads.js';

/** One archived change's latest validator run, by folder name. */
export interface ValidationPerChange {
  readonly change: string;
  readonly outcome: string;
  readonly findings: number;
}

/** The validator summary the report prints and serializes. */
export interface ValidationSummary {
  readonly changes: number;
  readonly validated: number;
  readonly findings: number;
  readonly perChange: readonly ValidationPerChange[];
}

/** One validator run reduced to its outcome and finding count. */
interface ObservedValidation {
  readonly outcome: string;
  readonly findings: number;
  readonly timestamp: number;
}

/** A trimmed non-empty string, or null. */
function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The findings array's length for a validated run, else zero. */
function findingCount(outcome: string, value: unknown): number {
  if (outcome !== 'validated' || !Array.isArray(value)) return 0;
  return value.length;
}

/** One `validator_ran` event's outcome and finding count, or null when malformed. */
function readValidation(
  data: Record<string, unknown> | null,
  timestamp: number,
): ObservedValidation | null {
  if (data === null) return null;
  const outcome = nonEmptyString(data.outcome);
  if (outcome === null) return null;
  return { outcome, findings: findingCount(outcome, data.findings), timestamp };
}

/** The latest `validator_ran` event in one change's `change.jsonl`, or null. */
async function latestForChange(folderPath: string): Promise<ObservedValidation | null> {
  const stream = path.join(folderPath, '.run', 'events', 'change.jsonl');
  const events = await readEventStream(stream);
  if (events === null) return null;

  let latest: ObservedValidation | null = null;
  for (const event of events) {
    if (event.type !== 'validator_ran') continue;
    const timestamp = eventTimestampMs(event);
    if (timestamp === null) continue;
    const parsed = readValidation(asData(event), timestamp);
    if (parsed === null) continue;
    if (latest === null || parsed.timestamp >= latest.timestamp) latest = parsed;
  }
  return latest;
}

/**
 * The latest `validator_ran` event per archived change folder, in folder name
 * order. Returns undefined when no folder has a readable event, so the report
 * is unchanged for a project that never ran a validator.
 */
export async function collectValidation(
  folders: readonly string[],
): Promise<ValidationSummary | undefined> {
  const perChange: ValidationPerChange[] = [];
  for (const folderPath of folders) {
    const observed = await latestForChange(folderPath);
    if (observed === null) continue;
    perChange.push({
      change: path.basename(folderPath),
      outcome: observed.outcome,
      findings: observed.findings,
    });
  }
  if (perChange.length === 0) return undefined;

  perChange.sort((a, b) => compareNumericPrefix(a.change, b.change));

  let validated = 0;
  let findings = 0;
  for (const entry of perChange) {
    if (entry.outcome !== 'validated') continue;
    validated++;
    findings += entry.findings;
  }

  return { changes: perChange.length, validated, findings, perChange };
}

/** Render the `Validation:` section body, one line per change. */
export function formatValidation(summary: ValidationSummary): string[] {
  const lines = [
    'Validation:',
    `  ${summary.validated} of ${summary.changes} changes validated, ${summary.findings} findings`,
  ];
  for (const entry of summary.perChange) {
    lines.push(
      entry.outcome === 'validated'
        ? `  ${entry.change}: ${entry.findings} findings`
        : `  ${entry.change}: not validated (${entry.outcome})`,
    );
  }
  return lines;
}
