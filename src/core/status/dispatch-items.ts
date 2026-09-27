import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { parseSpecMdFromFolder } from '../spec/parser.js';
import { changeTrees } from './change-locations.js';
import { findLandCandidates } from './dispatch-land.js';
import { type SpecState, type TaskState, compareNumericPrefix } from './state.js';
import { type StatusOverview, getStatusOverview } from './status.js';

/** The four things that can need a human. */
export type DispatchKind = 'approval' | 'halt' | 'land' | 'verify';

/** The change one dispatch item names. */
export interface DispatchChangeRef {
  readonly id: string;
  readonly folder: string;
  readonly title: string;
  readonly folderPath: string;
}

/** The task one dispatch item names, when it names one. */
export interface DispatchTaskRef {
  readonly number: string;
  readonly title: string;
}

/** One derived dispatch item, in numeric change order. */
export interface DispatchItem {
  readonly kind: DispatchKind;
  readonly change: DispatchChangeRef;
  readonly task: DispatchTaskRef | null;
  readonly commands: string[];
}

/** Every item that needs a human, plus whether the watcher has work. */
export interface Dispatch {
  readonly watcherIdle: boolean;
  readonly items: DispatchItem[];
}

const KIND_RANK: Record<DispatchKind, number> = { approval: 0, halt: 1, land: 2, verify: 3 };
const REASON_PLACEHOLDER = '--reason <text>';

function changeId(folderName: string): string {
  return folderName.match(/^(\d+)/)?.[1] ?? folderName;
}

function changeRef(spec: SpecState): DispatchChangeRef {
  return {
    id: spec.id,
    folder: spec.folderName,
    title: spec.title || spec.folderName,
    folderPath: spec.folderPath,
  };
}

function taskRef(task: TaskState): DispatchTaskRef {
  return {
    number: task.taskNumber,
    title: task.title || task.fileName || task.taskNumber,
  };
}

function approvalItem(spec: SpecState, nextState: string | undefined): DispatchItem | null {
  if (nextState !== 'ready-for-approval') return null;
  return {
    kind: 'approval',
    change: changeRef(spec),
    task: null,
    commands: [`osq approve ${spec.id}`, `osq show ${spec.id}`],
  };
}

/** A change-level halt first, then one halt per dead or regressed task. */
function haltItems(spec: SpecState): DispatchItem[] {
  const items: DispatchItem[] = [];
  const id = spec.id;
  if (spec.changeRegressed) {
    items.push({
      kind: 'halt',
      change: changeRef(spec),
      task: null,
      commands: [
        `osq retry ${id} change`,
        `osq reject ${id} ${REASON_PLACEHOLDER}`,
        `osq show ${id}`,
      ],
    });
  }
  for (const task of spec.tasks) {
    if (task.status !== 'dead' && task.status !== 'regressed') continue;
    items.push({
      kind: 'halt',
      change: changeRef(spec),
      task: taskRef(task),
      commands: [`osq retry ${id} ${task.taskNumber}`, `osq show ${id}`],
    });
  }
  return items;
}

async function readTitle(folderPath: string, fallback: string): Promise<string> {
  const spec = await parseSpecMdFromFolder(folderPath).catch(() => null);
  return spec?.title || fallback;
}

async function landItems(projectRoot: string, config: OsqConfig): Promise<DispatchItem[]> {
  const items: DispatchItem[] = [];
  for (const candidate of await findLandCandidates(projectRoot, config)) {
    const id = changeId(candidate.folder);
    items.push({
      kind: 'land',
      change: {
        id,
        folder: candidate.folder,
        title: await readTitle(candidate.folderPath, candidate.folder),
        folderPath: candidate.folderPath,
      },
      task: null,
      commands: candidate.worktree
        ? [
            `git merge --squash osq/${candidate.folder} && osq message ${id} | git commit -F -`,
            `osq show ${id}`,
          ]
        : [`osq show ${id}`],
    });
  }
  return items;
}

/** One verify item per pending verification, from the overview and the archive path. */
async function verifyItems(
  projectRoot: string,
  config: OsqConfig,
  overview: StatusOverview,
): Promise<DispatchItem[]> {
  const pending = overview.pendingVerifications ?? [];
  if (pending.length === 0) return [];
  const [tree] = await changeTrees(projectRoot, config);
  const items: DispatchItem[] = [];
  for (const entry of pending) {
    const id = changeId(entry.folderName);
    items.push({
      kind: 'verify',
      change: {
        id,
        folder: entry.folderName,
        title: entry.title || entry.folderName,
        folderPath: path.join(tree.archiveDir, entry.folderName),
      },
      task: null,
      commands: [entry.next.command, `osq show ${id}`].filter(
        (command): command is string => command !== null,
      ),
    });
  }
  return items;
}

/** Numeric change order, then task order, a change-level item before its tasks. */
function compareItems(a: DispatchItem, b: DispatchItem): number {
  const byChange = compareNumericPrefix(a.change.id, b.change.id);
  if (byChange !== 0) return byChange;
  const aTask = a.task?.number ?? null;
  const bTask = b.task?.number ?? null;
  if (aTask === null && bTask !== null) return -1;
  if (aTask !== null && bTask === null) return 1;
  if (aTask !== null && bTask !== null) {
    const byTask = compareNumericPrefix(aTask, bTask);
    if (byTask !== 0) return byTask;
  }
  return KIND_RANK[a.kind] - KIND_RANK[b.kind];
}

/**
 * Derive, without writing, the items that need a human and whether the watcher
 * is idle. `watcherIdle` is true when no active change's next step is running.
 */
export async function readDispatchItems(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<Dispatch> {
  const overview = await getStatusOverview(projectRoot, config);
  const nextSteps = overview.nextSteps ?? {};
  const items: DispatchItem[] = [];
  for (const spec of overview.specs) {
    const approval = approvalItem(spec, nextSteps[spec.folderName]?.state);
    if (approval !== null) items.push(approval);
    items.push(...haltItems(spec));
  }
  items.push(...(await landItems(projectRoot, config)));
  items.push(...(await verifyItems(projectRoot, config, overview)));
  items.sort(compareItems);
  return {
    watcherIdle: !Object.values(nextSteps).some((next) => next.state === 'running'),
    items,
  };
}
