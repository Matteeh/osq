import { spawn } from 'node:child_process';
import { resolveCodexBinary } from '../../core/foundation/config-codex.js';
import { type OsqConfig, loadConfig } from '../../core/foundation/config.js';
import { spawnWithTimeout } from '../process.js';
import { EventStreamParser } from '../stream.js';
import type {
  HarnessAdapter,
  InteractiveSessionOptions,
  InteractiveUsage,
  ReadInteractiveUsageOptions,
  SpawnResult,
  SpawnTaskOptions,
} from '../types.js';
import { buildCodexArgs, buildCodexInteractiveArgs } from './codex-prompt.js';
import { createCodexStreamState, processCodexStdoutLine } from './codex-stream.js';
import { readCodexInteractiveUsage } from './codex-usage.js';

/** Probe the configured Codex executable with `--version`, exiting on failure. */
export async function preflightCodex(
  projectRoot: string,
  config?: OsqConfig,
): Promise<{ version: string; bin: string }> {
  const bin = resolveCodexBinary(config);
  const result = await spawnWithTimeout({
    command: bin,
    args: ['--version'],
    cwd: projectRoot,
    timeoutSeconds: config?.timeouts?.harnessPreflightSeconds ?? 10,
    killGracePeriodMs: config?.timeouts?.harnessKillGracePeriodMs,
  });

  if (result.exitCode !== 0) {
    console.error(`Codex binary not found or failed: ${bin}`);
    process.exitCode = 1;
    process.exit(1);
  }

  const version = (result.stdout || result.stderr).trim().split('\n')[0].trim();
  console.log(version);
  return { version, bin };
}

export class CodexAdapter implements HarnessAdapter {
  readonly name = 'codex';

  async setup(_projectRoot: string, _config: OsqConfig): Promise<void> {
    // Codex needs no harness-specific files; shared setup owns AGENTS.md.
  }

  async preflight(projectRoot: string, config: OsqConfig): Promise<void> {
    await preflightCodex(projectRoot, config);
  }

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    const { projectRoot, specFolderPath, taskNumber, config } = options;
    const resolved = config ?? (await loadConfig(projectRoot).catch(() => undefined));
    const bin = resolveCodexBinary(resolved);
    const args = await buildCodexArgs(options);
    const state = createCodexStreamState();
    const parser = new EventStreamParser((line) =>
      processCodexStdoutLine(
        line,
        { specFolderPath, taskNumber, projectRoot, logger: options.logger },
        state,
      ),
    );

    const result = await spawnWithTimeout({
      command: bin,
      args,
      cwd: projectRoot,
      env: {
        ...process.env,
        OSQ_TASK_NUMBER: taskNumber,
        OSQ_SPEC_FOLDER: specFolderPath,
      },
      timeoutSeconds: options.timeoutSeconds ?? resolved?.timeouts?.taskTimeoutSeconds ?? 1800,
      killGracePeriodMs: resolved?.timeouts?.harnessKillGracePeriodMs,
      onStdout: (chunk) => {
        parser.feed(chunk);
      },
      onSpawn: options.onSpawn,
    });

    await parser.flush();

    const terminal = state.terminalFailure;
    return {
      exitCode: terminal !== undefined && result.exitCode === 0 ? 1 : result.exitCode,
      timedOut: result.timedOut,
      signal: result.signal,
      error: terminal ?? result.error,
      pid: result.pid,
      elapsedMs: result.elapsedMs,
    };
  }

  async spawnInteractive(options: InteractiveSessionOptions): Promise<number> {
    const { prompt, cwd, model, agent } = options;
    if (agent) {
      throw new Error('Codex does not support planner.agent; remove the unsupported setting.');
    }
    const config = await loadConfig(cwd).catch(() => undefined);
    const bin = resolveCodexBinary(config);
    const args = buildCodexInteractiveArgs({ prompt, model });

    const child = spawn(bin, args, {
      cwd,
      env: process.env,
      stdio: 'inherit',
    });

    return new Promise<number>((resolve) => {
      child.on('error', () => resolve(1));
      child.on('close', (code) => resolve(code ?? 1));
    });
  }

  async readInteractiveUsage(options: ReadInteractiveUsageOptions): Promise<InteractiveUsage> {
    return await readCodexInteractiveUsage(options);
  }
}
