import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Per-project watcher records under `~/.osq/watch/<sha256(realpath(root))>/`.
 * The folder is derived from the project root and nothing is written inside the
 * project tree; a record counts only while its pid is alive.
 */

/** What `osq watch --background` writes for its supervisor. */
export interface ServiceRecord {
  readonly pid: number;
  readonly startedAt: string;
  /** Absolute path of watch.log. */
  readonly log: string;
}

export type WatcherMode = 'background' | 'terminal';

/** What a continuous watcher writes for itself. */
export interface WatcherRecord {
  readonly pid: number;
  readonly mode: WatcherMode;
  readonly version: string;
  readonly commit: string;
  readonly startedAt: string;
  /** Null, or why the watcher starts no task. */
  readonly waiting: string | null;
}

/** What `osq server start` writes for the server's supervisor. */
export interface ServerRecord {
  readonly pid: number;
  readonly startedAt: string;
  /** Absolute path of server.log. */
  readonly log: string;
  /** `http://127.0.0.1:<port>/p/<project>/`. */
  readonly url: string;
}

/** The parsed records and log location for one project. */
export interface WatchState {
  /** Null unless service.json parses and names a live pid. */
  readonly service: ServiceRecord | null;
  /** Null unless watcher.json parses and names a live pid. */
  readonly watcher: WatcherRecord | null;
  /** Absolute path of watch.log, whether or not it exists. */
  readonly log: string;
  readonly logExists: boolean;
}

export type WatchRecordName = 'service' | 'watcher' | 'server';

/** True when `process.kill(pid, 0)` succeeds or fails with `EPERM`. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * The per-project state folder: `<home>/.osq/watch/<sha256 of the project
 * root's real path>/`, falling back to the resolved path when it cannot be
 * read, exactly as `resolveLastLookPath` computes its hash.
 */
export async function watchStateDir(projectRoot: string, home = os.homedir()): Promise<string> {
  const real = await fsp.realpath(projectRoot).catch(() => path.resolve(projectRoot));
  const hash = createHash('sha256').update(real, 'utf8').digest('hex');
  return path.join(home, '.osq', 'watch', hash);
}

/** Read a project's watch state, counting a record only while its pid is alive. */
export async function readWatchState(
  projectRoot: string,
  home = os.homedir(),
  isAlive: (pid: number) => boolean = isProcessAlive,
): Promise<WatchState> {
  const dir = await watchStateDir(projectRoot, home);
  const [service, watcher, logExists] = await Promise.all([
    readRecord<ServiceRecord>(dir, 'service', isAlive, isServiceRecord),
    readRecord<WatcherRecord>(dir, 'watcher', isAlive, isWatcherRecord),
    fileExists(path.join(dir, 'watch.log')),
  ]);
  return { service, watcher, log: path.join(dir, 'watch.log'), logExists };
}

/** Write `service.json` for a supervisor, replacing any older record. */
export async function writeServiceRecord(
  projectRoot: string,
  record: ServiceRecord,
  home = os.homedir(),
): Promise<void> {
  await writeRecord(await watchStateDir(projectRoot, home), 'service', record);
}

/** Write `watcher.json` for a watcher, replacing any older record. */
export async function writeWatcherRecord(
  projectRoot: string,
  record: WatcherRecord,
  home = os.homedir(),
): Promise<void> {
  await writeRecord(await watchStateDir(projectRoot, home), 'watcher', record);
}

/**
 * Read `server.json`, counting it only while its pid is alive.
 * @scenario watcher-and-harness: Live and dead server records
 */
export async function readServerRecord(
  projectRoot: string,
  home = os.homedir(),
  isAlive: (pid: number) => boolean = isProcessAlive,
): Promise<ServerRecord | null> {
  const dir = await watchStateDir(projectRoot, home);
  return readRecord<ServerRecord>(dir, 'server', isAlive, isServerRecord);
}

/**
 * Write `server.json` for the server's supervisor, replacing any older record.
 * @scenario watcher-and-harness: Live and dead server records
 */
export async function writeServerRecord(
  projectRoot: string,
  record: ServerRecord,
  home = os.homedir(),
): Promise<void> {
  await writeRecord(await watchStateDir(projectRoot, home), 'server', record);
}

/** Delete `<name>.json` only when it names `pid`. */
export async function removeWatchRecord(
  projectRoot: string,
  name: WatchRecordName,
  pid: number,
  home = os.homedir(),
): Promise<void> {
  const dir = await watchStateDir(projectRoot, home);
  const file = path.join(dir, `${name}.json`);
  const content = await fsp.readFile(file, 'utf8').catch(() => null);
  if (content === null || !namesPid(content, pid)) return;
  await fsp.rm(file, { force: true });
}

/** The same as `removeWatchRecord`, synchronously, for a process `exit` handler. */
export function removeWatchRecordSync(stateDir: string, name: WatchRecordName, pid: number): void {
  const file = path.join(stateDir, `${name}.json`);
  let content: string;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  if (!namesPid(content, pid)) return;
  try {
    fs.rmSync(file, { force: true });
  } catch {}
}

/** Read and validate one record, returning null when it is unreadable or dead. */
async function readRecord<T>(
  dir: string,
  name: WatchRecordName,
  isAlive: (pid: number) => boolean,
  isValid: (value: unknown) => value is T,
): Promise<T | null> {
  const content = await fsp.readFile(path.join(dir, `${name}.json`), 'utf8').catch(() => null);
  if (content === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isValid(parsed) || !isAlive((parsed as { pid: number }).pid)) return null;
  return parsed;
}

/** Write a record through a temporary file in the same folder, then rename it. */
async function writeRecord(
  dir: string,
  name: WatchRecordName,
  record: ServiceRecord | WatcherRecord | ServerRecord,
): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.json`);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify(record)}\n`, 'utf8');
  await fsp.rename(tmp, file);
}

/** Whether a record's raw text parses and names the given pid. */
function namesPid(content: string, pid: number): boolean {
  try {
    return (JSON.parse(content) as { pid?: unknown }).pid === pid;
  } catch {
    return false;
  }
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isServiceRecord(value: unknown): value is ServiceRecord {
  return (
    isRecord(value) &&
    typeof value.pid === 'number' &&
    typeof value.startedAt === 'string' &&
    typeof value.log === 'string'
  );
}

function isServerRecord(value: unknown): value is ServerRecord {
  return (
    isRecord(value) &&
    typeof value.pid === 'number' &&
    typeof value.startedAt === 'string' &&
    typeof value.log === 'string' &&
    typeof value.url === 'string'
  );
}

function isWatcherRecord(value: unknown): value is WatcherRecord {
  return (
    isRecord(value) &&
    typeof value.pid === 'number' &&
    (value.mode === 'background' || value.mode === 'terminal') &&
    typeof value.version === 'string' &&
    typeof value.commit === 'string' &&
    typeof value.startedAt === 'string' &&
    (value.waiting === null || typeof value.waiting === 'string')
  );
}
