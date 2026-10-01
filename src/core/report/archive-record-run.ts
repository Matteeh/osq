/** Event-stream fields of one archived change record: attempts, dead, halts, cost, models. */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { LocatedChange } from '../status/change-locations.js';
import { asData, observeTaskStream, parseEventLines } from './report-events.js';
import { observeRetries } from './report-retries.js';

/** One `dead` event: the task that died and why. */
export interface ArchivedDeadAttempt {
  readonly task: string;
  readonly reason: string;
}

/** The run-derived fields of an archived change, null when no events exist. */
export interface ArchivedRunFields {
  readonly attempts: number | null;
  readonly dead: readonly ArchivedDeadAttempt[] | null;
  readonly halts: number | null;
  readonly cost: number | null;
  readonly executorModels: readonly string[];
}

const EVENTS_DIR = path.join('.run', 'events');
const TASK_STREAM = /^\d+\.jsonl$/;

/** Whether a file in the events folder is a numbered task stream. */
function isTaskStream(fileName: string): boolean {
  return TASK_STREAM.test(fileName);
}

/** Numeric value of a task-stream file name, for stream ordering. */
function streamNumber(fileName: string): number {
  return Number.parseInt(fileName, 10);
}

/** A `dead` event's task: its string `data.task`, else the stream's number. */
function deadTask(data: Record<string, unknown> | null, stream: string): string {
  const raw = data?.task;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return stream.replace(/\.jsonl$/, '');
}

/** A `dead` event's reason, trimmed, or `unknown` when absent. */
function deadReason(data: Record<string, unknown> | null): string {
  const raw = data?.reason;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : 'unknown';
}

/** Appends one `{ task, reason }` per `dead` event, keeping stream order. */
function collectDead(
  events: readonly Record<string, unknown>[],
  stream: string,
  into: ArchivedDeadAttempt[],
): void {
  for (const event of events) {
    if (event.type !== 'dead') continue;
    const data = asData(event);
    into.push({ task: deadTask(data, stream), reason: deadReason(data) });
  }
}

/** Parses one stream, reading a missing or unreadable file as no events. */
async function readStream(filePath: string): Promise<Record<string, unknown>[]> {
  const content = await fs.readFile(filePath, 'utf8').catch(() => null);
  return content === null ? [] : parseEventLines(content);
}

/** Adds one task stream's attempts, retries, dead events, cost, and models. */
function addStream(
  events: readonly Record<string, unknown>[],
  stream: string,
  state: {
    attempts: number;
    halts: number;
    cost: number;
    costReported: boolean;
    dead: ArchivedDeadAttempt[];
    models: Set<string>;
  },
): void {
  const observed = observeTaskStream(events);
  state.attempts += observed.attempts;
  state.halts += observeRetries(events).manual.count;
  collectDead(events, stream, state.dead);
  for (const value of observed.costValues) {
    state.cost += value;
    state.costReported = true;
  }
  for (const event of events) {
    if (event.type !== 'started') continue;
    const model = asData(event)?.model;
    if (typeof model === 'string' && model.trim()) state.models.add(model.trim());
  }
}

/**
 * Reads the `.run/events` folder of an archived change. Every field is null
 * when the folder is missing; otherwise attempts, dead, and halts are read
 * from the numbered task streams plus `change.jsonl`, and cost sums the finite
 * `cost` values the task streams report.
 */
export async function readArchivedRunFields(change: LocatedChange): Promise<ArchivedRunFields> {
  const eventsDir = path.join(change.folderPath, EVENTS_DIR);
  const entries = await fs.readdir(eventsDir).catch(() => null);
  if (entries === null) {
    return { attempts: null, dead: null, halts: null, cost: null, executorModels: [] };
  }

  const streams = entries.filter(isTaskStream).sort((a, b) => streamNumber(a) - streamNumber(b));
  const state = {
    attempts: 0,
    halts: 0,
    cost: 0,
    costReported: false,
    dead: [] as ArchivedDeadAttempt[],
    models: new Set<string>(),
  };

  for (const stream of streams) {
    addStream(await readStream(path.join(eventsDir, stream)), stream, state);
  }
  state.halts += observeRetries(
    await readStream(path.join(eventsDir, 'change.jsonl')),
  ).manual.count;

  return {
    attempts: state.attempts,
    dead: state.dead,
    halts: state.halts,
    cost: state.costReported ? state.cost : null,
    executorModels: [...state.models].sort(),
  };
}
