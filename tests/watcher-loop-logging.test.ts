import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { acquireLock } from '../src/core/lock.js';
import { type Logger, createLogger, resolveSymbol } from '../src/core/logger.js';
import { createNewSpec } from '../src/core/new.js';
import { MockAdapter } from '../src/harness/mock.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { formatIdleStatus, runWatcherCycle, startWatcher } from '../src/watcher/loop.js';

class FakeStream extends Writable {
  isTTY: boolean;
  private chunks: string[] = [];

  constructor(isTTY: boolean) {
    super();
    this.isTTY = isTTY;
  }

  _write(
    chunk: string | Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    callback();
  }

  get output(): string {
    return this.chunks.join('');
  }
}

class CaptureLogger implements Logger {
  readonly infos: string[] = [];
  readonly errors: string[] = [];
  readonly statuses: string[] = [];
  clearCount = 0;
  readonly interactive: boolean;
  readonly symbols: boolean;

  constructor(options: { symbols?: boolean; interactive?: boolean } = {}) {
    this.interactive = options.interactive ?? false;
    this.symbols = options.symbols ?? false;
  }

  info(msg: string): void {
    this.infos.push(msg);
  }

  verbose(_msg: string): void {}

  warn(_msg: string): void {}

  error(msg: string): void {
    this.errors.push(msg);
  }

  status(text: string): void {
    this.statuses.push(text);
  }

  clearStatus(): void {
    this.clearCount++;
  }
}

class BlockingAdapter implements HarnessAdapter {
  readonly name = 'blocking';
  readonly started: Promise<void>;
  private readonly signalStart: () => void;
  private readonly released: Promise<void>;
  private release: (() => void) | null = null;

  constructor() {
    let signalStart: (() => void) | null = null;
    this.started = new Promise<void>((resolve) => {
      signalStart = resolve;
    });
    this.signalStart = signalStart as unknown as () => void;

    let release: (() => void) | null = null;
    this.released = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.release = release;
  }

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.signalStart();
    await this.released;

    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(path.join(resultsDir, `${options.taskNumber}.md`), '# ok\n', 'utf8');

    return { exitCode: 0 };
  }

  finish(): void {
    this.release?.();
  }
}

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
  } else {
    process.env[name] = value;
  }
}

async function writeTask1(specFolder: string): Promise<void> {
  const task = [
    '---',
    'title: When a spec is processed, the loop logs one line',
    'verify: node -e "process.exit(0)"',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] logs a line',
  ].join('\n');
  await fs.writeFile(path.join(specFolder, 'tasks', '1.md'), `${task}\n`, 'utf8');
}

describe('Watcher loop permanent logging', () => {
  let tmpDir: string;
  let adapter: MockAdapter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-loop-logging-'));
    await scaffoldProject(tmpDir);
    adapter = new MockAdapter();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('logs a single pick-up line when an approved spec is detected', async () => {
    const spec = await createNewSpec(tmpDir, 'Pick Up Logging');
    await writeTask1(spec.folderPath);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const logger = new CaptureLogger();
    const summary = await runWatcherCycle(tmpDir, DEFAULT_CONFIG, adapter, logger);

    assert.equal(summary.tasksRun, 1);
    const pickupLines = logger.infos.filter((line) => line.includes('picked up'));
    assert.deepEqual(pickupLines, [`[spec] 001 picked up (${spec.folderName})`]);
  });

  it('logs a single archive line when a completed spec is archived', async () => {
    const spec = await createNewSpec(tmpDir, 'Archive Logging');
    await writeTask1(spec.folderPath);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const logger = new CaptureLogger();
    const summary = await runWatcherCycle(tmpDir, DEFAULT_CONFIG, adapter, logger);

    assert.equal(summary.specsArchived, 1);
    const archiveLines = logger.infos.filter((line) => line.includes('archived'));
    assert.deepEqual(archiveLines, [`[archived] 001 archived (${spec.folderName})`]);
  });

  it('logs a single halt line when a task dies', async () => {
    const spec = await createNewSpec(tmpDir, 'Halt Logging');
    await writeTask1(spec.folderPath);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    adapter.setBehavior({ exitCode: 1 });

    const logger = new CaptureLogger();
    const summary = await runWatcherCycle(tmpDir, DEFAULT_CONFIG, adapter, logger);

    assert.equal(summary.tasksRun, 1);
    assert.equal(summary.specsArchived, 0);
    const haltLines = logger.infos.filter((line) => line.includes('halted'));
    assert.deepEqual(haltLines, ['[halted] 001 halted (task 1 dead)']);
    assert.ok(spec.folderName.startsWith('001-'));
  });

  it('logs watcher errors at error level on permanent lines', async () => {
    await fs.mkdir(path.join(tmpDir, 'openspec', 'changes', '099-broken'), { recursive: true });

    const logger = new CaptureLogger();
    const summary = await runWatcherCycle(tmpDir, DEFAULT_CONFIG, adapter, logger);

    assert.equal(summary.tasksRun, 0);
    assert.equal(logger.errors.length, 1);
    assert.match(logger.errors[0], /^\[error\] watcher error: /);
  });
});

describe('Watcher loop symbol formatting', () => {
  let tmpDir: string;
  let adapter: MockAdapter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-loop-symbols-'));
    await scaffoldProject(tmpDir);
    adapter = new MockAdapter();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function setupApprovedSpec(): Promise<void> {
    const spec = await createNewSpec(tmpDir, 'Symbol Logging');
    await writeTask1(spec.folderPath);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
  }

  it('resolveSymbol returns unicode when enabled and plain words otherwise', () => {
    assert.equal(resolveSymbol('▶ spec', '[spec]', true), '▶ spec');
    assert.equal(resolveSymbol('▶ spec', '[spec]', false), '[spec]');
    assert.equal(resolveSymbol('✗', '[error]', false), '[error]');
  });

  it('uses unicode symbols on an interactive TTY', async () => {
    await setupApprovedSpec();
    const stream = new FakeStream(true);
    const logger = createLogger('normal', 'osq', { stream });

    await runWatcherCycle(tmpDir, DEFAULT_CONFIG, adapter, logger);

    assert.equal(logger.symbols, true);
    assert.ok(stream.output.includes('▶ spec 001 picked up'));
    assert.ok(stream.output.includes('✓ spec 001 archived'));
  });

  it('uses plain words when stderr is not a TTY', async () => {
    await setupApprovedSpec();
    const stream = new FakeStream(false);
    const logger = createLogger('normal', 'osq', { stream });

    await runWatcherCycle(tmpDir, DEFAULT_CONFIG, adapter, logger);

    assert.equal(logger.symbols, false);
    assert.ok(stream.output.includes('[spec] 001 picked up'));
    assert.ok(stream.output.includes('[archived] 001 archived'));
    assert.ok(!stream.output.includes('▶'));
  });

  it('uses plain words when CI is set', async () => {
    process.env.CI = '1';
    await setupApprovedSpec();
    const stream = new FakeStream(true);
    const logger = createLogger('normal', 'osq', { stream });

    await runWatcherCycle(tmpDir, DEFAULT_CONFIG, adapter, logger);

    assert.equal(logger.symbols, false);
    assert.ok(stream.output.includes('[spec] 001 picked up'));
    assert.ok(!stream.output.includes('▶'));
  });

  it('uses plain words when NO_COLOR is present', async () => {
    process.env.NO_COLOR = '1';
    await setupApprovedSpec();
    const stream = new FakeStream(true);
    const logger = createLogger('normal', 'osq', { stream });

    await runWatcherCycle(tmpDir, DEFAULT_CONFIG, adapter, logger);

    assert.equal(logger.symbols, false);
    assert.ok(stream.output.includes('[spec] 001 picked up'));
    assert.ok(!stream.output.includes('▶'));
  });
});

describe('Watcher idle status', () => {
  let tmpDir: string;
  let adapter: MockAdapter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-loop-idle-'));
    await scaffoldProject(tmpDir);
    adapter = new MockAdapter();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('formats the build prefix, watching path, approved waiting count, and last archived spec', () => {
    const now = 1_700_000_000_000;
    const buildInfo = { version: '0.1.0', commit: 'abc1234' };
    assert.equal(
      formatIdleStatus(
        'specs',
        2,
        { id: '011', folder: '011-x', archivedAt: now - 120_000 },
        now,
        buildInfo,
      ),
      'osq v0.1.0 (abc1234) · watching specs · 2 approved waiting · last: 011 archived 2m ago',
    );
    assert.equal(
      formatIdleStatus('specs', 0, undefined, now, buildInfo),
      'osq v0.1.0 (abc1234) · watching specs · 0 approved waiting · last: none',
    );
  });

  it('sets an idle status with the waiting count and last archived spec', async () => {
    const first = await createNewSpec(tmpDir, 'First Spec');
    await writeTask1(first.folderPath);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    await runWatcherCycle(tmpDir, DEFAULT_CONFIG, adapter);

    const second = await createNewSpec(tmpDir, 'Second Spec');
    await writeTask1(second.folderPath);
    await approveSpec(tmpDir, '002', DEFAULT_CONFIG);
    await acquireLock(path.join(second.folderPath, '.run'), '1');

    const logger = new CaptureLogger();
    const summary = await runWatcherCycle(tmpDir, DEFAULT_CONFIG, adapter, logger);

    assert.equal(summary.tasksRun, 0);
    assert.equal(logger.statuses.length, 1);
    assert.match(
      logger.statuses[0],
      /^osq v\S+ \(\S+\) · watching (?:specs|openspec\/changes) · 1 approved waiting · last: 001 archived \d+s ago$/,
    );
  });
});

describe('Watcher SIGINT handling', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-loop-sigint-'));
    await scaffoldProject(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('clears status, restores the cursor, logs waiting, then exits on second SIGINT', async () => {
    const spec = await createNewSpec(tmpDir, 'Sigint Spec');
    await writeTask1(spec.folderPath);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const adapter = new BlockingAdapter();
    const logger = new CaptureLogger({ interactive: true, symbols: true });
    const controller = new AbortController();

    const stderrChunks: string[] = [];
    const originalWrite = process.stderr.write;
    const originalExit = process.exit;
    const exitCodes: number[] = [];

    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stderr.write;

    process.exit = ((code?: number) => {
      exitCodes.push(code ?? 0);
      throw new Error('process.exit');
    }) as typeof process.exit;

    try {
      const watcherPromise = startWatcher(tmpDir, DEFAULT_CONFIG, adapter, {
        pollIntervalMs: 1000,
        signal: controller.signal,
        logger,
      });
      await adapter.started;

      process.emit('SIGINT');
      assert.equal(logger.clearCount, 1);
      assert.ok(stderrChunks.join('').includes('\x1b[?25h'));
      assert.ok(
        logger.infos.includes('waiting for running task to exit (press Ctrl+C again to kill)'),
      );

      assert.throws(() => process.emit('SIGINT'), /process\.exit/);
      assert.deepEqual(exitCodes, [130]);

      adapter.finish();
      await watcherPromise;
    } finally {
      adapter.finish();
      controller.abort();
      process.stderr.write = originalWrite;
      process.exit = originalExit;
    }
  });
});

const originalCI = process.env.CI;
const originalNoColor = process.env.NO_COLOR;

beforeEach(() => {
  setEnv('CI', undefined);
  setEnv('NO_COLOR', undefined);
});

afterEach(() => {
  setEnv('CI', originalCI);
  setEnv('NO_COLOR', originalNoColor);
});
