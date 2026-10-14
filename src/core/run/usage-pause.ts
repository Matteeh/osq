/**
 * The usage-limit pause: `.run/paused.md` in a change folder. When an agent
 * stops because the account hit the model provider's usage limit, the watcher
 * writes this marker with the time the task may run again, and appends a
 * `paused` event. The frontmatter holds the task number, the ISO time and the
 * source; the body holds the limit's error, or `usage limit reached`.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { parseFrontmatter } from '../spec/parser.js';

/** What a `usage_limit` event's data carries: the reset time or the error. */
export interface UsageLimit {
  readonly resetsAt?: string;
  readonly error?: string;
}

/** Where the pause time came from: the harness's reset time, or a fixed wait. */
export type PauseSource = 'harness' | 'wait';

/** One `.run/paused.md` record. */
export interface UsagePause {
  /** The task number, as the string it was written as. */
  readonly task: string;
  /** ISO time the task may run again. */
  readonly until: string;
  readonly source: PauseSource;
  /** The limit's error, absent without one. */
  readonly error?: string;
}

/** The default body when the limit carried no error. */
const DEFAULT_BODY = 'usage limit reached';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * `<changeFolder>/.run/paused.md`.
 *
 * @scenario watcher-and-harness: Active pause
 */
export function usagePausePath(folderPath: string): string {
  return path.join(folderPath, '.run', 'paused.md');
}

/**
 * The data of the last `usage_limit` event among the events, or undefined
 * without one. Reads plain records so `src/core/run` need not know adapters.
 *
 * @scenario watcher-and-harness: Last limit wins
 */
export function findUsageLimit(events: readonly unknown[]): UsageLimit | undefined {
  let found: UsageLimit | undefined;
  for (const event of events) {
    const record = asRecord(event);
    if (record === null || record.type !== 'usage_limit') continue;
    const data = asRecord(record.data) ?? {};
    found = {
      ...(typeof data.resetsAt === 'string' ? { resetsAt: data.resetsAt } : {}),
      ...(typeof data.error === 'string' ? { error: data.error } : {}),
    };
  }
  return found;
}

/**
 * The pause `now` plus `waitSeconds` unless the limit gives a later reset time,
 * in which case the reset time and source `harness`. `now` is epoch
 * milliseconds.
 *
 * @scenario watcher-and-harness: Pause times
 */
export function pauseUntil(
  limit: UsageLimit,
  now: number,
  waitSeconds: number,
): { until: string; source: PauseSource } {
  const resetsAt = limit.resetsAt;
  if (resetsAt !== undefined) {
    const parsed = Date.parse(resetsAt);
    if (!Number.isNaN(parsed) && parsed > now) {
      return { until: new Date(parsed).toISOString(), source: 'harness' };
    }
  }
  return { until: new Date(now + waitSeconds * 1000).toISOString(), source: 'wait' };
}

/**
 * Render an ISO time in UTC as `YYYY-MM-DD HH:MM UTC`.
 *
 * @scenario watcher-and-harness: Active pause
 */
export function formatPauseUntil(until: string): string {
  const date = new Date(until);
  const pad = (value: number): string => String(value).padStart(2, '0');
  const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  return `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

/**
 * Write `.run/paused.md`, creating `.run/` when needed. `task` and `until` are
 * written as quoted strings, so a task number reads back as a string.
 *
 * @scenario watcher-and-harness: Active pause
 */
export async function writeUsagePause(folderPath: string, pause: UsagePause): Promise<void> {
  const frontmatter = YAML.stringify(
    { task: pause.task, until: pause.until, source: pause.source },
    { defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN' },
  ).trimEnd();
  const body = pause.error ?? DEFAULT_BODY;
  const content = `---\n${frontmatter}\n---\n${body}\n`;
  await fs.mkdir(path.dirname(usagePausePath(folderPath)), { recursive: true });
  await fs.writeFile(usagePausePath(folderPath), content, 'utf8');
}

function parsePause(content: string): UsagePause | null {
  const { data, body } = parseFrontmatter(content);
  const { task, until, source } = data;
  if (typeof task !== 'string' || typeof until !== 'string') return null;
  if (Number.isNaN(Date.parse(until))) return null;
  if (source !== 'harness' && source !== 'wait') return null;
  const text = body.trim();
  const error = text.length > 0 && text !== DEFAULT_BODY ? text : undefined;
  return { task, until, source, ...(error !== undefined ? { error } : {}) };
}

/**
 * Read `.run/paused.md`, or null for a missing or malformed file.
 *
 * @scenario watcher-and-harness: Active pause
 * @scenario watcher-and-harness: Unreadable marker
 */
export async function readUsagePause(folderPath: string): Promise<UsagePause | null> {
  const content = await fs.readFile(usagePausePath(folderPath), 'utf8').catch(() => null);
  return content === null ? null : parsePause(content);
}

/**
 * The pause only while its `until` is later than `now`, in epoch milliseconds.
 *
 * @scenario watcher-and-harness: Active pause
 * @scenario watcher-and-harness: Unreadable marker
 */
export async function readActivePause(folderPath: string, now: number): Promise<UsagePause | null> {
  const pause = await readUsagePause(folderPath);
  if (pause === null) return null;
  return Date.parse(pause.until) > now ? pause : null;
}
