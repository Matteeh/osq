import fs from 'node:fs/promises';
import path from 'node:path';

export interface LockResult {
  acquired: boolean;
  pid: number;
  startedAt: number;
  lockPath: string;
}

export async function acquireLock(
  runDir: string,
  taskNumber: string | number,
): Promise<LockResult> {
  const runningDir = path.join(runDir, 'running');
  await fs.mkdir(runningDir, { recursive: true });

  const lockPath = path.join(runningDir, `${taskNumber}.pid`);
  const pid = process.pid;
  const startedAt = Date.now();
  const payload = JSON.stringify({ pid, startedAt });

  try {
    await fs.writeFile(lockPath, payload, { flag: 'wx', encoding: 'utf8' });
    return { acquired: true, pid, startedAt, lockPath };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      return { acquired: false, pid: 0, startedAt: 0, lockPath };
    }
    throw err;
  }
}

export async function releaseLock(runDir: string, taskNumber: string | number): Promise<void> {
  const lockPath = path.join(runDir, 'running', `${taskNumber}.pid`);
  try {
    await fs.unlink(lockPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
}

export function isPidRunning(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'EPERM';
  }
}

export interface ReapedLock {
  taskNumber: string;
  reason: 'crashed' | 'timeout';
  pid: number;
  startedAt: number;
}

/**
 * Detect stale locks and unlink their pid files. Detection is pure with respect
 * to markers: it never creates `.run/dead/<n>.md` or writes any `.run/`
 * artifact beyond removing the expired lock. Callers (the watcher loop) own the
 * marker and event emission for each returned descriptor.
 */
export async function reapStaleLocks(
  specFolderPath: string,
  staleLockSeconds: number,
): Promise<ReapedLock[]> {
  const runningDir = path.join(specFolderPath, '.run', 'running');

  let entries: string[] = [];
  try {
    entries = await fs.readdir(runningDir);
  } catch {
    return [];
  }

  const reaped: ReapedLock[] = [];
  const now = Date.now();

  for (const entry of entries) {
    if (!entry.endsWith('.pid')) continue;
    const taskNumber = entry.replace(/\.pid$/, '');
    const lockPath = path.join(runningDir, entry);

    let lockData: { pid: number; startedAt: number };
    try {
      const content = await fs.readFile(lockPath, 'utf8');
      lockData = JSON.parse(content);
    } catch {
      lockData = { pid: 0, startedAt: now };
    }

    let reapReason: 'crashed' | 'timeout' | null = null;

    if (now - lockData.startedAt > staleLockSeconds * 1000) {
      reapReason = 'timeout';
    } else if (!isPidRunning(lockData.pid)) {
      reapReason = 'crashed';
    }

    if (reapReason) {
      try {
        await fs.unlink(lockPath);
      } catch {}

      reaped.push({
        taskNumber,
        reason: reapReason,
        pid: lockData.pid,
        startedAt: lockData.startedAt,
      });
    }
  }

  return reaped;
}
