import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { parseFrontmatter } from '../spec/parser.js';
import { getArchiveDir, getChangesDir, getRejectedDir } from './layout.js';
import { type QueueItem, readQueue } from './queue-parser.js';
import {
  type SpecState,
  type SpecStatus,
  compareNumericPrefix,
  deriveSpecState,
  readChangeFolder,
} from './state.js';

export type QueueItemState =
  | 'landed'
  | 'dead'
  | 'running'
  | 'approved'
  | 'planned'
  | 'rejected'
  | 'unplanned';

export interface QueueRow {
  readonly slug: string;
  readonly title: string;
  readonly state: QueueItemState;
  readonly changeId: string | null;
  readonly rejectionCount: number;
  readonly changedSincePlanned: boolean;
  readonly unmetDependencies: readonly string[];
}

export type QueueProjection = { items: QueueRow[]; landedCount: number; totalCount: number };

export interface QueueActiveFailure {
  readonly changeId: string;
  readonly folderName: string;
  readonly target: string;
  readonly reason: string;
  readonly retryCommand: string;
}

/** One change folder associated with a queue item through `brief.md` metadata. */
export interface QueueAssociation {
  readonly folderName: string;
  readonly folderPath: string;
  readonly id: string;
  readonly queueHash: string | null;
}

export interface QueueAssociationGroups {
  readonly active: QueueAssociation[];
  readonly archived: QueueAssociation[];
  readonly rejected: QueueAssociation[];
}

/** Internal state projection shared by queue planning and later report views. */
export interface QueueStateSnapshot {
  readonly items: QueueItem[];
  readonly groups: Map<string, QueueAssociationGroups>;
  readonly rows: QueueRow[];
  readonly landed: Set<string>;
}

const RESERVED_DIRS = new Set(['archive', 'rejected']);

/** Scan active, archived, and rejected folders for queue metadata; null keeps retired slugs. */
export async function scanQueueAssociations(
  projectRoot: string,
  config: OsqConfig,
  slugs: ReadonlySet<string> | null,
): Promise<Map<string, QueueAssociationGroups>> {
  const result = new Map<string, QueueAssociationGroups>();
  const changesDir = getChangesDir(config.paths.openspecRoot, projectRoot);
  const archiveDir = getArchiveDir(config.paths.openspecRoot, projectRoot);
  const rejectedDir = getRejectedDir(config.paths.openspecRoot, projectRoot);
  const scan = async (dir: string, location: 'active' | 'archived' | 'rejected'): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const { name } = entry;
      if (!entry.isDirectory() || name.startsWith('.') || name.startsWith('_')) continue;
      if (location === 'active' && RESERVED_DIRS.has(name)) continue;
      const folderPath = path.join(dir, name);
      const content = await fs
        .readFile(path.join(folderPath, 'brief.md'), 'utf8')
        .catch(() => null);
      if (content === null) continue;
      const { data } = parseFrontmatter(content);
      const item = typeof data.queue_item === 'string' ? data.queue_item.trim() : '';
      if (!item || (slugs && !slugs.has(item))) continue;
      const groups = result.get(item) ?? { active: [], archived: [], rejected: [] };
      groups[location].push({
        folderName: name,
        folderPath,
        id: name.match(/^(\d+)/)?.[1] ?? name,
        queueHash: typeof data.queue_hash === 'string' ? data.queue_hash : null,
      });
      result.set(item, groups);
    }
  };
  await scan(changesDir, 'active');
  await scan(archiveDir, 'archived');
  await scan(rejectedDir, 'rejected');
  return result;
}

function mapActiveState(status: SpecStatus): QueueItemState {
  if (status === 'dead' || status === 'regressed') return 'dead';
  if (status === 'running') return 'running';
  if (status === 'unapproved') return 'planned';
  return 'approved';
}

function ambiguous(item: QueueItem, matches: readonly QueueAssociation[], location: string): Error {
  const folders = matches
    .map((m) => m.folderName)
    .sort(compareNumericPrefix)
    .join(', ');
  return new Error(
    `Ambiguous queue association for "${item.slug}": multiple ${location} changes (${folders})`,
  );
}

async function selectAssociation(
  projectRoot: string,
  item: QueueItem,
  groups: QueueAssociationGroups | undefined,
): Promise<{ state: QueueItemState; selected: QueueAssociation | null }> {
  if (!groups) return { state: 'unplanned', selected: null };
  const { active, archived, rejected } = groups;
  if (archived.length > 1) throw ambiguous(item, archived, 'archived');
  if (active.length > 1) throw ambiguous(item, active, 'active');
  if (archived.length === 1) return { state: 'landed', selected: archived[0] };
  if (active.length === 1) {
    try {
      const spec = await deriveSpecState(projectRoot, active[0].folderPath);
      return { state: mapActiveState(spec.status), selected: active[0] };
    } catch {
      // Active folder unreadable: fall through to rejected history.
    }
  }
  if (rejected.length > 0) {
    const ordered = [...rejected].sort((a, b) => compareNumericPrefix(a.folderName, b.folderName));
    return { state: 'rejected', selected: ordered[ordered.length - 1] };
  }
  return { state: 'unplanned', selected: null };
}

/** Project the current queue's filesystem-derived state for planning and report views. */
export async function readQueueState(
  projectRoot: string,
  config: OsqConfig,
): Promise<QueueStateSnapshot> {
  const items = await readQueue(projectRoot, config);
  const groups = await scanQueueAssociations(
    projectRoot,
    config,
    new Set(items.map((i) => i.slug)),
  );
  const chosen = await Promise.all(
    items.map((item) => selectAssociation(projectRoot, item, groups.get(item.slug))),
  );
  const landed = new Set(items.filter((_, i) => chosen[i].state === 'landed').map((i) => i.slug));
  const rows: QueueRow[] = items.map((item, index) => {
    const choice = chosen[index];
    return {
      slug: item.slug,
      title: item.title,
      state: choice.state,
      changeId: choice.selected?.id ?? null,
      rejectionCount: groups.get(item.slug)?.rejected.length ?? 0,
      changedSincePlanned: choice.selected ? choice.selected.queueHash !== item.hash : false,
      unmetDependencies: [...item.dependsOn, ...item.fixes].filter((slug) => !landed.has(slug)),
    };
  });
  return { items, groups, rows, landed };
}

/** Derive the queue projection afresh from disk on every invocation. */
export async function projectQueue(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<QueueProjection> {
  const { rows, landed } = await readQueueState(projectRoot, config);
  return { items: rows, landedCount: landed.size, totalCount: rows.length };
}

function activeFailure(
  assoc: QueueAssociation,
  target: string,
  reason: string,
): QueueActiveFailure {
  return {
    changeId: assoc.id,
    folderName: assoc.folderName,
    target,
    reason,
    retryCommand: `osq retry ${assoc.id} ${target}`,
  };
}

/** Active dead, regressed, and change-level queue failures in numeric order. */
export async function findActiveQueueFailures(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<QueueActiveFailure[]> {
  const groups = await scanQueueAssociations(projectRoot, config, null);
  const failures: QueueActiveFailure[] = [];
  for (const group of groups.values()) {
    for (const assoc of group.active) {
      let state: SpecState;
      try {
        state = deriveSpecState(await readChangeFolder(projectRoot, assoc.folderPath));
      } catch {
        continue;
      }
      if (state.changeRegressed) failures.push(activeFailure(assoc, 'change', 'regressed'));
      for (const task of state.tasks) {
        if (task.status === 'dead') {
          failures.push(activeFailure(assoc, task.taskNumber, task.deadReason ?? 'dead'));
        } else if (task.status === 'regressed') {
          failures.push(activeFailure(assoc, task.taskNumber, 'regressed'));
        }
      }
    }
  }
  return failures.sort(
    (a, b) =>
      a.changeId.localeCompare(b.changeId, undefined, { numeric: true }) ||
      a.target.localeCompare(b.target, undefined, { numeric: true }),
  );
}

export function formatQueue(projection: QueueProjection): string {
  const lines = ['Queue:'];
  if (projection.items.length === 0) lines.push('  (no items)');
  for (const row of projection.items) {
    let line = `  ${row.slug}: ${row.title} [${row.state}]`;
    if (row.changeId) line += ` change: ${row.changeId}`;
    line += ` rejections: ${row.rejectionCount}`;
    if (row.unmetDependencies.length > 0) line += ` unmet: ${row.unmetDependencies.join(', ')}`;
    if (row.changedSincePlanned) line += ' changed since planned';
    lines.push(line);
  }
  return lines.join('\n');
}
