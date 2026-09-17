import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/config.js';
import {
  type HarnessAdapter,
  type SpawnResult,
  type SpawnTaskOptions,
  appendHarnessEvent,
} from './types.js';

export class AgyAdapter implements HarnessAdapter {
  readonly name = 'agy';

  async setup(projectRoot: string, _config: OsqConfig): Promise<void> {
    const agentsDir = path.join(projectRoot, '.agents');
    await fs.mkdir(agentsDir, { recursive: true });
  }

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    const {
      projectRoot,
      specFolderPath,
      taskNumber,
      taskTitle,
      scope,
      entry,
      skills,
      tier,
      timeoutSeconds = 1800,
    } = options;

    await appendHarnessEvent(specFolderPath, taskNumber, {
      type: 'started',
      timestamp: new Date().toISOString(),
      data: { tier, taskTitle, scope, entry, skills },
    });

    const taskPrompt = [
      `Task: ${taskTitle}`,
      `Spec Folder: ${path.relative(projectRoot, specFolderPath)}`,
      `Task Number: ${taskNumber}`,
      `Scope: ${scope.join(', ')}`,
      `Entry: ${entry.join(', ')}`,
      `Verify command: ${options.verifyCommand}`,
    ].join('\n');

    return new Promise((resolve) => {
      const child = spawn('agy', ['--task', taskPrompt], {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          OSQ_TASK_NUMBER: taskNumber,
          OSQ_SPEC_FOLDER: specFolderPath,
        },
      });

      let timeoutTimer: NodeJS.Timeout | null = null;
      if (timeoutSeconds > 0) {
        timeoutTimer = setTimeout(() => {
          child.kill('SIGTERM');
        }, timeoutSeconds * 1000);
      }

      let stderrOutput = '';
      child.stderr?.on('data', (chunk) => {
        stderrOutput += chunk.toString();
      });

      child.on('error', (err) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        appendHarnessEvent(specFolderPath, taskNumber, {
          type: 'exited',
          timestamp: new Date().toISOString(),
          data: { exitCode: 1, error: err.message },
        }).then(() => {
          resolve({ exitCode: 1, error: err.message });
        });
      });

      child.on('close', (code) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        const exitCode = code ?? 0;
        appendHarnessEvent(specFolderPath, taskNumber, {
          type: 'exited',
          timestamp: new Date().toISOString(),
          data: { exitCode },
        }).then(() => {
          resolve({ exitCode, error: exitCode !== 0 ? stderrOutput : undefined });
        });
      });
    });
  }
}
