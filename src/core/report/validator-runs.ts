/**
 * The `validator_ran` events of one change, read defensively: wrong-typed fields
 * become null and a finding missing any string field is left out. Read through
 * the shared event-stream reader so history queries read each stream once.
 */

import path from 'node:path';
import { asData } from './report-events.js';
import { readEventStream } from './stream-reads.js';

/** One validator finding with each string field present. */
export interface ValidatorRunFinding {
  readonly capability: string;
  readonly requirement: string;
  readonly scenario: string;
  readonly problem: string;
  readonly detail: string;
}

/** One `validator_ran` event of a change, with each data field read defensively. */
export interface ValidatorRun {
  /** 1-based position among the change's `validator_ran` events. */
  readonly run: number;
  readonly timestamp: string | null;
  readonly outcome: string | null;
  readonly harness: string | null;
  readonly model: string | null;
  readonly duration: number | null;
  readonly exitCode: number | null;
  readonly scenarios: number | null;
  readonly findings: readonly ValidatorRunFinding[];
  readonly reason: string | null;
  readonly output: string | null;
}

/** The value as a string, or null when it is of another type. */
function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** The value as a finite number, or null when it is of another type. */
function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** One finding with string capability, requirement, scenario, problem and detail. */
function readFinding(value: unknown): ValidatorRunFinding | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const capability = asString(record.capability);
  const requirement = asString(record.requirement);
  const scenario = asString(record.scenario);
  const problem = asString(record.problem);
  const detail = asString(record.detail);
  if (capability === null || requirement === null || scenario === null) return null;
  if (problem === null || detail === null) return null;
  return { capability, requirement, scenario, problem, detail };
}

/** Every valid finding of a value's `findings` array, in order. */
function readFindings(value: unknown): ValidatorRunFinding[] {
  if (!Array.isArray(value)) return [];
  const findings: ValidatorRunFinding[] = [];
  for (const entry of value) {
    const finding = readFinding(entry);
    if (finding !== null) findings.push(finding);
  }
  return findings;
}

/**
 * Every `validator_ran` event of a change's `.run/events/change.jsonl`, in file
 * order, with its 1-based run number and its data read defensively. An event
 * without object data adds no entry.
 *
 * @scenario metrics-and-reporting: Trial rows of one archived change
 * @adr 008
 */
export async function readValidatorRuns(folderPath: string): Promise<ValidatorRun[]> {
  const stream = path.join(folderPath, '.run', 'events', 'change.jsonl');
  const events = (await readEventStream(stream)) ?? [];
  const runs: ValidatorRun[] = [];
  let position = 0;
  for (const event of events) {
    if (event.type !== 'validator_ran') continue;
    position++;
    const data = asData(event);
    if (data === null) continue;
    runs.push({
      run: position,
      timestamp: asString(event.timestamp),
      outcome: asString(data.outcome),
      harness: asString(data.harness),
      model: asString(data.model),
      duration: asNumber(data.duration),
      exitCode: asNumber(data.exitCode),
      scenarios: asNumber(data.scenarios),
      findings: readFindings(data.findings),
      reason: asString(data.reason),
      output: asString(data.output),
    });
  }
  return runs;
}
