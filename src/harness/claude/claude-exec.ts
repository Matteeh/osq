import {
  CLAUDE_MINIMUM_VERSION,
  assessClaudeVersion,
  resolveClaudeBinary,
} from '../../core/foundation/config-claude.js';
import { type OsqConfig, loadConfig } from '../../core/foundation/config.js';
import { spawnWithTimeout } from '../process.js';
import { EventStreamParser } from '../stream.js';
import type { HarnessAdapter, SpawnDetails, SpawnResult, SpawnTaskOptions } from '../types.js';
import { buildClaudeArgs, usesClaudeBare } from './claude-exec-args.js';
import { createClaudeStreamState, processClaudeStdoutLine } from './claude-stream.js';

async function probeClaudeVersion(
  bin: string,
  projectRoot: string,
  timeoutSeconds: number,
): Promise<string | undefined> {
  const result = await spawnWithTimeout({
    command: bin,
    args: ['--version'],
    cwd: projectRoot,
    timeoutSeconds,
  });
  if (result.exitCode !== 0) return undefined;
  return (result.stdout || result.stderr).trim().split('\n')[0]?.trim() || undefined;
}

/** Probe `claude --version` and fail below the minimum before any task spawns. */
export async function preflightClaude(projectRoot: string, config: OsqConfig): Promise<void> {
  const bin = resolveClaudeBinary(config);
  const timeoutSeconds = config.timeouts?.harnessPreflightSeconds ?? 10;
  const version = await probeClaudeVersion(bin, projectRoot, timeoutSeconds);
  if (version === undefined) {
    throw new Error(`Claude Code binary not found or failed: ${bin}`);
  }
  const assessment = assessClaudeVersion(version);
  if (!assessment.ok) {
    throw new Error(
      `Claude Code ${assessment.version} is below the required minimum ${CLAUDE_MINIMUM_VERSION}`,
    );
  }
}

/** Claude Code executor adapter: one stripped-down headless process per task. */
export class ClaudeAdapter implements HarnessAdapter {
  readonly name = 'claude';

  async setup(_projectRoot: string, _config: OsqConfig): Promise<void> {
    // Claude Code needs no harness-specific files; shared setup owns AGENTS.md.
  }

  async preflight(projectRoot: string, config: OsqConfig): Promise<void> {
    await preflightClaude(projectRoot, config);
  }

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    const { projectRoot, specFolderPath, taskNumber } = options;
    const resolved = options.config ?? (await loadConfig(projectRoot).catch(() => undefined));
    const bin = resolveClaudeBinary(resolved);
    const args = buildClaudeArgs(options, resolved);
    const state = createClaudeStreamState();
    const parser = new EventStreamParser((line) =>
      processClaudeStdoutLine(
        line,
        { specFolderPath, taskNumber, projectRoot, logger: options.logger },
        state,
      ),
    );
    const version = await probeClaudeVersion(
      bin,
      projectRoot,
      resolved?.timeouts?.harnessPreflightSeconds ?? 10,
    );
    const auth = usesClaudeBare() ? 'api_key' : 'login';

    const result = await spawnWithTimeout({
      command: bin,
      args,
      cwd: projectRoot,
      env: { ...process.env, OSQ_TASK_NUMBER: taskNumber, OSQ_SPEC_FOLDER: specFolderPath },
      timeoutSeconds: options.timeoutSeconds ?? resolved?.timeouts?.taskTimeoutSeconds ?? 1800,
      killGracePeriodMs: resolved?.timeouts?.harnessKillGracePeriodMs,
      onStdout: (chunk) => parser.feed(chunk),
      onSpawn: (childPid) => {
        const details: SpawnDetails = {
          harnessAuth: auth,
          ...(version ? { harnessVersion: version } : {}),
        };
        options.onSpawn?.(childPid, details);
      },
    });
    await parser.flush();

    const failed = result.exitCode !== 0 || result.timedOut;
    const subtype = state.isError && state.subtype ? `Claude Code result: ${state.subtype}` : '';
    const error = [result.error, subtype].filter((part) => Boolean(part)).join('\n');

    return {
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      signal: result.signal,
      error: failed && error ? error : undefined,
      pid: result.pid,
      elapsedMs: result.elapsedMs,
    };
  }
}
