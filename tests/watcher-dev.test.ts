import assert from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type WatchCommandOptions, shouldRunDevSupervisor } from '../src/cli/watch.js';
import {
  DEV_WORKER_ENV,
  type DevWorkerSpec,
  EXIT_SIGINT,
  buildWorkerInvocation,
  runDevSupervisor,
} from '../src/watcher/dev.js';

/** Minimal ChildProcess stand-in: kill records the signal, exit emits the event. */
class FakeWorker extends EventEmitter {
  readonly signals: string[] = [];

  kill(signal?: NodeJS.Signals | number): boolean {
    this.signals.push(String(signal));
    return true;
  }

  exitNow(code = 0): void {
    this.emit('exit', code, null);
  }
}

interface Harness {
  workers: FakeWorker[];
  specs: DevWorkerSpec[];
  watchedDirs: string[];
  exits: number[];
  errors: string[];
  closes: () => number;
  change: () => void;
  signal: () => void;
  runPromise: Promise<void>;
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('condition was not met in time');
}

async function setupHarness(
  packageRoot: string,
  options: WatchCommandOptions = {},
): Promise<Harness> {
  const workers: FakeWorker[] = [];
  const specs: DevWorkerSpec[] = [];
  const watchedDirs: string[] = [];
  const exits: number[] = [];
  const errors: string[] = [];
  let closeCount = 0;
  let change: () => void = () => {};
  let signal: () => void = () => {};

  const runPromise = runDevSupervisor(options, {
    packageRoot,
    spawnWorker: (spec) => {
      specs.push(spec);
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as ChildProcess;
    },
    watchSource: (sourceDir, onChange) => {
      watchedDirs.push(sourceDir);
      change = onChange;
      return {
        close: () => {
          closeCount++;
        },
      };
    },
    onSignal: (handler) => {
      signal = handler;
      return () => {};
    },
    exit: (code) => {
      exits.push(code);
    },
    logError: (message) => {
      errors.push(message);
    },
  });

  const harness: Harness = {
    workers,
    specs,
    watchedDirs,
    exits,
    errors,
    closes: () => closeCount,
    change: () => change(),
    signal: () => signal(),
    runPromise,
  };

  await waitFor(() => workers.length > 0 || exits.length > 0);
  return harness;
}

describe('Watcher dev mode', () => {
  let tmpDir: string;
  let packageRoot: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-watcher-dev-'));
    packageRoot = path.join(tmpDir, 'package');
    await fs.mkdir(path.join(packageRoot, 'src', 'cli'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('builds a worker invocation that runs tsx from src/cli/bin.ts', () => {
    const spec = buildWorkerInvocation(
      { once: true, verbose: true, allowStale: true, dev: true },
      packageRoot,
    );

    assert.equal(spec.command, process.execPath);
    assert.deepEqual(spec.args.slice(0, 5), [
      '--import',
      'tsx',
      path.join(packageRoot, 'src', 'cli', 'bin.ts'),
      'watch',
      '--once',
    ]);
    assert.ok(spec.args.includes('--verbose'));
    assert.ok(spec.args.includes('--allow-stale'));
    assert.ok(!spec.args.includes('--dev'), 'the worker must not re-enter the dev supervisor');
    assert.equal(spec.env[DEV_WORKER_ENV], '1');
  });

  it('delegates to the supervisor only in dev mode outside the worker process', () => {
    assert.equal(shouldRunDevSupervisor({ dev: true }, {}), true);
    assert.equal(shouldRunDevSupervisor({ dev: true }, { OSQ_DEV_WORKER: '1' }), false);
    assert.equal(shouldRunDevSupervisor({}, {}), false);
  });

  it('spawns a tsx worker and watches src/ for changes', async () => {
    const harness = await setupHarness(packageRoot, { quiet: true });

    assert.equal(harness.workers.length, 1);
    assert.equal(harness.specs.length, 1);
    assert.deepEqual(harness.watchedDirs, [path.join(packageRoot, 'src')]);
    assert.ok(harness.specs[0].args.includes('tsx'));
    assert.ok(harness.specs[0].args.includes('--quiet'));
  });

  it('waits for the running task to finish before restarting on a source change', async () => {
    const harness = await setupHarness(packageRoot);

    harness.change();

    assert.deepEqual(harness.workers[0].signals, ['SIGINT'], 'change must ask the worker to stop');
    assert.equal(harness.specs.length, 1, 'no restart before the active worker exits');

    // The worker's own SIGINT handler finishes the running task and only then
    // exits; the supervisor restarts with fresh code once that happens.
    harness.workers[0].exitNow(0);
    await waitFor(() => harness.workers.length === 2);

    assert.equal(harness.specs.length, 2, 'a fresh worker loads the updated source');
    assert.equal(harness.closes(), 0, 'supervisor keeps watching across restarts');
  });

  it('coalesces repeated source changes into a single pending restart', async () => {
    const harness = await setupHarness(packageRoot);

    harness.change();
    harness.change();
    harness.change();

    assert.equal(harness.workers[0].signals.length, 1);

    harness.workers[0].exitNow(0);
    await waitFor(() => harness.workers.length === 2);
    assert.equal(harness.workers.length, 2);
  });

  it('terminates the worker on SIGINT and never restarts', async () => {
    const harness = await setupHarness(packageRoot);

    harness.signal();

    assert.deepEqual(harness.workers[0].signals, ['SIGINT']);
    harness.workers[0].exitNow(0);
    await harness.runPromise;

    assert.deepEqual(harness.exits, [EXIT_SIGINT]);
    assert.equal(harness.workers.length, 1, 'a user interrupt must not spawn a new worker');
    assert.equal(harness.closes(), 1);
  });

  it('exits non-zero when there is no src/ checkout to run', async () => {
    const root = path.join(tmpDir, 'installed');
    await fs.mkdir(root);
    const exits: number[] = [];
    const errors: string[] = [];

    await runDevSupervisor(
      {},
      {
        packageRoot: root,
        exit: (code) => {
          exits.push(code);
        },
        logError: (message) => {
          errors.push(message);
        },
        onSignal: () => () => {},
      },
    );

    assert.deepEqual(exits, [1]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /src\//);
  });
});
