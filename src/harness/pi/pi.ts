import {
  assessPiVersion,
  resolvePiBinary,
  runPiAuthCheck,
} from '../../core/foundation/config-pi.js';
import { type OsqConfig, loadConfig } from '../../core/foundation/config.js';
import { DEFAULT_KILL_GRACE_PERIOD_MS, spawnWithTimeout } from '../process.js';
import { EventStreamParser } from '../stream.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../types.js';
import { buildPiArgs } from './pi-args.js';
import { createPiStreamState, processPiStdoutLine } from './pi-stream.js';

const MISSING_KEY_MARKER = 'No API key found';

async function probePiVersion(
  bin: string,
  projectRoot: string,
  timeoutSeconds: number,
  killGracePeriodMs?: number,
): Promise<string | undefined> {
  const result = await spawnWithTimeout({
    command: bin,
    args: ['--version'],
    cwd: projectRoot,
    timeoutSeconds,
    killGracePeriodMs,
  });
  if (result.exitCode !== 0) return undefined;
  return (result.stdout || result.stderr).trim().split('\n')[0]?.trim();
}

function missingCredentialsHint(provider: string | undefined): string {
  return `Pi credentials are missing. Run: pi auth check --provider ${provider ?? 'default'}`;
}

/** Probe `pi --version`, warn outside the tested range, and check credentials. */
export async function preflightPi(projectRoot: string, config: OsqConfig): Promise<void> {
  const bin = resolvePiBinary(config);
  const timeoutSeconds = config.timeouts?.harnessPreflightSeconds ?? 10;
  const version = await probePiVersion(
    bin,
    projectRoot,
    timeoutSeconds,
    config.timeouts?.harnessKillGracePeriodMs,
  );
  if (version === undefined) {
    throw new Error(`Pi binary not found or failed: ${bin}`);
  }

  const assessment = assessPiVersion(version);
  if (!assessment.tested) {
    console.warn(assessment.warning ?? `Pi ${version} is outside the tested range`);
  }

  const provider = config.pi?.provider?.trim();
  if (!provider) return;

  const auth = await runPiAuthCheck(bin, projectRoot, provider, timeoutSeconds);
  if (!auth.ok) {
    throw new Error(
      `Pi credentials not ready for provider ${provider}: ${auth.reason ?? auth.status}. ` +
        `Run: pi auth check --provider ${provider}`,
    );
  }
}

export class PiAdapter implements HarnessAdapter {
  readonly name = 'pi';

  async setup(_projectRoot: string, _config: OsqConfig): Promise<void> {
    // Pi reads AGENTS.md itself; osq writes no Pi files.
  }

  async preflight(projectRoot: string, config: OsqConfig): Promise<void> {
    await preflightPi(projectRoot, config);
  }

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    const { projectRoot, specFolderPath, taskNumber } = options;
    const resolved = options.config ?? (await loadConfig(projectRoot).catch(() => undefined));
    const bin = resolvePiBinary(resolved);
    const args = buildPiArgs(options, resolved);
    const state = createPiStreamState();
    const parser = new EventStreamParser((line) =>
      processPiStdoutLine(
        line,
        { specFolderPath, taskNumber, projectRoot, logger: options.logger },
        state,
      ),
    );
    const killGraceMs =
      resolved?.timeouts?.harnessKillGracePeriodMs ?? DEFAULT_KILL_GRACE_PERIOD_MS;
    const version = await probePiVersion(
      bin,
      projectRoot,
      resolved?.timeouts?.harnessPreflightSeconds ?? 10,
      resolved?.timeouts?.harnessKillGracePeriodMs,
    );

    let pid: number | undefined;
    let finished = false;
    let graceTimer: NodeJS.Timeout | undefined;
    state.onSettled = () => {
      if (graceTimer) return;
      graceTimer = setTimeout(() => {
        if (!finished && pid !== undefined) {
          try {
            process.kill(pid, 'SIGTERM');
          } catch {}
        }
      }, killGraceMs);
    };

    const result = await spawnWithTimeout({
      command: bin,
      args,
      cwd: projectRoot,
      env: { ...process.env, OSQ_TASK_NUMBER: taskNumber, OSQ_SPEC_FOLDER: specFolderPath },
      timeoutSeconds: options.timeoutSeconds ?? resolved?.timeouts?.taskTimeoutSeconds ?? 1800,
      killGracePeriodMs: resolved?.timeouts?.harnessKillGracePeriodMs,
      onStdout: (chunk) => parser.feed(chunk),
      onSpawn: (childPid) => {
        pid = childPid;
        options.onSpawn?.(childPid, version ? { harnessVersion: version } : undefined);
      },
    });
    finished = true;
    if (graceTimer) clearTimeout(graceTimer);
    await parser.flush();

    const settled = state.settled;
    const failed = !settled && result.exitCode !== 0;
    const missingKey = failed && result.stderr.includes(MISSING_KEY_MARKER);
    const error = missingKey
      ? `${result.stderr.trim()}\n${missingCredentialsHint(resolved?.pi?.provider)}`
      : result.error;

    return {
      exitCode: settled ? 0 : result.exitCode,
      timedOut: settled ? false : result.timedOut,
      signal: result.signal,
      error: settled ? undefined : error,
      pid: result.pid,
      elapsedMs: result.elapsedMs,
    };
  }
}
