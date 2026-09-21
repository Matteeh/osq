import fs from 'node:fs/promises';
import path from 'node:path';
import { isPidRunning } from './lock.js';
import { parseSpecMd, resolveChangeDoc } from './parser.js';
import { formatDuration } from './report.js';
import { type SpecState, compareNumericPrefix } from './state.js';
import type { StatusOverview } from './status.js';
export type NeedsYouKind = 'approval' | 'task-dead' | 'task-regressed' | 'change-regressed';
export interface InboxChangeRef {
  readonly id: string;
  readonly title: string;
}
export interface InboxTaskRef {
  readonly number: string;
  readonly title: string;
}
export interface NeedsYouItem {
  readonly kind: NeedsYouKind;
  readonly change: InboxChangeRef;
  readonly task: InboxTaskRef | null;
  readonly command: string;
}
export interface RunningItem {
  readonly change: InboxChangeRef;
  readonly task: InboxTaskRef;
  readonly pid: number;
  readonly startedAt: string;
  readonly elapsedSeconds: number;
  readonly command: string;
}
export interface LandedItem {
  readonly change: InboxChangeRef;
  readonly archivedAt: string;
  readonly command: string;
}
export interface Inbox {
  readonly needsYou: NeedsYouItem[];
  readonly running: RunningItem[];
  readonly landed: LandedItem[];
}
/** Fallback number of archives surfaced when the per-project cursor is unusable. */
export const LANDED_FALLBACK_LIMIT = 10;
const CHANGE_REG_RETRY = '--reason <text>';

function changeRef(spec: SpecState): InboxChangeRef {
  return { id: spec.id, title: spec.title };
}

function taskTitle(taskNumber: string, title: string, fileName: string): string {
  return title || fileName || taskNumber;
}

function changeId(folderName: string): string {
  return folderName.match(/^(\d+)/)?.[1] ?? folderName;
}

function showCommand(id: string): string {
  return `osq show ${id}`;
}

/** Project active changes into deterministic attention items. */
export function projectNeedsYou(overview: StatusOverview): NeedsYouItem[] {
  const items: NeedsYouItem[] = [];
  for (const spec of overview.specs) {
    const change = changeRef(spec);
    if (spec.approvedHash === null && spec.hasProposal !== false) {
      items.push({ kind: 'approval', change, task: null, command: `osq approve ${spec.id}` });
    }
    if (spec.changeRegressed) {
      items.push({
        kind: 'change-regressed',
        change,
        task: null,
        command: `osq reject ${spec.id} ${CHANGE_REG_RETRY}`,
      });
    }
    for (const task of spec.tasks) {
      if (task.status !== 'dead' && task.status !== 'regressed') continue;
      items.push({
        kind: task.status === 'dead' ? 'task-dead' : 'task-regressed',
        change,
        task: {
          number: task.taskNumber,
          title: taskTitle(task.taskNumber, task.title, task.fileName),
        },
        command: `osq retry ${spec.id} ${task.taskNumber}`,
      });
    }
  }
  return items;
}

/** Project derived running tasks whose parsed lock PID is live at `nowMs`. */
export function projectRunning(overview: StatusOverview, nowMs: number): RunningItem[] {
  const items: RunningItem[] = [];
  for (const spec of overview.specs) {
    for (const task of spec.tasks) {
      const lock = task.lock;
      if (task.status !== 'running' || !lock || !isPidRunning(lock.pid)) continue;
      const elapsed = Math.round((nowMs - lock.startedAt) / 1000);
      items.push({
        change: changeRef(spec),
        task: {
          number: task.taskNumber,
          title: taskTitle(task.taskNumber, task.title, task.fileName),
        },
        pid: lock.pid,
        startedAt: new Date(lock.startedAt).toISOString(),
        elapsedSeconds: Math.max(0, elapsed),
        command: showCommand(spec.id),
      });
    }
  }
  return items;
}

interface RawEvent {
  readonly type?: unknown;
  readonly timestamp?: unknown;
}

function parseEventLines(content: string): RawEvent[] {
  const events: RawEvent[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed !== null && typeof parsed === 'object') events.push(parsed as RawEvent);
    } catch {}
  }
  return events;
}

/** Authoritative archive time from the change-level `archived` event, if any. */
async function readArchivedAt(folderPath: string): Promise<string | null> {
  const content = await fs
    .readFile(path.join(folderPath, '.run', 'events', 'change.jsonl'), 'utf8')
    .catch(() => null);
  if (content === null) return null;
  let found: string | null = null;
  for (const event of parseEventLines(content)) {
    if (event.type !== 'archived' || typeof event.timestamp !== 'string') continue;
    if (Number.isFinite(Date.parse(event.timestamp))) found = event.timestamp;
  }
  return found;
}

/** Archived change title, preferring the OpenSpec change document. */
async function readArchivedTitle(folderPath: string, folderName: string): Promise<string> {
  const resolved = await resolveChangeDoc(folderPath).catch(() => null);
  if (!resolved) return folderName;
  const content = await fs.readFile(resolved.path, 'utf8').catch(() => null);
  if (content === null) return folderName;
  const title = parseSpecMd(content).title;
  return title || folderName;
}

/**
 * Landed changes from authoritative `archived` events. A valid cursor selects
 * only strictly later archives; otherwise the newest {@link LANDED_FALLBACK_LIMIT}
 * are returned. Nothing is inferred from directory metadata.
 */
export async function collectLandedItems(
  archiveDir: string,
  lastLookMs: number | null,
  limit = LANDED_FALLBACK_LIMIT,
): Promise<LandedItem[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(archiveDir);
  } catch {
    return [];
  }

  const items: LandedItem[] = [];
  for (const entry of entries) {
    if (entry.startsWith('.') || entry.startsWith('_')) continue;
    const folderPath = path.join(archiveDir, entry);
    const stat = await fs.stat(folderPath).catch(() => null);
    if (!stat?.isDirectory()) continue;

    const archivedAt = await readArchivedAt(folderPath);
    if (archivedAt === null) continue;
    if (lastLookMs !== null && Date.parse(archivedAt) <= lastLookMs) continue;

    const id = changeId(entry);
    items.push({
      change: { id, title: await readArchivedTitle(folderPath, entry) },
      archivedAt,
      command: showCommand(id),
    });
  }

  items.sort(
    (a, b) =>
      Date.parse(b.archivedAt) - Date.parse(a.archivedAt) ||
      compareNumericPrefix(a.change.id, b.change.id),
  );
  return lastLookMs === null ? items.slice(0, limit) : items;
}

/** Assemble the three deterministic inbox groups from one status snapshot. */
export function projectInbox(overview: StatusOverview, landed: LandedItem[], nowMs: number): Inbox {
  return {
    needsYou: projectNeedsYou(overview),
    running: projectRunning(overview, nowMs),
    landed,
  };
}

function needsYouLine(item: NeedsYouItem): string {
  const head = `  ${item.change.id}: ${item.change.title}`;
  if (item.kind === 'approval') return `${head} — ${item.command}`;
  if (item.kind === 'change-regressed') return `${head} — change regressed — ${item.command}`;
  const task = item.task as InboxTaskRef;
  return `${head} — task ${task.number}: ${task.title} — ${item.command}`;
}

function runningLine(item: RunningItem): string {
  const duration = formatDuration(item.elapsedSeconds * 1000);
  return `  ${item.change.id}: ${item.change.title} — task ${item.task.number}: ${item.task.title} — ${duration} — ${item.command}`;
}

function landedLine(item: LandedItem): string {
  return `  ${item.change.id}: ${item.change.title} — archived ${item.archivedAt} — ${item.command}`;
}

/** Concise text rendering of the three inbox groups. */
export function formatInboxText(inbox: Inbox): string {
  const { needsYou, running, landed } = inbox;
  if (needsYou.length === 0 && running.length === 0 && landed.length === 0) {
    return 'Inbox empty.';
  }

  const lines: string[] = ['Needs you'];
  if (needsYou.length === 0) lines.push('  (none)');
  else for (const item of needsYou) lines.push(needsYouLine(item));

  lines.push('Running');
  if (running.length === 0) lines.push('  (none)');
  else for (const item of running) lines.push(runningLine(item));

  lines.push('Landed since last look');
  if (landed.length === 0) lines.push('  (none)');
  else for (const item of landed) lines.push(landedLine(item));

  return lines.join('\n');
}
