/** The `Inbox waiting` report section, computed from the per-project wait log. */
import type { DispatchKind } from '../status/dispatch-items.js';
import {
  type WaitEpisode,
  type WaitRecord,
  type WaitStartRecord,
  readWaitLog,
  waitEpisodes,
} from '../status/wait-log.js';
type WaitKind = DispatchKind | 'verify';
const KINDS: readonly WaitKind[] = ['approval', 'halt', 'land', 'verify'];
export interface InboxWaitKindReport {
  readonly handled: number;
  readonly medianSeconds: number | null;
  readonly longestSeconds: number | null;
  readonly startedUnseen: number;
  readonly endedUnseen: number;
}
export interface InboxWaitSessionsReport {
  readonly count: number;
  readonly handled: number;
  readonly medianHandled: number;
  readonly mostHandled: number;
}
export interface InboxWaitReport {
  readonly since: string | null;
  readonly until: string | null;
  readonly kinds: Record<WaitKind, InboxWaitKindReport>;
  readonly idleSeconds: number | null;
  readonly sessions: InboxWaitSessionsReport | null;
}
export interface InboxWaitOptions {
  readonly home?: string;
  readonly since?: Date | null;
  readonly until?: Date | null;
}
function secondsBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 1000);
}
/** Median in whole seconds; an even count uses the mean of the middle two. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
/** Since inclusive, until exclusive; a null bound is unbounded. */
function inPeriod(at: string, sinceMs: number | null, untilMs: number | null): boolean {
  const ms = Date.parse(at);
  if (sinceMs !== null && ms < sinceMs) return false;
  if (untilMs !== null && ms >= untilMs) return false;
  return true;
}
/** One kind's observed waits; an unobserved gone counts only as endedUnseen. */
function collectKind(
  episodes: readonly WaitEpisode[],
  kind: WaitKind,
  sinceMs: number | null,
  untilMs: number | null,
): InboxWaitKindReport {
  let handled = 0;
  let startedUnseen = 0;
  let endedUnseen = 0;
  const durations: number[] = [];
  for (const episode of episodes) {
    if (episode.item.kind !== kind) continue;
    if (episode.gone === null) continue;
    if (!inPeriod(episode.gone.at, sinceMs, untilMs)) continue;
    if (episode.gone.unobserved) {
      endedUnseen++;
      continue;
    }
    handled++;
    if (episode.seen.unobserved) startedUnseen++;
    durations.push(secondsBetween(episode.seen.at, episode.gone.at));
  }
  if (handled === 0) {
    return { handled, medianSeconds: null, longestSeconds: null, startedUnseen, endedUnseen };
  }
  return {
    handled,
    medianSeconds: median(durations),
    longestSeconds: Math.max(...durations),
    startedUnseen,
    endedUnseen,
  };
}
/** Length of the union of `[start, end)` intervals, in milliseconds. */
function unionLength(intervals: Array<[number, number]>): number {
  if (intervals.length === 0) return 0;
  intervals.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [currentStart, currentEnd] = intervals[0];
  for (let i = 1; i < intervals.length; i++) {
    const [start, end] = intervals[i];
    if (start > currentEnd) {
      total += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    } else if (end > currentEnd) {
      currentEnd = end;
    }
  }
  return total + (currentEnd - currentStart);
}
/**
 * Idle time: each `top` with an item and `idle` true runs to the next `top` or
 * `stop` of its session, clipped to the period; null without a `top`.
 */
function collectIdleSeconds(
  records: readonly WaitRecord[],
  sinceMs: number | null,
  untilMs: number | null,
): number | null {
  const hasTop = records.some(
    (record) => record.type === 'top' && inPeriod(record.at, sinceMs, untilMs),
  );
  if (!hasTop) return null;
  const bySession = new Map<string, Array<{ at: number; idleStart: boolean }>>();
  for (const record of records) {
    if (record.type !== 'top' && record.type !== 'stop') continue;
    const marks = bySession.get(record.session) ?? [];
    marks.push({
      at: Date.parse(record.at),
      idleStart: record.type === 'top' && record.item !== null && record.idle,
    });
    bySession.set(record.session, marks);
  }
  const intervals: Array<[number, number]> = [];
  for (const marks of bySession.values()) {
    for (let i = 0; i < marks.length - 1; i++) {
      if (!marks[i].idleStart) continue;
      const start = Math.max(marks[i].at, sinceMs ?? Number.NEGATIVE_INFINITY);
      const end = Math.min(marks[i + 1].at, untilMs ?? Number.POSITIVE_INFINITY);
      if (end > start) intervals.push([start, end]);
    }
  }
  return Math.round(unionLength(intervals) / 1000);
}
/** Card sessions inside the period and the episodes opened and closed in one. */
function collectSessions(
  records: readonly WaitRecord[],
  episodes: readonly WaitEpisode[],
  sinceMs: number | null,
  untilMs: number | null,
): InboxWaitSessionsReport | null {
  const ids = records
    .filter(
      (record): record is WaitStartRecord =>
        record.type === 'start' && record.mode === 'cards' && inPeriod(record.at, sinceMs, untilMs),
    )
    .map((record) => record.session);
  if (ids.length === 0) return null;
  const cardSessions = new Set(ids);
  const counts = new Map<string, number>(ids.map((id) => [id, 0]));
  let handled = 0;
  for (const episode of episodes) {
    if (episode.opened === null || episode.gone === null) continue;
    if (episode.gone.unobserved) continue;
    if (episode.opened.session !== episode.gone.session) continue;
    if (!cardSessions.has(episode.opened.session)) continue;
    handled++;
    counts.set(episode.opened.session, (counts.get(episode.opened.session) ?? 0) + 1);
  }
  const perSession = [...counts.values()];
  return {
    count: ids.length,
    handled,
    medianHandled: median(perSession),
    mostHandled: Math.max(...perSession),
  };
}
/** Null when there is no wait log under the home, so the report is unchanged. */
export async function collectInboxWait(
  projectRoot: string,
  options: InboxWaitOptions = {},
): Promise<InboxWaitReport | null> {
  const records = await readWaitLog(projectRoot, options.home);
  if (records === null) return null;
  const since = options.since ?? null;
  const until = options.until ?? null;
  const sinceMs = since === null ? null : since.getTime();
  const untilMs = until === null ? null : until.getTime();
  const episodes = waitEpisodes(records);
  const kinds = {} as Record<WaitKind, InboxWaitKindReport>;
  for (const kind of KINDS) kinds[kind] = collectKind(episodes, kind, sinceMs, untilMs);
  return {
    since: since === null ? null : since.toISOString(),
    until: until === null ? null : until.toISOString(),
    kinds,
    idleSeconds: collectIdleSeconds(records, sinceMs, untilMs),
    sessions: collectSessions(records, episodes, sinceMs, untilMs),
  };
}
function formatWait(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}
/** A bound as `YYYY-MM-DD` when midnight UTC, otherwise its ISO string. */
function formatBound(iso: string | null, fallback: string): string {
  if (iso === null) return fallback;
  const date = new Date(iso);
  const midnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;
  return midnight ? date.toISOString().slice(0, 10) : date.toISOString();
}
/** One kind's line, with the unseen markers appended when they are above zero. */
function formatKindLine(kind: WaitKind, entry: InboxWaitKindReport): string {
  let line: string;
  if (entry.handled === 0) {
    line = `  ${kind}: not measured`;
  } else {
    line =
      `  ${kind}: ${entry.handled} handled, median ${formatWait(entry.medianSeconds ?? 0)}` +
      `, longest ${formatWait(entry.longestSeconds ?? 0)}`;
    if (entry.startedUnseen > 0) line += `, ${entry.startedUnseen} first seen at inbox start`;
  }
  if (entry.endedUnseen > 0) line += `, ${entry.endedUnseen} gone while no inbox ran`;
  return line;
}
/** The `Inbox waiting` section lines, in the report's fixed order. */
export function formatInboxWait(report: InboxWaitReport): string[] {
  const lines = [
    `Inbox waiting (${formatBound(report.since, 'start')} to ${formatBound(report.until, 'now')}):`,
  ];
  for (const kind of KINDS) lines.push(formatKindLine(kind, report.kinds[kind]));
  lines.push(
    report.idleSeconds === null
      ? "  watcher idle on a human's item: not measured"
      : `  watcher idle on a human's item: ${formatWait(report.idleSeconds)}`,
  );
  if (report.sessions === null) {
    lines.push('  card sessions: not measured');
  } else {
    lines.push(
      `  card sessions: ${report.sessions.count}, ${report.sessions.handled} handled,` +
        ` median ${report.sessions.medianHandled} per session, most ${report.sessions.mostHandled}`,
    );
  }
  return lines;
}
