import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { OsqConfig } from '../core/config.js';
import {
  type HarnessAdapter,
  type SpawnResult,
  type SpawnTaskOptions,
  appendHarnessEvent,
} from './types.js';

export async function resolveAgyBinary(): Promise<string> {
  if (process.env.AGY_PATH) {
    return process.env.AGY_PATH;
  }

  const home = os.homedir();
  const candidates = [path.join(home, '.local', 'bin', 'agy'), '/usr/local/bin/agy', 'agy'];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }

  return 'agy';
}

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

    const taskRelPath = path.relative(
      projectRoot,
      path.join(specFolderPath, 'tasks', `${taskNumber}.md`),
    );
    const specRelPath = path.relative(projectRoot, path.join(specFolderPath, 'spec.md'));
    const resultRelPath = path.relative(
      projectRoot,
      path.join(specFolderPath, '.run', 'results', `${taskNumber}.md`),
    );

    const taskPrompt = [
      'You are a coding agent working autonomously on an osq task. Follow AGENTS.md strictly.',
      `Task File: ${taskRelPath}`,
      `Parent Spec: ${specRelPath}`,
      `Task Title: ${taskTitle}`,
      `Scope: ${scope.join(', ')}`,
      `Entry: ${entry.join(', ')}`,
      `Verify Command: ${options.verifyCommand}`,
      '',
      'Rules:',
      `1. Read ${taskRelPath}, ${specRelPath}, and features docs referenced in ${specRelPath}.`,
      '2. Write tests for each acceptance line before implementing.',
      '3. Keep all edits strictly inside scope.',
      `4. Verify your work by running: ${options.verifyCommand}`,
      `5. CRITICAL: Before exiting, you MUST write ${resultRelPath} documenting: changed, deviated, drift against features/, missing context, and next steps.`,
      `6. Do not modify tasks.md, spec.md, or any file outside your scope and ${resultRelPath}.`,
      `7. When done, write ${resultRelPath} and exit cleanly.`,
    ].join('\n');

    const agyBin = await resolveAgyBinary();
    const args = [
      '-p',
      taskPrompt,
      '--model',
      'gemini-3.8-flash-high',
      '--mode',
      'accept-edits',
      '--dangerously-skip-permissions',
    ];

    return new Promise((resolve) => {
      const child = spawn(agyBin, args, {
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

      let stdoutOutput = '';
      let stderrOutput = '';

      child.stdout?.on('data', (chunk) => {
        stdoutOutput += chunk.toString();
      });

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
          resolve({
            exitCode,
            error: exitCode !== 0 ? stderrOutput || stdoutOutput : undefined,
          });
        });
      });
    });
  }
}
