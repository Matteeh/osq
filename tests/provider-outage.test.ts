import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import { DEFAULT_CONFIG, defineConfig } from '../src/core/foundation/config.js';
import { parseTaskMd } from '../src/core/spec/parser.js';
import {
  type HarnessAdapter,
  type SpawnResult,
  type SpawnTaskOptions,
  appendHarnessEvent,
} from '../src/harness/types.js';
import {
  findOpenProviderRetry,
  formatAgentFailureMarker,
  startProviderStallWatch,
} from '../src/watcher/provider-outage.js';
import { spawnTaskAgent } from '../src/watcher/spawn.js';

const DEEPSEEK_ERROR =
  'We were unable to start processing your request within the 900-second timeout limit';

const TASK_DATA = parseTaskMd(
  [
    '---',
    'title: Provider outage',
    'verify: node --version',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] survives',
    '',
  ].join('\n'),
);

interface RetryStep {
  readonly phase: 'start' | 'end';
  readonly error?: string;
  readonly success?: boolean;
  /** Explicit event timestamp in epoch milliseconds, for a backdated stall. */
  readonly at?: number;
}

/** Adapter that appends Pi-shaped `harness_retry` events before it returns. */
class ProviderAdapter implements HarnessAdapter {
  readonly name = 'provider-stub';

  constructor(
    private readonly retries: readonly RetryStep[],
    private readonly result: SpawnResult = { exitCode: 0 },
    private readonly holdMs = 0,
    readonly pid = 24680,
  ) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await options.onSpawn?.(this.pid);
    await appendHarnessEvent(options.specFolderPath, options.taskNumber, {
      type: 'tokens',
      timestamp: new Date().toISOString(),
      data: { promptTokens: 0, candidateTokens: 0, totalTokens: 0 },
    });
    for (const step of this.retries) {
      await appendHarnessEvent(options.specFolderPath, options.taskNumber, {
        type: 'harness_retry',
        timestamp: new Date(step.at ?? Date.now()).toISOString(),
        data: {
          phase: step.phase,
          attempt: 1,
          ...(step.error ? { error: step.error } : {}),
          ...(step.success !== undefined ? { success: step.success } : {}),
        },
      });
    }
    if (this.holdMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.holdMs));
    }
    return { ...this.result, pid: this.pid };
  }
}

interface LogLine {
  readonly success: boolean;
  readonly reason?: string;
  readonly extra?: string;
}

async function runTask(
  specFolderPath: string,
  projectRoot: string,
  adapter: HarnessAdapter,
  config = DEFAULT_CONFIG,
): Promise<{ outcome: Awaited<ReturnType<typeof spawnTaskAgent>>; logs: LogLine[] }> {
  const logs: LogLine[] = [];
  const outcome = await spawnTaskAgent({
    projectRoot,
    specFolderPath,
    taskNumber: '1',
    taskData: TASK_DATA,
    config,
    adapter,
    logOutcome: (success, reason, extra) => logs.push({ success, reason, extra }),
  });
  return { outcome, logs };
}

async function readStreamEvents(specFolderPath: string): Promise<Record<string, unknown>[]> {
  const raw = await fs.readFile(path.join(specFolderPath, '.run', 'events', '1.jsonl'), 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function started(timestamp: string): Record<string, unknown> {
  return { type: 'started', timestamp, data: {} };
}

function retryStart(timestamp: string, error?: string): Record<string, unknown> {
  return {
    type: 'harness_retry',
    timestamp,
    data: { phase: 'start', attempt: 1, ...(error ? { error } : {}) },
  };
}

function retryEnd(timestamp: string, success: boolean): Record<string, unknown> {
  return { type: 'harness_retry', timestamp, data: { phase: 'end', attempt: 1, success } };
}

describe('provider outage gate keys', () => {
  it('defaults each key and keeps missing keys over a defined one', () => {
    assert.equal(DEFAULT_GATES_CONFIG.providerStallSeconds, 300);
    assert.equal(DEFAULT_GATES_CONFIG.providerRetries, 3);
    assert.equal(DEFAULT_GATES_CONFIG.providerRetryDelaySeconds, 300);
    assert.equal(defineConfig({}).gates?.providerStallSeconds, 300);
    assert.equal(defineConfig({}).gates?.providerRetries, 3);
    assert.equal(defineConfig({}).gates?.providerRetryDelaySeconds, 300);
    const config = defineConfig({ gates: { autoRetries: 2 } });
    assert.equal(config.gates?.autoRetries, 2);
    assert.equal(config.gates?.providerStallSeconds, 300);
    assert.equal(config.gates?.providerRetries, 3);
    assert.equal(config.gates?.providerRetryDelaySeconds, 300);
  });

  it('retains declared values', () => {
    const config = defineConfig({
      gates: { providerStallSeconds: 10, providerRetries: 0, providerRetryDelaySeconds: 5 },
    });
    assert.equal(config.gates?.providerStallSeconds, 10);
    assert.equal(config.gates?.providerRetries, 0);
    assert.equal(config.gates?.providerRetryDelaySeconds, 5);
  });

  it('rejects negative, fractional and non-numeric values naming the key', () => {
    for (const key of [
      'providerStallSeconds',
      'providerRetries',
      'providerRetryDelaySeconds',
    ] as const) {
      for (const value of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 'three']) {
        assert.throws(
          () => defineConfig({ gates: { [key]: value } } as never),
          new RegExp(`gates\\.${key} must be a non-negative integer`),
        );
      }
    }
  });
});

describe('findOpenProviderRetry', () => {
  it('returns the start time of the first open start and the latest error', () => {
    const retry = findOpenProviderRetry([
      started('2026-10-01T00:00:00.000Z'),
      retryStart('2026-10-01T00:01:00.000Z', 'first error'),
      retryEnd('2026-10-01T00:02:00.000Z', false),
      retryStart('2026-10-01T00:03:00.000Z', DEEPSEEK_ERROR),
    ]);
    assert.deepEqual(retry, { startedAt: '2026-10-01T00:01:00.000Z', error: DEEPSEEK_ERROR });
  });

  it("ignores retries before the attempt's last started event", () => {
    const retry = findOpenProviderRetry([
      retryStart('2026-10-01T00:00:00.000Z', 'stale'),
      started('2026-10-01T00:01:00.000Z'),
      retryStart('2026-10-01T00:02:00.000Z', 'fresh'),
    ]);
    assert.deepEqual(retry, { startedAt: '2026-10-01T00:02:00.000Z', error: 'fresh' });
  });

  it('returns no open retry after a successful end', () => {
    const retry = findOpenProviderRetry([
      started('2026-10-01T00:00:00.000Z'),
      retryStart('2026-10-01T00:01:00.000Z', DEEPSEEK_ERROR),
      retryEnd('2026-10-01T00:02:00.000Z', true),
    ]);
    assert.equal(retry, undefined);
  });

  it('reopens only for a start after a successful end', () => {
    const retry = findOpenProviderRetry([
      started('2026-10-01T00:00:00.000Z'),
      retryStart('2026-10-01T00:01:00.000Z', 'before'),
      retryEnd('2026-10-01T00:02:00.000Z', true),
      retryStart('2026-10-01T00:03:00.000Z', 'after'),
    ]);
    assert.deepEqual(retry, { startedAt: '2026-10-01T00:03:00.000Z', error: 'after' });
  });

  it('does not treat a zero-token stream alone as a provider retry', () => {
    const retry = findOpenProviderRetry([
      started('2026-10-01T00:00:00.000Z'),
      {
        type: 'tokens',
        timestamp: '2026-10-01T00:00:30.000Z',
        data: { promptTokens: 0, candidateTokens: 0, totalTokens: 0 },
      },
    ]);
    assert.equal(retry, undefined);
  });
});

describe('formatAgentFailureMarker', () => {
  it('renders the provider outage body with the provider error', () => {
    assert.equal(
      formatAgentFailureMarker({
        reason: 'provider_unavailable',
        exitCode: 124,
        error: DEEPSEEK_ERROR,
      }),
      `---\nreason: provider_unavailable\nexit_code: 124\n---\nThe model provider did not answer: ${DEEPSEEK_ERROR}\n`,
    );
  });

  it('renders no error reported when the retry carried no error', () => {
    assert.equal(
      formatAgentFailureMarker({ reason: 'provider_unavailable', exitCode: 1 }),
      '---\nreason: provider_unavailable\nexit_code: 1\n---\nThe model provider did not answer: no error reported\n',
    );
  });

  it('keeps crashed and timeout marker text byte-identical', () => {
    assert.equal(
      formatAgentFailureMarker({ reason: 'crashed', exitCode: 1, error: 'boom' }),
      '---\nreason: crashed\nexit_code: 1\n---\nAgent crashed with code 1: boom\n',
    );
    assert.equal(
      formatAgentFailureMarker({
        reason: 'timeout',
        exitCode: 124,
        error: 'Task execution timed out',
      }),
      '---\nreason: timeout\nexit_code: 124\n---\nAgent timed out with code 124: Task execution timed out\n',
    );
    assert.equal(
      formatAgentFailureMarker({
        reason: 'crashed',
        exitCode: 1,
        signal: 'SIGSEGV',
        error: 'boom',
      }),
      '---\nreason: crashed\nexit_code: 1\nsignal: SIGSEGV\n---\nAgent crashed with code 1: boom\n',
    );
  });
});

describe('provider outage classification through spawnTaskAgent', () => {
  let root: string;
  let specFolder: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-provider-outage-'));
    specFolder = path.join(root, 'change');
    await fs.mkdir(path.join(specFolder, '.run'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('dies provider_unavailable when the provider never answered', async () => {
    const adapter = new ProviderAdapter([{ phase: 'start', error: DEEPSEEK_ERROR }], {
      exitCode: 124,
      timedOut: true,
      error: 'Task execution timed out',
    });
    const { outcome, logs } = await runTask(specFolder, root, adapter);

    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.result.reason, 'provider_unavailable');
    const marker = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.match(marker, /reason: provider_unavailable/);
    assert.match(marker, /exit_code: 124/);
    assert.ok(marker.includes(`The model provider did not answer: ${DEEPSEEK_ERROR}`));
    const dead = (await readStreamEvents(specFolder)).find((event) => event.type === 'dead');
    assert.equal((dead?.data as { reason?: string })?.reason, 'provider_unavailable');
    assert.equal(logs[0]?.reason, 'provider_unavailable');
  });

  it('keeps timeout when the provider recovered before the timeout', async () => {
    const adapter = new ProviderAdapter(
      [
        { phase: 'start', error: DEEPSEEK_ERROR },
        { phase: 'end', success: true },
      ],
      { exitCode: 124, timedOut: true, error: 'Task execution timed out' },
    );
    const { outcome, logs } = await runTask(specFolder, root, adapter);

    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.result.reason, 'timeout');
    const marker = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.match(marker, /reason: timeout/);
    assert.ok(marker.includes('Agent timed out with code 124: Task execution timed out'));
    const dead = (await readStreamEvents(specFolder)).find((event) => event.type === 'dead');
    assert.equal((dead?.data as { reason?: string })?.reason, 'timeout');
    assert.equal(logs[0]?.reason, 'timeout');
  });

  it('dies provider_unavailable on a crash with an open provider retry', async () => {
    const adapter = new ProviderAdapter([{ phase: 'start', error: DEEPSEEK_ERROR }], {
      exitCode: 1,
      error: 'boom',
    });
    const { outcome } = await runTask(specFolder, root, adapter);

    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.result.reason, 'provider_unavailable');
    const marker = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.ok(marker.includes(`The model provider did not answer: ${DEEPSEEK_ERROR}`));
  });

  it('keeps crashed when no provider retry is open', async () => {
    const adapter = new ProviderAdapter([], { exitCode: 1, error: 'boom' });
    const { outcome, logs } = await runTask(specFolder, root, adapter);

    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.result.reason, 'crashed');
    assert.equal(logs[0]?.extra, 'code: 1');
    const marker = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.match(marker, /reason: crashed/);
    assert.ok(marker.includes('Agent crashed with code 1: boom'));
    const dead = (await readStreamEvents(specFolder)).find((event) => event.type === 'dead');
    assert.equal((dead?.data as { reason?: string })?.reason, 'crashed');
  });
});

describe('provider stall watch', () => {
  it('starts no timer when the stall limit is zero', () => {
    const original = globalThis.setTimeout;
    let scheduled = 0;
    globalThis.setTimeout = ((callback: (...args: unknown[]) => void, ms?: number) => {
      scheduled += 1;
      return original(callback, ms);
    }) as unknown as typeof setTimeout;
    try {
      const stop = startProviderStallWatch({
        specFolderPath: '/nonexistent',
        taskNumber: '1',
        stallSeconds: 0,
        heartbeatSeconds: 0.05,
        pid: () => 1,
      });
      stop();
    } finally {
      globalThis.setTimeout = original;
    }
    assert.equal(scheduled, 0);
  });

  it('checks at the smaller of the heartbeat and the stall limit', () => {
    const original = globalThis.setTimeout;
    const delays: number[] = [];
    let stop = (): void => {};
    globalThis.setTimeout = ((
      callback: (...args: unknown[]) => void,
      ms?: number,
      ...args: unknown[]
    ) => {
      delays.push(ms ?? 0);
      return original(callback, ms, ...args);
    }) as unknown as typeof setTimeout;
    try {
      stop = startProviderStallWatch({
        specFolderPath: '/nonexistent',
        taskNumber: '1',
        stallSeconds: 300,
        heartbeatSeconds: 0.05,
        pid: () => 1,
      });
    } finally {
      globalThis.setTimeout = original;
      stop();
    }
    assert.deepEqual(delays, [50]);
  });

  it('SIGTERMs a stalled agent through spawnTaskAgent and stops after exit', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-provider-stall-'));
    const specFolder = path.join(root, 'change');
    await fs.mkdir(path.join(specFolder, '.run'), { recursive: true });
    const adapter = new ProviderAdapter(
      [{ phase: 'start', error: DEEPSEEK_ERROR, at: Date.now() - 5000 }],
      { exitCode: 1, signal: 'SIGTERM' },
      250,
    );
    const config = defineConfig({
      log: { heartbeatSeconds: 0.05 },
      gates: { providerStallSeconds: 1 },
    });
    const originalKill = process.kill;
    const kills: Array<{ pid: number; signal?: string | number }> = [];
    process.kill = ((pid: number, signal?: string | number) => {
      kills.push({ pid, signal });
      return true;
    }) as typeof process.kill;

    try {
      const { outcome, logs } = await runTask(specFolder, root, adapter, config);
      assert.equal(outcome.ok, false);
      if (!outcome.ok) assert.equal(outcome.result.reason, 'provider_unavailable');
      assert.deepEqual(kills, [{ pid: adapter.pid, signal: 'SIGTERM' }]);
      assert.equal(logs[0]?.reason, 'provider_unavailable');

      const atExit = kills.length;
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(kills.length, atExit, 'stall timer kept firing after the agent exited');
    } finally {
      process.kill = originalKill;
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
