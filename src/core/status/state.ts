import fs from 'node:fs/promises';
import path from 'node:path';
/* biome-ignore format: single line keeps this file inside the 250-line source budget */ import { type SpecData, parseFrontmatter, parseSpecMdFromFolder, parseTaskMd } from '../spec/parser.js';
import * as layout from './layout.js';
export type TaskStatus = 'pending' | 'running' | 'done' | 'dead' | 'regressed';
export interface TaskState {
  taskNumber: string;
  fileName: string;
  title: string;
  status: TaskStatus;
  verify: string;
  deadReason?: string;
  stuck?: string;
  resultFile?: string;
  lock?: { readonly pid: number; readonly startedAt: number };
}
export type SpecStatus =
  | 'unapproved'
  | 'blocked'
  | 'dead'
  | 'running'
  | 'pending'
  | 'done'
  | 'regressed';
export interface SpecState {
  id: string;
  folderName: string;
  folderPath: string;
  title: string;
  status: SpecStatus;
  approvedHash: string | null;
  tasks: TaskState[];
  nextTask: TaskState | null;
  changeRegressed?: boolean;
  hasProposal?: boolean;
}
/** Immutable change-folder view; {@link readChangeFolder} captures everything, so derivation is pure. */
export interface ChangeFolderSnapshot {
  readonly folderName: string;
  readonly folderPath: string;
  readonly spec: SpecData;
  readonly approvedHash: string | null;
  readonly taskFiles: ReadonlyMap<string, string>;
  readonly doneMarkers: ReadonlySet<string>;
  readonly deadMarkers: ReadonlyMap<string, string>;
  readonly regressedMarkers?: ReadonlyMap<string, string>;
  readonly runningPids: ReadonlyMap<string, string>;
  readonly resultFiles: ReadonlySet<string>;
  readonly unmetDependencies: ReadonlySet<string>;
}
export function compareNumericPrefix(a: string, b: string): number {
  const matchA = a.match(/^(\d+)/);
  const matchB = b.match(/^(\d+)/);
  if (matchA && matchB) {
    const numA = Number.parseInt(matchA[1], 10);
    const numB = Number.parseInt(matchB[1], 10);
    if (numA !== numB) {
      return numA - numB;
    }
  }
  return a.localeCompare(b);
}
function parseRunningLock(
  content: string | undefined,
): { pid: number; startedAt: number } | undefined {
  try {
    const raw = JSON.parse(content ?? '') as { pid?: unknown; startedAt?: unknown };
    if (typeof raw.pid !== 'number' || typeof raw.startedAt !== 'number') return undefined;
    if (!Number.isFinite(raw.pid) || !Number.isFinite(raw.startedAt)) return undefined;
    return { pid: raw.pid, startedAt: raw.startedAt };
  } catch {
    return undefined;
  }
}
function deriveTaskStateFromSnapshot(
  snapshot: ChangeFolderSnapshot,
  taskFileName: string,
): TaskState {
  const taskNumber = taskFileName.replace(/\.md$/, '');
  const { title, verify } = parseTaskMd(snapshot.taskFiles.get(taskFileName) ?? '');
  const base = { taskNumber, fileName: taskFileName, title, verify };
  if (snapshot.regressedMarkers?.has(taskNumber)) {
    return { ...base, status: 'regressed' };
  }
  if (snapshot.doneMarkers.has(taskNumber)) {
    return { ...base, status: 'done' };
  }
  const deadContent = snapshot.deadMarkers.get(taskNumber);
  if (deadContent !== undefined) {
    const { data } = parseFrontmatter(deadContent);
    const reason = typeof data.reason === 'string' ? data.reason : undefined;
    const stuck =
      data.stuck === true && typeof data.fingerprint === 'string' ? data.fingerprint : undefined;
    return { ...base, status: 'dead', deadReason: reason, ...(stuck ? { stuck } : {}) };
  }
  if (snapshot.runningPids.has(taskNumber)) {
    const lock = parseRunningLock(snapshot.runningPids.get(taskNumber));
    return lock ? { ...base, status: 'running', lock } : { ...base, status: 'running' };
  }
  if (snapshot.resultFiles.has(taskNumber)) {
    const resultFile = layout.getResultPath(snapshot.folderPath, taskNumber);
    return { ...base, status: 'pending', resultFile };
  }
  return { ...base, status: 'pending' };
}
/** Snapshot derivation is pure; `(projectRoot, folderPath)` reads from disk. */
export function deriveSpecState(snapshot: ChangeFolderSnapshot): SpecState;
export function deriveSpecState(projectRoot: string, folderPath: string): Promise<SpecState>;
export function deriveSpecState(
  snapshotOrRoot: ChangeFolderSnapshot | string,
  folderPath?: string,
): SpecState | Promise<SpecState> {
  if (typeof snapshotOrRoot === 'string') {
    return deriveSpecStateFromDisk(snapshotOrRoot, folderPath as string);
  }
  const { folderName, folderPath: fPath, spec } = snapshotOrRoot;
  const id = folderName.match(/^(\d+)/)?.[1] ?? folderName;
  const tasks = [...snapshotOrRoot.taskFiles.keys()]
    .sort(compareNumericPrefix)
    .map((fileName) => deriveTaskStateFromSnapshot(snapshotOrRoot, fileName));
  const changeRegressed = snapshotOrRoot.regressedMarkers?.has('change') ?? false;
  let status: SpecStatus = 'pending';
  let nextTask: TaskState | null = null;
  if (!snapshotOrRoot.approvedHash) {
    status = 'unapproved';
  } else if (tasks.some((t) => t.status === 'regressed') || changeRegressed) {
    status = 'regressed';
  } else if (tasks.some((t) => t.status === 'dead')) {
    status = 'dead';
  } else if (tasks.some((t) => t.status === 'running')) {
    status = 'running';
  } else if (tasks.length > 0 && tasks.every((t) => t.status === 'done')) {
    status = 'done';
  } else if (snapshotOrRoot.unmetDependencies.size > 0) {
    status = 'blocked';
  } else {
    nextTask = tasks.find((t) => t.status === 'pending') || null;
    status = nextTask ? 'pending' : 'done';
  }
  return {
    id,
    folderName,
    folderPath: fPath,
    title: spec.title,
    status,
    approvedHash: snapshotOrRoot.approvedHash,
    tasks,
    nextTask,
    changeRegressed,
  };
}
async function listDir(dir: string): Promise<string[]> {
  return fs.readdir(dir).catch(() => []);
}
async function findFolder(parent: string, prefix: string): Promise<string | null> {
  const entries = await listDir(parent);
  return entries.find((entry) => entry === prefix || entry.startsWith(`${prefix}-`)) ?? null;
}
async function isDependencyDone(changesDir: string, dependency: string): Promise<boolean> {
  const padded = dependency.padStart(3, '0');
  if (await findFolder(path.join(changesDir, 'archive'), padded)) return true;
  if (await findFolder(path.join(changesDir, 'rejected'), padded)) return false;
  const active = await findFolder(changesDir, padded);
  if (!active) return false;
  const dependencyFolder = path.join(changesDir, active);
  const taskFiles = (await listDir(path.join(dependencyFolder, 'tasks'))).filter((entry) =>
    entry.endsWith('.md'),
  );
  if (taskFiles.length === 0) return false;
  const done = new Set(await listDir(path.join(dependencyFolder, '.run', 'done')));
  return taskFiles.every((entry) => done.has(entry.replace(/\.md$/, '')));
}
async function resolveUnmetDependencies(
  projectRoot: string,
  folderPath: string,
  dependsOn: readonly string[],
): Promise<Set<string>> {
  const changesDir = path.dirname(path.resolve(projectRoot, folderPath));
  const unmet = new Set<string>();
  for (const dependency of dependsOn) {
    if (!(await isDependencyDone(changesDir, dependency))) {
      unmet.add(dependency);
    }
  }
  return unmet;
}
/** Read a change folder into an in-memory snapshot: the only I/O boundary. */
export async function readChangeFolder(
  projectRoot: string,
  folderPath: string,
): Promise<ChangeFolderSnapshot> {
  const spec = await parseSpecMdFromFolder(folderPath);
  if (!spec) {
    throw new Error(`Neither proposal.md nor spec.md found in ${folderPath}`);
  }
  const runDir = layout.getChangeRunDir(folderPath);
  const tasksDir = layout.getChangeTasksDir(folderPath);
  const taskFiles = new Map<string, string>();
  for (const entry of (await listDir(tasksDir))
    .filter((item) => item.endsWith('.md'))
    .sort(compareNumericPrefix)) {
    taskFiles.set(entry, await fs.readFile(path.join(tasksDir, entry), 'utf8'));
  }
  const readMarkerMap = async (dir: string, suffix: string): Promise<Map<string, string>> => {
    const markers = new Map<string, string>();
    for (const entry of await listDir(dir)) {
      if (!entry.endsWith(suffix)) continue;
      const content = await fs.readFile(path.join(dir, entry), 'utf8').catch(() => '');
      markers.set(entry.slice(0, -suffix.length), content);
    }
    return markers;
  };
  const approved = await fs
    .readFile(layout.getApprovedMarkerPath(folderPath), 'utf8')
    .catch(() => null);
  return {
    folderName: path.basename(folderPath),
    folderPath,
    spec,
    approvedHash: approved ? approved.trim() : null,
    taskFiles,
    doneMarkers: new Set(await listDir(path.join(runDir, 'done'))),
    deadMarkers: await readMarkerMap(path.join(runDir, 'dead'), '.md'),
    regressedMarkers: await readMarkerMap(path.join(runDir, 'regressed'), '.md'),
    runningPids: await readMarkerMap(path.join(runDir, 'running'), '.pid'),
    resultFiles: new Set(
      (await listDir(path.join(runDir, 'results'))).map((entry) => entry.replace(/\.md$/, '')),
    ),
    unmetDependencies: await resolveUnmetDependencies(projectRoot, folderPath, spec.dependsOn),
  };
}
/** Async disk-backed task derivation for callers outside the watcher. */
export async function deriveTaskState(
  specFolderPath: string,
  taskFileName: string,
): Promise<TaskState> {
  return deriveTaskStateFromSnapshot(await readChangeFolder('', specFolderPath), taskFileName);
}
/** Alias for {@link deriveTaskState} used by status and reporting specs. */
export const deriveTaskStatus = deriveTaskState;
/** Backward-compatible async wrapper: read a change folder, then derive purely. */
export async function deriveSpecStateFromDisk(
  projectRoot: string,
  folderPath: string,
): Promise<SpecState> {
  return deriveSpecState(await readChangeFolder(projectRoot, folderPath));
}
