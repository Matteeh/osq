import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/config.js';
import { hashChangeFolder } from '../core/hasher.js';
import { acquireLock, releaseLock } from '../core/lock.js';
import { parseTaskMd } from '../core/parser.js';
import { type HarnessAdapter, appendHarnessEvent } from '../harness/types.js';

export type RunTaskFailureReason =
  | 'spec_conflict'
  | 'already_running'
  | 'no_result'
  | 'verify_red'
  | 'crashed'
  | 'timeout';

export interface RunTaskResult {
  success: boolean;
  reason?: RunTaskFailureReason;
  error?: string;
}

export async function tickTaskCheckbox(specFolderPath: string, taskNumber: string): Promise<void> {
  const tasksMdPath = path.join(specFolderPath, 'tasks.md');
  let content = '';
  try {
    content = await fs.readFile(tasksMdPath, 'utf8');
  } catch {
    return;
  }

  const regex = new RegExp(`^(\\s*-\\s*\\[)[ ](\\]\\s*${taskNumber}\\b.*)$`, 'm');
  const updated = content.replace(regex, '$1x$2');

  if (updated !== content) {
    await fs.writeFile(tasksMdPath, updated, 'utf8');
  }
}

export async function runTask(
  projectRoot: string,
  specFolderPath: string,
  taskNumber: string,
  config: OsqConfig,
  adapter: HarnessAdapter,
): Promise<RunTaskResult> {
  const runDir = path.join(specFolderPath, '.run');
  const deadDir = path.join(runDir, 'dead');
  const doneDir = path.join(runDir, 'done');

  const approvedPath = path.join(runDir, 'approved');
  let approvedHash = '';
  try {
    approvedHash = (await fs.readFile(approvedPath, 'utf8')).trim();
  } catch {
    await fs.mkdir(deadDir, { recursive: true });
    await fs.writeFile(
      path.join(deadDir, `${taskNumber}.md`),
      '---\nreason: spec_conflict\n---\nSpec has not been approved (missing .run/approved).\n',
      'utf8',
    );
    return { success: false, reason: 'spec_conflict', error: 'Missing .run/approved' };
  }

  const currentHash = await hashChangeFolder(specFolderPath);
  if (currentHash !== approvedHash) {
    await fs.mkdir(deadDir, { recursive: true });
    await fs.writeFile(
      path.join(deadDir, `${taskNumber}.md`),
      `---\nreason: spec_conflict\napproved_hash: "${approvedHash}"\ncurrent_hash: "${currentHash}"\n---\nChange folder modified after approval. Expected ${approvedHash}, computed ${currentHash}.\n`,
      'utf8',
    );
    return {
      success: false,
      reason: 'spec_conflict',
      error: `Folder hash mismatch: expected ${approvedHash}, got ${currentHash}`,
    };
  }

  const taskPath = path.join(specFolderPath, 'tasks', `${taskNumber}.md`);
  let taskContent = '';
  try {
    taskContent = await fs.readFile(taskPath, 'utf8');
  } catch (err) {
    await fs.mkdir(deadDir, { recursive: true });
    await fs.writeFile(
      path.join(deadDir, `${taskNumber}.md`),
      `---\nreason: crashed\n---\nTask file not found: ${taskPath}\n`,
      'utf8',
    );
    return { success: false, reason: 'crashed', error: 'Task file not found' };
  }
  const taskData = parseTaskMd(taskContent);

  const lockResult = await acquireLock(runDir, taskNumber);
  if (!lockResult.acquired) {
    return { success: false, reason: 'already_running', error: 'Task is already running' };
  }

  try {
    const spawnResult = await adapter.spawn({
      projectRoot,
      specFolderPath,
      taskNumber,
      taskTitle: taskData.title,
      verifyCommand: taskData.verify,
      scope: taskData.scope,
      entry: taskData.entry,
      skills: taskData.skills,
      tier: 'coding',
      timeoutSeconds: config.timeouts.taskTimeoutSeconds,
      config,
    });

    if (spawnResult.exitCode !== 0 || spawnResult.timedOut) {
      const failureReason: RunTaskFailureReason = spawnResult.timedOut ? 'timeout' : 'crashed';
      await fs.mkdir(deadDir, { recursive: true });
      const deadMarkerLines = [
        '---',
        `reason: ${failureReason}`,
        `exit_code: ${spawnResult.exitCode}`,
      ];
      if (spawnResult.signal) {
        deadMarkerLines.push(`signal: ${spawnResult.signal}`);
      }
      deadMarkerLines.push('---');
      deadMarkerLines.push(
        `Agent ${spawnResult.timedOut ? 'timed out' : 'crashed'} with code ${spawnResult.exitCode}: ${spawnResult.error || ''}\n`,
      );

      await fs.writeFile(
        path.join(deadDir, `${taskNumber}.md`),
        deadMarkerLines.join('\n'),
        'utf8',
      );
      return {
        success: false,
        reason: failureReason,
        error: spawnResult.error || `Agent exited with code ${spawnResult.exitCode}`,
      };
    }

    const resultPath = path.join(runDir, 'results', `${taskNumber}.md`);
    let hasResult = false;
    try {
      await fs.stat(resultPath);
      hasResult = true;
    } catch {}

    if (!hasResult) {
      await fs.mkdir(deadDir, { recursive: true });
      await fs.writeFile(
        path.join(deadDir, `${taskNumber}.md`),
        `---\nreason: no_result\n---\nAgent exited without writing result file at .run/results/${taskNumber}.md.\n`,
        'utf8',
      );
      return {
        success: false,
        reason: 'no_result',
        error: `Agent exited without writing .run/results/${taskNumber}.md`,
      };
    }

    await appendHarnessEvent(specFolderPath, taskNumber, {
      type: 'verify_ran',
      timestamp: new Date().toISOString(),
      data: { command: taskData.verify },
    });

    const verifyTimeoutMs = (config.timeouts.verifyTimeoutSeconds ?? 600) * 1000;
    let verifyTimedOut = false;

    const verifyPromise = new Promise<void>((resolve, reject) => {
      const child = spawn(taskData.verify, {
        cwd: projectRoot,
        shell: true,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let timer: NodeJS.Timeout | null = null;
      let killTimer: NodeJS.Timeout | null = null;

      if (verifyTimeoutMs > 0) {
        timer = setTimeout(() => {
          verifyTimedOut = true;
          const childPid = child.pid;
          if (childPid) {
            try {
              process.kill(-childPid, 'SIGTERM');
            } catch {
              try {
                child.kill('SIGTERM');
              } catch {}
            }
            killTimer = setTimeout(() => {
              try {
                process.kill(-childPid, 'SIGKILL');
              } catch {
                try {
                  child.kill('SIGKILL');
                } catch {}
              }
            }, 5000);
          }
        }, verifyTimeoutMs);
      }

      let stderr = '';
      let stdout = '';
      child.stderr?.on('data', (d) => {
        stderr += d.toString();
      });
      child.stdout?.on('data', (d) => {
        stdout += d.toString();
      });

      child.on('error', (err) => {
        if (timer) clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        reject(err);
      });

      child.on('close', (code) => {
        if (timer) clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        if (verifyTimedOut) {
          reject(
            new Error(
              `Verify command timed out after ${config.timeouts.verifyTimeoutSeconds ?? 600}s`,
            ),
          );
        } else if (code !== 0) {
          reject(new Error(stderr || stdout || `Process exited with code ${code}`));
        } else {
          resolve();
        }
      });
    });

    try {
      await verifyPromise;
    } catch (verifyErr) {
      const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
      await fs.mkdir(deadDir, { recursive: true });
      const deadLines = ['---', 'reason: verify_red'];
      if (verifyTimedOut) {
        deadLines.push('timed_out: true');
      }
      deadLines.push(`command: "${taskData.verify}"`);
      deadLines.push('---');
      deadLines.push(
        `Watcher independent verify ${verifyTimedOut ? 'timed out' : 'failed'}:\n${msg}\n`,
      );

      await fs.writeFile(path.join(deadDir, `${taskNumber}.md`), deadLines.join('\n'), 'utf8');
      return {
        success: false,
        reason: 'verify_red',
        error: `Verify failed: ${msg}`,
      };
    }

    try {
      await fs.unlink(path.join(deadDir, `${taskNumber}.md`));
    } catch {}

    await fs.mkdir(doneDir, { recursive: true });
    await fs.writeFile(path.join(doneDir, taskNumber), `${new Date().toISOString()}\n`, 'utf8');

    await tickTaskCheckbox(specFolderPath, taskNumber);

    return { success: true };
  } finally {
    await releaseLock(runDir, taskNumber);
  }
}
