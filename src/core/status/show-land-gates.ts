import type { LandGate } from './show-land-types.js';
import type { TimelineEvent } from './show-types.js';

/** A plain object guard. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A finite number, else null. */
function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The event's `data.command` string, or an empty string. */
function commandOf(event: TimelineEvent): string {
  const command = asRecord(event.data)?.command;
  return typeof command === 'string' ? command : '';
}

/** Whether the event recorded a `phase`, such as `pre_spawn`. */
function hasPhase(event: TimelineEvent): boolean {
  return typeof asRecord(event.data)?.phase === 'string';
}

/** The parsed milliseconds of a timestamp, or null. */
function timeOf(timestamp: string): number | null {
  const ms = Date.parse(timestamp);
  return Number.isFinite(ms) ? ms : null;
}

/** The latest event matching `match`, walking the timeline backwards. */
function lastEvent(
  events: readonly TimelineEvent[],
  match: (event: TimelineEvent) => boolean,
): TimelineEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event !== undefined && match(event)) return event;
  }
  return null;
}

/** One `verify_ran`-derived gate, its outcome read from the exit code. */
function runGate(kind: LandGate['kind'], task: string | null, event: TimelineEvent): LandGate {
  const data = asRecord(event.data) ?? {};
  const exitCode = finite(data.exitCode);
  return {
    kind,
    task,
    command: commandOf(event),
    outcome: exitCode === 0 ? 'passed' : 'failed',
    exitCode,
    durationSeconds: finite(data.duration),
    timestamp: event.timestamp,
    findings: null,
  };
}

/** The validator gate, whose command and outcome are its own. */
function validatorGate(event: TimelineEvent): LandGate {
  const data = asRecord(event.data) ?? {};
  const findings = Array.isArray(data.findings) ? data.findings.length : 0;
  return {
    kind: 'validator',
    task: null,
    command: `${String(data.harness ?? '?')}/${String(data.model ?? '?')}`,
    outcome: typeof data.outcome === 'string' ? data.outcome : 'unknown',
    exitCode: finite(data.exitCode),
    durationSeconds: finite(data.duration),
    timestamp: event.timestamp,
    findings,
  };
}

/** The milliseconds of the last `archived` event, or null without one. */
function archiveCutoff(timeline: readonly TimelineEvent[]): number | null {
  let cutoff: number | null = null;
  for (const event of timeline) {
    if (event.type !== 'archived') continue;
    const ms = timeOf(event.timestamp);
    if (ms !== null && (cutoff === null || ms > cutoff)) cutoff = ms;
  }
  return cutoff;
}

/**
 * The gate runs osq recorded while archiving the change: the last pre-archive
 * run of each numbered task stream, then the proposal verify, the declared
 * check, and the validator. Events after the last `archived` event do not count.
 */
export function buildLandGates(
  timeline: readonly TimelineEvent[],
  proposalVerify: string,
  checkCommand: string | null,
): LandGate[] {
  const cutoff = archiveCutoff(timeline);
  if (cutoff === null) return [];
  const before = timeline.filter((event) => {
    const ms = timeOf(event.timestamp);
    return ms !== null && ms <= cutoff;
  });

  const gates: LandGate[] = [];
  const taskNumbers = [...new Set(before.map((event) => event.taskNumber))]
    .filter((task) => /^\d+$/.test(task))
    .sort((a, b) => Number(a) - Number(b));
  for (const task of taskNumbers) {
    const event = lastEvent(
      before,
      (candidate) =>
        candidate.taskNumber === task && candidate.type === 'verify_ran' && !hasPhase(candidate),
    );
    if (event) gates.push(runGate('task', task, event));
  }

  if (proposalVerify !== '') {
    const event = lastEvent(
      before,
      (candidate) =>
        candidate.taskNumber === 'change' &&
        candidate.type === 'verify_ran' &&
        commandOf(candidate) === proposalVerify,
    );
    if (event) gates.push(runGate('verify', null, event));
  }

  if (checkCommand !== null) {
    const event = lastEvent(
      before,
      (candidate) =>
        candidate.taskNumber === 'change' &&
        candidate.type === 'verify_ran' &&
        commandOf(candidate) === checkCommand,
    );
    if (event) gates.push(runGate('check', null, event));
  }

  const validator = lastEvent(before, (candidate) => candidate.type === 'validator_ran');
  if (validator) gates.push(validatorGate(validator));

  return gates;
}
