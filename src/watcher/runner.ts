import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { OsqConfig } from '../core/config.js';
import { hashChangeFolder } from '../core/hasher.js';
import { acquireLock, releaseLock } from '../core/lock.js';
import { parseTaskMd } from '../core/parser.js';
import { type HarnessAdapter, appendHarnessEvent } from '../harness/types.js';

const execAsync = promisify(exec);

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
    });

    if (spawnResult.exitCode !== 0) {
      await fs.mkdir(deadDir, { recursive: true });
      await fs.writeFile(
        path.join(deadDir, `${taskNumber}.md`),
        `---\nreason: crashed\nexit_code: ${spawnResult.exitCode}\n---\nAgent exited with code ${spawnResult.exitCode}: ${spawnResult.error || ''}\n`,
        'utf8',
      );
      return {
        success: false,
        reason: 'crashed',
        error: `Agent exited with code ${spawnResult.exitCode}`,
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

    try {
      await execAsync(taskData.verify, { cwd: projectRoot });
    } catch (verifyErr) {
      const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
      await fs.mkdir(deadDir, { recursive: true });
      await fs.writeFile(
        path.join(deadDir, `${taskNumber}.md`),
        `---\nreason: verify_red\ncommand: "${taskData.verify}"\n---\nWatcher independent verify failed:\n${msg}\n`,
        'utf8',
      );
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
