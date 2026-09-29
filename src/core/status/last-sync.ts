import fs from 'node:fs/promises';
import path from 'node:path';

/** The last `synced` event a change's stream recorded. */
export interface LastSync {
  readonly timestamp: string;
  readonly defaultBranch: string;
  readonly commits: number;
}

/** The last `sync_stopped` event recorded after the last sync, if any. */
export interface LastSyncStop {
  readonly timestamp: string;
  readonly reason: string;
  readonly message: string;
}

/** A worktree change's last sync and any stop that came after it. */
export interface LastSyncState {
  readonly lastSync?: LastSync;
  readonly lastSyncStop?: LastSyncStop;
}

/** A parsed event object, or null when the value is not a plain object. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** One `synced` event's fields, or null when any of them is missing. */
function parseSynced(event: Record<string, unknown>): LastSync | null {
  const data = asRecord(event.data);
  if (typeof event.timestamp !== 'string' || !data) return null;
  if (typeof data.defaultBranch !== 'string' || typeof data.commits !== 'number') return null;
  return { timestamp: event.timestamp, defaultBranch: data.defaultBranch, commits: data.commits };
}

/** One `sync_stopped` event's fields, or null when any of them is missing. */
function parseStop(event: Record<string, unknown>): LastSyncStop | null {
  const data = asRecord(event.data);
  if (typeof event.timestamp !== 'string' || !data) return null;
  if (typeof data.reason !== 'string' || typeof data.message !== 'string') return null;
  return { timestamp: event.timestamp, reason: data.reason, message: data.message };
}

/**
 * Read a change folder's `.run/events/change.jsonl` once: the last `synced`
 * event, and the last `sync_stopped` event when it came after that sync or no
 * sync exists. Malformed lines are ignored, and a field with no event is left
 * out.
 */
export async function readLastSync(folderPath: string): Promise<LastSyncState> {
  const content = await fs
    .readFile(path.join(folderPath, '.run', 'events', 'change.jsonl'), 'utf8')
    .catch(() => '');
  let lastSync: LastSync | null = null;
  let lastSyncIndex = -1;
  let lastStop: LastSyncStop | null = null;
  let lastStopIndex = -1;
  for (const [index, line] of content.split('\n').entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const event = asRecord(parsed);
    if (!event) continue;
    if (event.type === 'synced') {
      const sync = parseSynced(event);
      if (sync) {
        lastSync = sync;
        lastSyncIndex = index;
      }
    } else if (event.type === 'sync_stopped') {
      const stop = parseStop(event);
      if (stop) {
        lastStop = stop;
        lastStopIndex = index;
      }
    }
  }
  const stopAfterSync =
    lastStop !== null && (lastSyncIndex === -1 || lastStopIndex > lastSyncIndex);
  return {
    ...(lastSync ? { lastSync } : {}),
    ...(stopAfterSync ? { lastSyncStop: lastStop as LastSyncStop } : {}),
  };
}

/** The `osq status` lines for a worktree's last sync and stop, if any. */
export function formatLastSyncLines(folderName: string, state: LastSyncState): string[] {
  const lines: string[] = [];
  if (state.lastSync) {
    const noun = state.lastSync.commits === 1 ? 'commit' : 'commits';
    lines.push(
      `  last sync: ${state.lastSync.timestamp}, ${state.lastSync.commits} ${noun} from ${state.lastSync.defaultBranch}`,
    );
  }
  if (state.lastSyncStop) {
    const id = folderName.match(/^(\d+)/)?.[1] ?? folderName;
    lines.push(
      `  sync stopped: ${state.lastSyncStop.timestamp} (${state.lastSyncStop.reason}); run osq sync ${id} again once it is fixed`,
    );
    lines.push(`    ${state.lastSyncStop.message.split('\n')[0] ?? ''}`);
  }
  return lines;
}
