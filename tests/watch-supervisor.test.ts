import assert from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { WatchConfig } from '../src/core/foundation/config-watch.js';
import { defineConfig } from '../src/core/foundation/config.js';
import { readWatchState, watchStateDir, writeServiceRecord } from '../src/core/run/watch-state.js';
import { EXIT_NEW_BUILD } from '../src/watcher/service-build.js';
import {
  type ServiceSupervisorOptions,
  type ServiceWorkerSpec,
  WATCH_ROLE_ENV,
  runServiceSupervisor,
} from '../src/watcher/service.js';

/** Minimal ChildProcess stand-in: kill records the signal, exit emits the event. */
class FakeWorker extends EventEmitter {
  readonly signals: string[] = [];

  kill(signal?: NodeJS.Signals | number): boolean {
    this.signals.push(String(signal));
    return true;
  }

  exitNow(code: number | null = 0, signal: NodeJS.Signals | null = null): void {
    this.emit('exit', code, signal);
  }
}

interface FakeTimer {
  callback: () => void;
  delayMs: number;
  cancelled: boolean;
}

interface Harness {
  workers: FakeWorker[];
  specs: ServiceWorkerSpec[];
  timers: FakeTimer[];
  delays: number[];
  exits: number[];
  clock: { value: number };
  signals: () => void;
  advance: (ms: number) => void;
  fireNext: (index: number) => void;
  runPromise: Promise<void>;
}

interface SetupOptions {
  watch?: Partial<WatchConfig>;
  entry?: string;
  execArgv?: readonly string[];
  forwardArgs?: readonly string[];
  onSpawn?: (spec: ServiceWorkerSpec) => void;
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('condition was not met in time');
}

async function setupHarness(
  projectRoot: string,
  home: string,
  options: SetupOptions = {},
): Promise<Harness> {
  const workers: FakeWorker[] = [];
  const specs: ServiceWorkerSpec[] = [];
  const timers: FakeTimer[] = [];
  const delays: number[] = [];
  const exits: number[] = [];
  const clock = { value: 1_700_000_000_000 };
  let signal: () => void = () => {};

  const supervisorOptions: ServiceSupervisorOptions = {
    projectRoot,
    config: defineConfig({ watch: options.watch ?? {} }),
    entry: options.entry ?? '/entry/bin.js',
    execArgv: options.execArgv ?? ['--import', 'tsx'],
    forwardArgs: options.forwardArgs ?? [],
    home,
  };

  const runPromise = runServiceSupervisor(supervisorOptions, {
    spawnWorker: (spec) => {
      specs.push(spec);
      options.onSpawn?.(spec);
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as ChildProcess;
    },
    setTimer: (callback, delayMs) => {
      const entry: FakeTimer = { callback, delayMs, cancelled: false };
      timers.push(entry);
      delays.push(delayMs);
      return {
        cancel: () => {
          entry.cancelled = true;
        },
      };
    },
    now: () => clock.value,
    onSignal: (handler) => {
      signal = handler;
      return () => {};
    },
    exit: (code) => {
      exits.push(code);
    },
  });

  const harness: Harness = {
    workers,
    specs,
    timers,
    delays,
    exits,
    clock,
    signals: () => signal(),
    advance: (ms) => {
      clock.value += ms;
    },
    fireNext: (index) => {
      const timer = timers[index];
      if (!timer) throw new Error(`no timer at index ${index}`);
      timer.callback();
    },
    runPromise,
  };

  await waitFor(() => workers.length > 0 || exits.length > 0);
  return harness;
}

describe('watch service supervisor', () => {
  let base: string;
  let home: string;
  let projectRoot: string;
  let logPath: string;

  beforeEach(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-watch-supervisor-'));
    home = path.join(base, 'home');
    projectRoot = path.join(base, 'project');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(projectRoot, { recursive: true });
    logPath = path.join(await watchStateDir(projectRoot, home), 'watch.log');
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  it('builds the worker spec from the execArgv, entry, forwarded flags, and role', async () => {
    const harness = await setupHarness(projectRoot, home, {
      entry: '/opt/osq/dist/cli/bin.js',
      execArgv: ['--import', 'tsx'],
      forwardArgs: ['--quiet'],
    });

    const spec = harness.specs[0];
    assert.equal(spec.command, process.execPath);
    assert.deepEqual(spec.args, [
      '--import',
      'tsx',
      '/opt/osq/dist/cli/bin.js',
      'watch',
      '--quiet',
    ]);
    assert.equal(spec.env[WATCH_ROLE_ENV], 'worker');
    assert.equal(spec.env.PATH, process.env.PATH);
    assert.equal(spec.cwd, projectRoot);
    assert.equal(spec.logPath, logPath);
  });

  it('backs off after crashes, doubling up to the maximum', async () => {
    const harness = await setupHarness(projectRoot, home, {
      watch: { restartDelaySeconds: 5, restartMaxDelaySeconds: 15 },
    });
    assert.equal(harness.workers.length, 1);

    for (let i = 0; i < 4; i++) {
      harness.advance(1000);
      harness.workers[i].exitNow(1);
      await waitFor(() => harness.timers.length === i + 1);
      if (i < 3) {
        harness.fireNext(i);
        await waitFor(() => harness.workers.length === i + 2);
      }
    }

    assert.deepEqual(harness.delays, [5000, 10000, 15000, 15000]);
    const log = await fs.readFile(logPath, 'utf8');
    assert.match(log, /watcher exited with 1; restarting in 5s/);
    assert.match(log, /watcher exited with 1; restarting in 10s/);
    assert.match(log, /watcher exited with 1; restarting in 15s/);
  });

  it('resets the backoff after a worker runs longer than the maximum', async () => {
    const harness = await setupHarness(projectRoot, home, {
      watch: { restartDelaySeconds: 5, restartMaxDelaySeconds: 15 },
    });

    harness.advance(1000);
    harness.workers[0].exitNow(1);
    await waitFor(() => harness.timers.length === 1);
    harness.fireNext(0);
    await waitFor(() => harness.workers.length === 2);

    harness.advance(1000);
    harness.workers[1].exitNow(1);
    await waitFor(() => harness.timers.length === 2);
    harness.fireNext(1);
    await waitFor(() => harness.workers.length === 3);

    harness.advance(16_000);
    harness.workers[2].exitNow(1);
    await waitFor(() => harness.timers.length === 3);

    assert.deepEqual(harness.delays, [5000, 10000, 5000]);
  });

  it('restarts at once on a new build with no delay', async () => {
    const harness = await setupHarness(projectRoot, home, {
      watch: { restartDelaySeconds: 5, restartMaxDelaySeconds: 15 },
    });

    harness.workers[0].exitNow(EXIT_NEW_BUILD);
    await waitFor(() => harness.workers.length === 2);

    assert.equal(harness.timers.length, 0, 'a new build must not wait');
    const log = await fs.readFile(logPath, 'utf8');
    assert.match(log, /^[0-9T:.Z-]+ new osq build; restarting the watcher$/m);
  });

  it('sends SIGINT to a running worker, removes the record, and exits 0', async () => {
    await writeServiceRecord(
      projectRoot,
      { pid: process.pid, startedAt: '2026-10-07T00:00:00.000Z', log: logPath },
      home,
    );
    const harness = await setupHarness(projectRoot, home);

    harness.signals();
    assert.deepEqual(harness.workers[0].signals, ['SIGINT']);
    assert.equal(harness.workers.length, 1, 'no new worker before the running one exits');

    harness.workers[0].exitNow(0);
    await harness.runPromise;

    assert.deepEqual(harness.exits, [0]);
    assert.equal(harness.workers.length, 1);
    assert.equal((await readWatchState(projectRoot, home)).service, null);
  });

  it('cancels a pending restart on a stop signal and exits 0', async () => {
    await writeServiceRecord(
      projectRoot,
      { pid: process.pid, startedAt: '2026-10-07T00:00:00.000Z', log: logPath },
      home,
    );
    const harness = await setupHarness(projectRoot, home, {
      watch: { restartDelaySeconds: 5, restartMaxDelaySeconds: 15 },
    });

    harness.advance(1000);
    harness.workers[0].exitNow(1);
    await waitFor(() => harness.timers.length === 1);

    harness.signals();
    await harness.runPromise;

    assert.equal(harness.timers[0].cancelled, true);
    assert.deepEqual(harness.exits, [0]);
    assert.equal(harness.workers.length, 1, 'no worker spawns during a stop');
    assert.equal((await readWatchState(projectRoot, home)).service, null);
  });

  it('rotates watch.log before a spawn when it exceeds watch.logMaxBytes', async () => {
    const dir = await watchStateDir(projectRoot, home);
    await fs.mkdir(dir, { recursive: true });
    const previous = 'x'.repeat(200);
    await fs.writeFile(logPath, previous);
    await fs.writeFile(`${logPath}.1`, 'older');

    const harness = await setupHarness(projectRoot, home, {
      watch: { logMaxBytes: 100 },
      onSpawn: (spec) => {
        fsSync.writeFileSync(spec.logPath, 'fresh worker output');
      },
    });
    assert.equal(harness.workers.length, 1);

    assert.equal(await fs.readFile(`${logPath}.1`, 'utf8'), previous);
    assert.equal(await fs.readFile(logPath, 'utf8'), 'fresh worker output');
  });
});
