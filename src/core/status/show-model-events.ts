import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  RecertificationAttribution,
  RecertificationDetail,
  TimelineEvent,
  VerificationCheckRow,
  VerificationHistory,
  VerificationOutcomeRow,
} from './show-types.js';
import { stringList } from './show-types.js';

/** One typed recertification event with its stream position for stable ties. */
export interface RecertificationEvent {
  seq: number;
  streamTask: string;
  event: TimelineEvent;
}

/** The parsed event streams of one change folder. */
export interface EventStreams {
  timeline: TimelineEvent[];
  taskEventsMap: Map<string, TimelineEvent[]>;
  recertificationEvents: RecertificationEvent[];
}

function numericTaskTarget(value: unknown): string | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return String(value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return value.trim();
  }
  return null;
}

function attributionEntries(value: unknown): RecertificationAttribution[] {
  if (!Array.isArray(value)) return [];
  const entries: RecertificationAttribution[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const { path: rawPath, attribution: rawAttribution } = entry as {
      path?: unknown;
      attribution?: unknown;
    };
    if (typeof rawPath !== 'string' || rawPath.trim() === '') continue;
    const attribution =
      typeof rawAttribution === 'string' && rawAttribution.trim() !== ''
        ? rawAttribution.trim()
        : typeof rawAttribution === 'number' && Number.isFinite(rawAttribution)
          ? String(rawAttribution)
          : 'unknown';
    entries.push({ path: rawPath.trim(), attribution });
  }
  return entries;
}

/**
 * Projects one typed `recertification` event into a display row. Only explicit,
 * well-formed values are surfaced; everything else is unavailable. The row is
 * built solely from the already parsed event, never from marker files.
 */
function buildRecertification(taskNumber: string, event: TimelineEvent): RecertificationDetail {
  const data = event.data ?? {};
  const differingPaths = [...new Set(stringList(data.differingPaths))].sort();
  const recorded = attributionEntries(data.attribution);
  const byPath = new Map<string, string>();
  for (const entry of recorded) {
    if (!byPath.has(entry.path)) byPath.set(entry.path, entry.attribution);
  }
  const allPaths = [...new Set([...differingPaths, ...recorded.map((entry) => entry.path)])].sort();
  const attribution = allPaths.map((path) => ({
    path,
    attribution: byPath.get(path) ?? 'unknown',
  }));

  const rawTimestamp = typeof event.timestamp === 'string' ? event.timestamp.trim() : '';
  const timestamp =
    rawTimestamp && !Number.isNaN(new Date(rawTimestamp).getTime()) ? rawTimestamp : null;
  const outcome: 'passed' | 'requeued' | null =
    data.outcome === 'passed' ? 'passed' : data.outcome === 'requeued' ? 'requeued' : null;
  const verify =
    typeof data.command === 'string' && data.command.trim() !== '' ? data.command.trim() : null;
  const exitCode =
    typeof data.exitCode === 'number' && Number.isFinite(data.exitCode) ? data.exitCode : null;
  const timedOut = typeof data.timedOut === 'boolean' ? data.timedOut : null;

  return {
    taskNumber,
    timestamp,
    outcome,
    differingPaths,
    attribution,
    verify,
    exitCode,
    timedOut,
  };
}

/**
 * Read `.run/events/*.jsonl` into the chronological timeline and the per-task
 * streams, keeping typed recertification decisions in stream order.
 */
export async function readEventStreams(runDir: string): Promise<EventStreams> {
  const eventsDir = path.join(runDir, 'events');
  let eventFiles: string[] = [];
  try {
    eventFiles = (await fs.readdir(eventsDir))
      .filter((e) => e.endsWith('.jsonl'))
      .sort((a, b) => {
        const numA = Number.parseInt(a, 10);
        const numB = Number.parseInt(b, 10);
        if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
          return numA - numB;
        }
        return a.localeCompare(b);
      });
  } catch {}

  const taskEventsMap = new Map<string, TimelineEvent[]>();
  const timeline: TimelineEvent[] = [];
  // Typed recertification decisions from numbered task streams only, kept with
  // their original stream order so ties break deterministically.
  const recertificationEvents: RecertificationEvent[] = [];
  let eventSeq = 0;

  for (const eventFile of eventFiles) {
    const taskNum = path.basename(eventFile, '.jsonl');
    const eventFilePath = path.join(eventsDir, eventFile);
    try {
      const fileContent = await fs.readFile(eventFilePath, 'utf8');
      const lines = fileContent.split('\n');
      const taskEvents: TimelineEvent[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          const event: TimelineEvent = {
            taskNumber: String(parsed.taskNumber || taskNum),
            type: String(parsed.type || 'unknown'),
            timestamp: String(parsed.timestamp || ''),
            data:
              typeof parsed.data === 'object' && parsed.data !== null
                ? (parsed.data as Record<string, unknown>)
                : undefined,
          };
          taskEvents.push(event);
          timeline.push(event);
          if (event.type === 'recertification' && /^\d+$/.test(taskNum)) {
            recertificationEvents.push({ seq: eventSeq, streamTask: taskNum, event });
          }
          eventSeq++;
        } catch {}
      }
      taskEventsMap.set(taskNum, taskEvents);
    } catch {}
  }

  // Sort overall timeline chronologically
  timeline.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
      return timeA - timeB;
    }
    return a.timestamp.localeCompare(b.timestamp);
  });

  return { timeline, taskEventsMap, recertificationEvents };
}

/** Project typed recertification events into display rows in decision order. */
export function buildRecertifications(
  recertificationEvents: readonly RecertificationEvent[],
): RecertificationDetail[] {
  return recertificationEvents
    .map(({ seq, streamTask, event }) => ({
      seq,
      row: buildRecertification(numericTaskTarget(event.data?.task) ?? streamTask, event),
    }))
    .sort((a, b) => {
      const timeA = a.row.timestamp ? new Date(a.row.timestamp).getTime() : null;
      const timeB = b.row.timestamp ? new Date(b.row.timestamp).getTime() : null;
      if (timeA !== null && timeB !== null && timeA !== timeB) {
        return timeA - timeB;
      }
      const numA = Number.parseInt(a.row.taskNumber, 10);
      const numB = Number.parseInt(b.row.taskNumber, 10);
      if (numA !== numB) {
        return numA - numB;
      }
      return a.seq - b.seq;
    })
    .map((entry) => entry.row);
}

/** A recorded timestamp when it parses, else `unavailable`. */
function showTime(value: string): string {
  return value && !Number.isNaN(new Date(value).getTime()) ? value : 'unavailable';
}

/**
 * Project the change-level `check_ran` and `verification_recorded` events of
 * an archived change into the `Verification:` section rows. Missing optional
 * values stay unavailable rather than being guessed.
 */
export function buildVerificationHistory(timeline: TimelineEvent[]): VerificationHistory {
  const checks: VerificationCheckRow[] = [];
  const outcomes: VerificationOutcomeRow[] = [];
  for (const event of timeline) {
    const data = event.data ?? {};
    if (event.type === 'check_ran') {
      checks.push({
        time: showTime(event.timestamp),
        command:
          typeof data.command === 'string' && data.command.trim() !== ''
            ? data.command.trim()
            : 'unavailable',
        exitCode:
          typeof data.exitCode === 'number' && Number.isFinite(data.exitCode)
            ? data.exitCode
            : null,
      });
    } else if (event.type === 'verification_recorded') {
      outcomes.push({
        time: showTime(event.timestamp),
        outcome: data.outcome === 'passed' || data.outcome === 'failed' ? data.outcome : null,
        note: typeof data.note === 'string' && data.note.trim() !== '' ? data.note.trim() : null,
      });
    }
  }
  return { checks, outcomes };
}
