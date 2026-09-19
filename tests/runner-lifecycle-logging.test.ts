import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { createLogger } from '../src/core/logger.js';
import { createNewSpec } from '../src/core/new.js';
import { relativizeToolSummary } from '../src/core/summary.js';
import { processAgyStdoutLine } from '../src/harness/agy.js';
import { MockAdapter } from '../src/harness/mock.js';
import { processOpencodeStdoutLine } from '../src/harness/opencode.js';
import { type SpawnProcessResult, spawnWithTimeout } from '../src/harness/process.js';
import type {
  HarnessAdapter,
  OsqEvent,
  SpawnResult,
  SpawnTaskOptions,
} from '../src/harness/types.js';
import { relativizeToolSummary as reExportedRelativize } from '../src/watcher/heartbeat.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

/**
 * Minimal adapter that writes a result file and returns an explicit pid/elapsedMs
 * so lifecycle logging can be asserted deterministically without spawning a real agent.
 */
class LifecycleStubAdapter implements HarnessAdapter {
  readonly name = 'lifecycle-stub';
  lastOptions: SpawnTaskOptions | null = null;

  constructor(private readonly result: Partial<SpawnResult> = {}) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.lastOptions = options;

    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(
      path.join(resultsDir, `${options.taskNumber}.md`),
      '# Stub result\n',
      'utf8',
    );

    return {
      exitCode: this.result.exitCode ?? 0,
      pid: this.result.pid ?? 4242,
      elapsedMs: this.result.elapsedMs ?? 1234,
      timedOut: this.result.timedOut,
      signal: this.result.signal ?? null,
      error: this.result.error,
    };
  }
}

async function captureStderr(fn: () => Promise<void>): Promise<string> {
  const originalWrite = process.stderr.write;
  let stderr = '';
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stderr.write;

  try {
    await fn();
  } finally {
    process.stderr.write = originalWrite;
  }

  return stderr;
}

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

async function readEvents(specFolder: string, taskNumber: string): Promise<ParsedEvent[]> {
  const eventFilePath = path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`);
  const raw = await fs.readFile(eventFilePath, 'utf8');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

describe('Runner lifecycle logging', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-lifecycle-log-test-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Lifecycle Logging');
    specFolder = spec.folderPath;

    const taskPath = path.join(specFolder, 'tasks', '1.md');
    const passingTask = [
      '---',
      'title: When lifecycle events are recorded, summaries are logged',
      'verify: node -e "process.exit(0)"',
      'scope: []',
      'entry: []',
      'skills: []',
      '---',
      '## Acceptance',
      '- [ ] should pass',
    ].join('\n');
    await fs.writeFile(taskPath, `${passingTask}\n`, 'utf8');

    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('spawnWithTimeout captures the child pid and elapsed duration in milliseconds', async () => {
    const result: SpawnProcessResult = await spawnWithTimeout({
      command: process.execPath,
      args: ['-e', 'process.stdout.write(String(process.pid))'],
    });

    assert.equal(result.exitCode, 0);
    assert.equal(typeof result.pid, 'number');
    assert.ok((result.pid ?? 0) > 0);
    // The child reported its own pid; it must match the pid captured by the helper.
    assert.equal(Number(result.stdout), result.pid);
    assert.equal(typeof result.elapsedMs, 'number');
    assert.ok((result.elapsedMs ?? -1) >= 0);
  });

  it('SpawnProcessResult and SpawnResult expose optional pid and elapsedMs fields', () => {
    const processResult: SpawnProcessResult = {
      exitCode: 0,
      stdout: '',
      stderr: '',
      timedOut: false,
      pid: 123,
      elapsedMs: 45,
    };
    const spawnResult: SpawnResult = { exitCode: 0, pid: 123, elapsedMs: 45 };

    assert.equal(processResult.pid, 123);
    assert.equal(processResult.elapsedMs, 45);
    assert.equal(spawnResult.pid, 123);
    assert.equal(spawnResult.elapsedMs, 45);
  });

  it('logs a started summary and records a started event with pid and timeout', async () => {
    const adapter = new LifecycleStubAdapter({ pid: 61604, elapsedMs: 1234 });
    const logger = createLogger('normal');

    const stderr = await captureStderr(async () => {
      const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter, logger);
      assert.equal(result.success, true);
    });

    assert.match(stderr, /task 1 started \(pid: 61604, timeout: 1800s\)/);

    const events = await readEvents(specFolder, '1');
    const started = events.find((event) => event.type === 'started');
    assert.ok(started, 'expected a started event');
    assert.equal(started.data?.pid, 61604);
    assert.equal(started.data?.timeoutSeconds, 1800);
  });

  it('logs an exited summary at verbose level and records an exited event with exit code and elapsed time', async () => {
    const adapter = new LifecycleStubAdapter({ pid: 61604, elapsedMs: 1234 });
    const logger = createLogger('verbose');

    const stderr = await captureStderr(async () => {
      const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter, logger);
      assert.equal(result.success, true);
    });

    assert.match(stderr, /task 1 exited \(code: 0, elapsed: 1\.2s\)/);

    const events = await readEvents(specFolder, '1');
    const exited = events.find((event) => event.type === 'exited');
    assert.ok(exited, 'expected an exited event');
    assert.equal(exited.data?.exitCode, 0);
    assert.equal(exited.data?.elapsedSeconds, 1.2);
  });

  it('demotes the exited summary to verbose while the started summary stays at info', async () => {
    const adapter = new LifecycleStubAdapter({ pid: 61604, elapsedMs: 1234 });
    const logger = createLogger('normal');

    const stderr = await captureStderr(async () => {
      const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter, logger);
      assert.equal(result.success, true);
    });

    assert.match(stderr, /task 1 started \(pid: 61604, timeout: 1800s\)/);
    assert.doesNotMatch(stderr, /task 1 exited/);

    // The exited event itself must still be persisted regardless of log level.
    const events = await readEvents(specFolder, '1');
    assert.equal(events.filter((event) => event.type === 'exited').length, 1);
  });

  it('emits each lifecycle log line from the same code path as its events.jsonl entry', async () => {
    const adapter = new LifecycleStubAdapter({ pid: 777, elapsedMs: 2000 });
    const logger = createLogger('verbose');

    const stderr = await captureStderr(async () => {
      await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter, logger);
    });

    const events = await readEvents(specFolder, '1');
    const started = events.find((event) => event.type === 'started');
    const exited = events.find((event) => event.type === 'exited');

    assert.ok(started && exited);
    // The pid logged for `started` and the pid persisted in the event must agree.
    assert.match(stderr, new RegExp(`started \\(pid: ${started.data?.pid}, timeout:`));
    // The exit code and elapsed seconds logged for `exited` must agree with the event.
    assert.match(
      stderr,
      new RegExp(
        `exited \\(code: ${exited.data?.exitCode}, elapsed: ${exited.data?.elapsedSeconds}s\\)`,
      ),
    );
  });

  it('does not log lifecycle lines when no logger is supplied', async () => {
    const adapter = new LifecycleStubAdapter({ pid: 1, elapsedMs: 10 });

    const stderr = await captureStderr(async () => {
      const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
      assert.equal(result.success, true);
    });

    assert.equal(stderr, '');
    const events = await readEvents(specFolder, '1');
    assert.equal(events.filter((event) => event.type === 'started').length, 1);
    assert.equal(events.filter((event) => event.type === 'exited').length, 1);
  });

  it('exposes relativizeToolSummary from core and re-exports it from heartbeat', () => {
    assert.equal(reExportedRelativize, relativizeToolSummary);
    assert.equal(relativizeToolSummary('/root/src/a.ts', '/root'), 'src/a.ts');
  });

  it('models every event as a typed member of the OsqEvent union', () => {
    const event: OsqEvent = { type: 'text', timestamp: 't', data: { text: 'hello' } };
    assert.equal(event.data.text, 'hello');
  });

  it('relativizes opencode tool summaries to the project root at write time', async () => {
    const absolute = path.join(tmpDir, 'src', 'a.ts');
    const line = JSON.stringify({ type: 'tool_use', tool: 'read', input: { path: absolute } });

    await processOpencodeStdoutLine(line, specFolder, '2', undefined, tmpDir);

    const events = await readEvents(specFolder, '2');
    assert.deepEqual(events[0].data, { tool: 'read', summary: path.join('src', 'a.ts') });
  });

  it('relativizes agy tool summaries to the project root at write time', async () => {
    const absolute = path.join(tmpDir, 'src', 'b.ts');
    const line = JSON.stringify({
      event: 'step_update',
      step_update: {
        step_type: 'tool',
        tool_name: 'view_file',
        tool_info: { name: 'view_file', parameters: { AbsolutePath: absolute } },
      },
    });

    await processAgyStdoutLine(line, specFolder, '3', undefined, tmpDir);

    const events = await readEvents(specFolder, '3');
    assert.deepEqual(events[0].data, { tool: 'view_file', summary: path.join('src', 'b.ts') });
  });

  it('records harness, model, and osqVersion on the started event', async () => {
    const adapter = new LifecycleStubAdapter({ pid: 555, elapsedMs: 1000 });

    await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);

    const started = (await readEvents(specFolder, '1')).find((event) => event.type === 'started');
    assert.ok(started, 'expected a started event');
    assert.equal(started.data?.harness, 'lifecycle-stub');
    assert.equal(started.data?.model, DEFAULT_CONFIG.agy?.model);
    assert.equal(typeof started.data?.osqVersion, 'string');
    assert.equal(started.data?.osqVersion, started.data?.version);
  });

  it('emits exactly one started and one exited event through MockAdapter', async () => {
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, new MockAdapter());
    assert.equal(result.success, true);

    const events = await readEvents(specFolder, '1');
    assert.equal(events.filter((event) => event.type === 'started').length, 1);
    assert.equal(events.filter((event) => event.type === 'exited').length, 1);
    const started = events.find((event) => event.type === 'started');
    assert.equal(started?.data?.harness, 'mock');
  });
});
