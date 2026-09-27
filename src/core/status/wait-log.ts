import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DispatchItem, DispatchKind } from './dispatch-items.js';

/**
 * The per-project wait log beside `~/.osq/last-look/`. Only `osq inbox`'s card
 * session and `--follow` append to it; every reader folds the records into
 * episodes so two runs writing at once do not double-count.
 */

/** Which inbox mode opened a session. */
export type WaitMode = 'cards' | 'follow';

/** One item as the log writes it: kind, change folder, task number or null. */
export interface WaitItem {
  readonly kind: DispatchKind;
  readonly change: string;
  readonly task: string | null;
}

/** The fields every log record carries. */
interface WaitBase {
  readonly at: string;
  readonly session: string;
}

export interface WaitStartRecord extends WaitBase {
  readonly type: 'start';
  readonly mode: WaitMode;
  readonly idle: boolean;
}

export interface WaitSeenRecord extends WaitBase {
  readonly type: 'seen';
  readonly item: WaitItem;
  readonly idle: boolean;
  readonly unobserved: boolean;
}

export interface WaitOpenedRecord extends WaitBase {
  readonly type: 'opened';
  readonly item: WaitItem;
  readonly idle: boolean;
}

export interface WaitGoneRecord extends WaitBase {
  readonly type: 'gone';
  readonly item: WaitItem;
  readonly idle: boolean;
  readonly unobserved: boolean;
}

export interface WaitTopRecord extends WaitBase {
  readonly type: 'top';
  readonly item: WaitItem | null;
  readonly idle: boolean;
}

export interface WaitStopRecord extends WaitBase {
  readonly type: 'stop';
}

/** One line of the wait log, discriminated by `type`. */
export type WaitRecord =
  | WaitStartRecord
  | WaitSeenRecord
  | WaitOpenedRecord
  | WaitGoneRecord
  | WaitTopRecord
  | WaitStopRecord;

/** One item's stay in the inbox, from its first `seen` to its `gone`. */
export interface WaitEpisode {
  readonly item: WaitItem;
  readonly seen: {
    readonly at: string;
    readonly session: string;
    readonly idle: boolean;
    readonly unobserved: boolean;
  };
  readonly opened: { readonly at: string; readonly session: string } | null;
  readonly gone: {
    readonly at: string;
    readonly session: string;
    readonly idle: boolean;
    readonly unobserved: boolean;
  } | null;
}

interface MutableEpisode {
  item: WaitItem;
  seen: WaitEpisode['seen'];
  opened: WaitEpisode['opened'];
  gone: WaitEpisode['gone'];
}

const RECORD_TYPES = new Set(['start', 'seen', 'opened', 'gone', 'top', 'stop']);

/** Per-project wait log path: `~/.osq/inbox/<sha256(realpath(root))>.jsonl`. */
export async function resolveWaitLogPath(
  projectRoot: string,
  home = os.homedir(),
): Promise<string> {
  const real = await fs.realpath(projectRoot).catch(() => path.resolve(projectRoot));
  const hash = createHash('sha256').update(real, 'utf8').digest('hex');
  return path.join(home, '.osq', 'inbox', `${hash}.jsonl`);
}

/** Whether a parsed line is a record with a known shape. */
function isWaitRecord(value: unknown): value is WaitRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as { type?: unknown; at?: unknown; session?: unknown };
  return (
    typeof record.type === 'string' &&
    RECORD_TYPES.has(record.type) &&
    typeof record.at === 'string' &&
    typeof record.session === 'string'
  );
}

/** Read the wait log in file order, dropping unreadable lines; null when absent. */
export async function readWaitLog(
  projectRoot: string,
  home = os.homedir(),
): Promise<WaitRecord[] | null> {
  const logPath = await resolveWaitLogPath(projectRoot, home);
  const content = await fs.readFile(logPath, 'utf8').catch(() => null);
  if (content === null) return null;
  const records: WaitRecord[] = [];
  for (const line of content.split('\n')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (isWaitRecord(parsed)) records.push(parsed);
  }
  return records;
}

/**
 * Kind, change folder, and task number as one identity. Accepts both a dispatch
 * item (`change.folder`, `task.number`) and a log item (`change`, `task`).
 */
export function dispatchIdentity(item: DispatchItem | WaitItem): string {
  const folder = typeof item.change === 'string' ? item.change : item.change.folder;
  const task =
    item.task === null ? '' : typeof item.task === 'string' ? item.task : item.task.number;
  return `${item.kind}\u0000${folder}\u0000${task}`;
}

/** Fold records in order: a `seen` opens, `opened` stamps, `gone` closes. */
export function waitEpisodes(records: readonly WaitRecord[]): WaitEpisode[] {
  const open = new Map<string, MutableEpisode>();
  const episodes: MutableEpisode[] = [];
  for (const record of records) {
    if (record.type === 'seen') {
      const id = dispatchIdentity(record.item);
      if (open.has(id)) continue;
      const episode: MutableEpisode = {
        item: record.item,
        seen: {
          at: record.at,
          session: record.session,
          idle: record.idle,
          unobserved: record.unobserved,
        },
        opened: null,
        gone: null,
      };
      open.set(id, episode);
      episodes.push(episode);
    } else if (record.type === 'opened') {
      const episode = open.get(dispatchIdentity(record.item));
      if (episode !== undefined && episode.opened === null) {
        episode.opened = { at: record.at, session: record.session };
      }
    } else if (record.type === 'gone') {
      const id = dispatchIdentity(record.item);
      const episode = open.get(id);
      if (episode === undefined) continue;
      episode.gone = {
        at: record.at,
        session: record.session,
        idle: record.idle,
        unobserved: record.unobserved,
      };
      open.delete(id);
    }
  }
  return episodes;
}

/** Map each identity with an open episode to its first-seen time. */
export function firstSeenTimes(records: readonly WaitRecord[]): Map<string, Date> {
  const times = new Map<string, Date>();
  for (const episode of waitEpisodes(records)) {
    if (episode.gone !== null) continue;
    times.set(dispatchIdentity(episode.item), new Date(episode.seen.at));
  }
  return times;
}
