import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { OsqConfig } from '../core/config.js';
import { spawnWithTimeout } from './process.js';
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

export function buildAgyPrompt(options: SpawnTaskOptions): string {
  const { projectRoot, specFolderPath, taskNumber, taskTitle, scope, entry, verifyCommand } =
    options;

  const taskRelPath = path.relative(
    projectRoot,
    path.join(specFolderPath, 'tasks', `${taskNumber}.md`),
  );
  const specRelPath = path.relative(projectRoot, path.join(specFolderPath, 'spec.md'));
  const resultRelPath = path.relative(
    projectRoot,
    path.join(specFolderPath, '.run', 'results', `${taskNumber}.md`),
  );

  return [
    'You are a coding agent working autonomously on an osq task. Follow AGENTS.md strictly.',
    `Task File: ${taskRelPath}`,
    `Parent Spec: ${specRelPath}`,
    `Task Title: ${taskTitle}`,
    `Scope: ${scope.join(', ')}`,
    `Entry: ${entry.join(', ')}`,
    `Verify Command: ${verifyCommand}`,
    '',
    'Rules:',
    `1. Read ${taskRelPath}, ${specRelPath}, and features docs referenced in ${specRelPath}.`,
    '2. Write tests for each acceptance line before implementing.',
    '3. Keep all edits strictly inside scope.',
    `4. Verify your work by running: ${verifyCommand}`,
    `5. CRITICAL: Before exiting, you MUST write ${resultRelPath} documenting: changed, deviated, drift against features/, missing context, and next steps.`,
    `6. Do not modify tasks.md, spec.md, or any file outside your scope and ${resultRelPath}.`,
    `7. When done, write ${resultRelPath} and exit cleanly.`,
  ].join('\n');
}

export function buildAgyArgs(options: SpawnTaskOptions): string[] {
  const { config } = options;

  const taskPrompt = buildAgyPrompt(options);
  const model = config?.agy?.model || process.env.OSQ_MODEL || 'gemini-3.8-flash-high';
  const dangerouslySkipPermissions = config?.agy?.dangerouslySkipPermissions ?? true;

  const args = ['-p', taskPrompt, '--model', model, '--mode', 'accept-edits'];

  if (dangerouslySkipPermissions) {
    args.push('--dangerously-skip-permissions');
  }

  const rawTimeout = config?.timeouts?.taskTimeoutSeconds ?? options.timeoutSeconds ?? 1800;
  const printTimeout = Math.max(60, rawTimeout - 30);
  args.push('--print-timeout', `${printTimeout}s`);

  return args;
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

    const agyBin = await resolveAgyBinary();
    const args = buildAgyArgs(options);

    const result = await spawnWithTimeout({
      command: agyBin,
      args,
      cwd: projectRoot,
      env: {
        ...process.env,
        OSQ_TASK_NUMBER: taskNumber,
        OSQ_SPEC_FOLDER: specFolderPath,
      },
      timeoutSeconds,
    });

    await appendHarnessEvent(specFolderPath, taskNumber, {
      type: 'exited',
      timestamp: new Date().toISOString(),
      data: {
        exitCode: result.exitCode,
        signal: result.signal ?? undefined,
        timedOut: result.timedOut,
      },
    });

    return {
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      signal: result.signal,
      error: result.error,
    };
  }
}
