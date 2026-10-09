import assert from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { WatchConfig } from '../src/core/foundation/config-watch.js';
import { defineConfig } from '../src/core/foundation/config.js';
import {
  readServerRecord,
  readWatchState,
  watchStateDir,
  writeServerRecord,
  writeServiceRecord,
} from '../src/core/run/watch-state.js';
import { EXIT_NEW_BUILD } from '../src/watcher/service-build.js';
import {
  SERVER_ROLE_ENV,
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
  service?: 'watch' | 'server';
  watch?: Partial<WatchConfig>;
  entry?: string;
  execArgv?: readonly string[];
  forwardArgs?: readonly string[];
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
    service: options.service,
    home,
  };

  const runPromise = runServiceSupervisor(supervisorOptions, {
    spawnWorker: (spec) => {
      specs.push(spec);
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

describe('server service supervisor', () => {
  let base: string;
  let home: string;
  let projectRoot: string;
  let serverLog: string;
  let watchLog: string;

  beforeEach(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-server-supervisor-'));
    home = path.join(base, 'home');
    projectRoot = path.join(base, 'project');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(projectRoot, { recursive: true });
    const dir = await watchStateDir(projectRoot, home);
    serverLog = path.join(dir, 'server.log');
    watchLog = path.join(dir, 'watch.log');
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  it('spawns the server worker with `server start` and OSQ_SERVER_ROLE', async () => {
    const harness = await setupHarness(projectRoot, home, {
      service: 'server',
      entry: '/opt/osq/dist/cli/bin.js',
      execArgv: ['--import', 'tsx'],
      forwardArgs: ['--quiet'],
    });

    const spec = harness.specs[0];
    assert.equal(spec.command, process.execPath);
    assert.deepEqual(spec.args, ['--import', 'tsx', '/opt/osq/dist/cli/bin.js', 'server', 'start']);
    assert.equal(spec.env[SERVER_ROLE_ENV], 'worker');
    assert.equal(spec.env.PATH, process.env.PATH);
    assert.equal(spec.cwd, projectRoot);
    assert.equal(spec.logPath, serverLog);
  });

  it('restarts at once on a new build and logs to server.log', async () => {
    const harness = await setupHarness(projectRoot, home, { service: 'server' });

    harness.workers[0].exitNow(EXIT_NEW_BUILD);
    await waitFor(() => harness.workers.length === 2);

    assert.equal(harness.timers.length, 0, 'a new build must not wait');
    const log = await fs.readFile(serverLog, 'utf8');
    assert.match(log, /^[0-9T:.Z-]+ new osq build; restarting the server$/m);
  });

  it('backs off after a crash and logs the server line', async () => {
    const harness = await setupHarness(projectRoot, home, {
      service: 'server',
      watch: { restartDelaySeconds: 5, restartMaxDelaySeconds: 15 },
    });

    harness.workers[0].exitNow(1);
    await waitFor(() => harness.timers.length === 1);
    assert.deepEqual(harness.delays, [5000]);

    const log = await fs.readFile(serverLog, 'utf8');
    assert.match(log, /server exited with 1; restarting in 5s/);
  });

  it('sends SIGINT to a running worker, removes server.json, and leaves service.json', async () => {
    await writeServerRecord(
      projectRoot,
      {
        pid: process.pid,
        startedAt: '2026-10-09T00:00:00.000Z',
        log: serverLog,
        url: 'http://127.0.0.1:4174/p/osq/',
      },
      home,
    );
    await writeServiceRecord(
      projectRoot,
      { pid: process.pid, startedAt: '2026-10-09T00:00:00.000Z', log: watchLog },
      home,
    );
    const harness = await setupHarness(projectRoot, home, { service: 'server' });

    harness.signals();
    assert.deepEqual(harness.workers[0].signals, ['SIGINT']);
    assert.equal(harness.workers.length, 1, 'no new worker before the running one exits');

    harness.workers[0].exitNow(0);
    await harness.runPromise;

    assert.deepEqual(harness.exits, [0]);
    assert.equal(harness.workers.length, 1);
    assert.equal(await readServerRecord(projectRoot, home), null);
    assert.equal((await readWatchState(projectRoot, home)).service?.pid, process.pid);
  });

  it('cancels a pending restart on a stop signal and exits 0', async () => {
    await writeServerRecord(
      projectRoot,
      {
        pid: process.pid,
        startedAt: '2026-10-09T00:00:00.000Z',
        log: serverLog,
        url: 'http://127.0.0.1:4174/p/osq/',
      },
      home,
    );
    const harness = await setupHarness(projectRoot, home, {
      service: 'server',
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
    assert.equal(await readServerRecord(projectRoot, home), null);
  });

  it('runs the watch service unchanged without a service option', async () => {
    const harness = await setupHarness(projectRoot, home, {
      entry: '/opt/osq/dist/cli/bin.js',
      execArgv: ['--import', 'tsx'],
      forwardArgs: ['--quiet'],
    });

    const spec = harness.specs[0];
    assert.deepEqual(spec.args, [
      '--import',
      'tsx',
      '/opt/osq/dist/cli/bin.js',
      'watch',
      '--quiet',
    ]);
    assert.equal(spec.env[WATCH_ROLE_ENV], 'worker');
    assert.equal(spec.env[SERVER_ROLE_ENV], undefined);
    assert.equal(spec.logPath, watchLog);
  });
});
