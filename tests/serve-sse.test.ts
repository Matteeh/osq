import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type FSWatcher, watch as chokidarWatch } from 'chokidar';
import { defineConfig } from '../src/core/foundation/config.js';
import { getArchiveDir, getChangesDir, getRejectedDir } from '../src/core/status/layout.js';
import {
  type InvalidationBatch,
  type ScheduleFn,
  type TimerHandle,
  type WatchOptions,
  type WatcherFactory,
  type WatcherLike,
  classifyChangePath,
  createInvalidationHub,
  formatChangedEvent,
} from '../src/core/web/web-events.js';
import {
  type WebServerHandle,
  type WebServerOptions,
  startWebServer,
} from '../src/core/web/web-server.js';
import { buildWebFixture } from './fixtures/web/build.js';

let tmpDir: string;
let uiDir: string;
let homeDir: string;
let now: Date;
const handles: WebServerHandle[] = [];

const EPHEMERAL = defineConfig({ serve: { port: 0 } });

/** A chokidar-shaped watcher whose events and close calls the test controls. */
class FakeWatcher implements WatcherLike {
  closeCalls = 0;
  closed = false;
  private readonly listeners = new Map<string, Set<(target: string) => void>>();

  on(event: string, listener: (target: string) => void): unknown {
    const set = this.listeners.get(event) ?? new Set<(target: string) => void>();
    set.add(listener);
    this.listeners.set(event, set);
    return undefined;
  }

  emit(event: string, target: string): void {
    for (const listener of this.listeners.get(event) ?? []) listener(target);
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    this.closed = true;
  }
}

interface ScheduledTimer {
  callback: () => void;
  delayMs: number;
  cancelled: boolean;
  fired: boolean;
}

/** Manual debounce clock: nothing fires until the test calls `fire`. */
class ManualScheduler {
  readonly timers: ScheduledTimer[] = [];

  schedule: ScheduleFn = (callback, delayMs) => {
    const timer: ScheduledTimer = { callback, delayMs, cancelled: false, fired: false };
    this.timers.push(timer);
    return {
      cancel: () => {
        timer.cancelled = true;
      },
    } satisfies TimerHandle;
  };

  get pending(): ScheduledTimer[] {
    return this.timers.filter((timer) => !timer.cancelled && !timer.fired);
  }

  fire(): void {
    const timer = this.pending[0];
    if (!timer) throw new Error('no pending debounce timer to fire');
    timer.fired = true;
    timer.callback();
  }
}

interface WatcherCall {
  paths: string[];
  options: WatchOptions;
}

function fakeWatcherFactory(watcher: FakeWatcher): {
  factory: WatcherFactory;
  calls: WatcherCall[];
} {
  const calls: WatcherCall[] = [];
  const factory: WatcherFactory = (paths, options) => {
    calls.push({ paths: [...paths], options });
    return watcher;
  };
  return { factory, calls };
}

function changePath(...segments: string[]): string {
  return path.join(tmpDir, 'openspec', ...segments);
}

function createHub(
  watcher: FakeWatcher,
  scheduler: ManualScheduler,
): ReturnType<typeof createInvalidationHub> {
  const { factory } = fakeWatcherFactory(watcher);
  return createInvalidationHub({
    projectRoot: tmpDir,
    openspecRoot: 'openspec',
    debounceMs: 100,
    watch: factory,
    schedule: scheduler.schedule,
  });
}

async function startServer(overrides: Partial<WebServerOptions> = {}): Promise<WebServerHandle> {
  const handle = await startWebServer({
    projectRoot: tmpDir,
    config: EPHEMERAL,
    uiDir,
    home: homeDir,
    now: () => now,
    ...overrides,
  });
  handles.push(handle);
  return handle;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PendingWaiter {
  resolve: (frame: string) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/** Minimal SSE client that buffers frames and resolves one at a time. */
class SseConnection {
  status = 0;
  headers: http.IncomingHttpHeaders = {};
  ended = false;
  readonly ready: Promise<void>;
  readonly closed: Promise<void>;
  private readonly frames: string[] = [];
  private readonly waiters: PendingWaiter[] = [];
  private buffer = '';
  private readyResolve!: () => void;
  private endResolve!: () => void;
  private readonly request: http.ClientRequest;

  constructor(port: number) {
    this.ready = new Promise<void>((resolve) => {
      this.readyResolve = resolve;
    });
    this.closed = new Promise<void>((resolve) => {
      this.endResolve = resolve;
    });
    this.request = http.get(
      { host: '127.0.0.1', port, path: '/api/events', agent: false },
      (res) => {
        this.status = res.statusCode ?? 0;
        this.headers = res.headers;
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => this.ingest(chunk));
        res.on('end', () => this.finish());
        res.on('close', () => this.finish());
        this.readyResolve();
      },
    );
    this.request.on('error', () => this.finish());
  }

  private ingest(chunk: string): void {
    this.buffer += chunk;
    let index = this.buffer.indexOf('\n\n');
    while (index !== -1) {
      const frame = this.buffer.slice(0, index + 2);
      this.buffer = this.buffer.slice(index + 2);
      const waiter = this.waiters.shift();
      if (waiter) {
        clearTimeout(waiter.timer);
        waiter.resolve(frame);
      } else {
        this.frames.push(frame);
      }
      index = this.buffer.indexOf('\n\n');
    }
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.endResolve();
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('SSE stream ended'));
    }
  }

  nextFrame(timeoutMs = 3000): Promise<string> {
    const buffered = this.frames.shift();
    if (buffered !== undefined) return Promise.resolve(buffered);
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex((waiter) => waiter.timer === timer);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error('timed out waiting for SSE frame'));
      }, timeoutMs);
      this.waiters.push({ resolve, reject, timer });
    });
  }

  destroy(): void {
    this.request.destroy();
    this.finish();
  }
}

function parseIds(frame: string): number[] {
  const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
  if (!dataLine) throw new Error(`frame has no data line: ${JSON.stringify(frame)}`);
  const payload = JSON.parse(dataLine.slice('data: '.length)) as { ids: number[] };
  return payload.ids;
}

async function waitForIds(
  connection: SseConnection,
  expected: number[],
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`timed out waiting for ids ${JSON.stringify(expected)}`);
    }
    const frame = await connection.nextFrame(remaining);
    if (JSON.stringify(parseIds(frame)) === JSON.stringify(expected)) return frame;
  }
}

async function reserveFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as net.AddressInfo;
      server.close(() => resolve(address.port));
    });
  });
}

async function closeBlocker(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-sse-'));
  uiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-sse-ui-'));
  homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-sse-home-'));
  now = new Date('2026-06-01T00:00:00.000Z');
  await buildWebFixture(tmpDir);
});

afterEach(async () => {
  while (handles.length > 0) {
    const handle = handles.pop();
    if (handle) await handle.close();
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.rm(uiDir, { recursive: true, force: true });
  await fs.rm(homeDir, { recursive: true, force: true });
});

describe('invalidation hub ownership and batching', () => {
  it('creates one watcher for the configured root and closes it idempotently', async () => {
    const watcher = new FakeWatcher();
    const { factory, calls } = fakeWatcherFactory(watcher);
    const scheduler = new ManualScheduler();
    const hub = createInvalidationHub({
      projectRoot: tmpDir,
      openspecRoot: 'openspec',
      debounceMs: 100,
      watch: factory,
      schedule: scheduler.schedule,
    });

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].paths, [path.join(tmpDir, 'openspec')]);
    assert.equal(calls[0].options.ignoreInitial, true);

    const offA = hub.subscribe(() => undefined);
    const offB = hub.subscribe(() => undefined);
    assert.equal(calls.length, 1, 'subscribing must not create a watcher');
    offA();
    offB();
    watcher.emit('add', changePath('changes', '010-active-change', 'brief.md'));
    assert.equal(calls.length, 1, 'emitting must not create a watcher');

    await hub.close();
    await hub.close();
    assert.equal(watcher.closeCalls, 1);
    assert.equal(watcher.closed, true);
  });

  it('classifies change paths by location and treats shared paths as global', () => {
    const changesDir = path.resolve(getChangesDir('openspec', tmpDir));
    const archiveDir = path.resolve(getArchiveDir('openspec', tmpDir));
    const rejectedDir = path.resolve(getRejectedDir('openspec', tmpDir));
    const classify = (target: string): number | null =>
      classifyChangePath(path.resolve(target), changesDir, archiveDir, rejectedDir);

    assert.equal(classify(changePath('changes', '010-active-change', 'brief.md')), 10);
    assert.equal(classify(changePath('changes', '010-active-change', '.run', 'done', '1')), 10);
    assert.equal(classify(changePath('changes', 'archive', '003-archived', 'tasks', '1.md')), 3);
    assert.equal(classify(changePath('changes', 'rejected', '002-rejected', 'proposal.md')), 2);
    assert.equal(classify(changePath('changes', 'archive', 'readme.md')), null);
    assert.equal(classify(changePath('changes', 'notes.md')), null);
    assert.equal(classify(changePath('specs', 'alpha', 'spec.md')), null);
    assert.equal(classify(changePath('queue.md')), null);
    assert.equal(classify(path.join(tmpDir, 'openspec')), null);
  });

  it('accumulates one debounced batch with sorted unique numeric ids', () => {
    const watcher = new FakeWatcher();
    const scheduler = new ManualScheduler();
    const hub = createHub(watcher, scheduler);
    const batches: InvalidationBatch[] = [];
    hub.subscribe((batch) => batches.push(batch));

    watcher.emit('change', changePath('changes', '010-active-change', 'brief.md'));
    watcher.emit('add', changePath('changes', '010-active-change', '.run', 'done', '1'));
    watcher.emit(
      'change',
      changePath('changes', 'archive', '003-archived-unique', 'tasks', '1.md'),
    );
    watcher.emit('change', changePath('changes', 'rejected', '002-rejected-change', 'proposal.md'));

    assert.deepEqual(batches, [], 'no frame before the debounce interval');
    assert.equal(scheduler.pending.length, 1);
    assert.equal(scheduler.pending[0].delayMs, 100);

    scheduler.fire();
    assert.deepEqual(batches, [{ ids: [2, 3, 10] }]);
    assert.equal(scheduler.pending.length, 0);
  });

  it('uses an empty id list for shared documents and when any path is global', () => {
    const watcher = new FakeWatcher();
    const scheduler = new ManualScheduler();
    const hub = createHub(watcher, scheduler);
    const batches: InvalidationBatch[] = [];
    hub.subscribe((batch) => batches.push(batch));

    watcher.emit('change', changePath('specs', 'alpha', 'spec.md'));
    watcher.emit('add', changePath('queue.md'));
    scheduler.fire();
    assert.deepEqual(batches, [{ ids: [] }]);

    watcher.emit('change', changePath('changes', '010-active-change', 'brief.md'));
    watcher.emit('change', changePath('specs', 'beta', 'spec.md'));
    scheduler.fire();
    assert.deepEqual(batches, [{ ids: [] }, { ids: [] }]);
  });

  it('starts a new debounce window and clears pending state on cancel and close', async () => {
    const watcher = new FakeWatcher();
    const scheduler = new ManualScheduler();
    const hub = createHub(watcher, scheduler);
    const batches: InvalidationBatch[] = [];
    hub.subscribe((batch) => batches.push(batch));

    watcher.emit('change', changePath('changes', '010-active-change', 'brief.md'));
    assert.equal(scheduler.pending.length, 1);
    hub.cancelPending();
    assert.equal(scheduler.pending.length, 0);
    scheduler.timers[0].callback();
    assert.deepEqual(batches, []);

    watcher.emit('change', changePath('changes', '011-other-change', 'brief.md'));
    scheduler.fire();
    assert.deepEqual(batches, [{ ids: [11] }]);

    watcher.emit('change', changePath('changes', '012-later-change', 'brief.md'));
    const delayed = scheduler.pending[0];
    assert.ok(delayed);
    await hub.close();
    watcher.emit('change', changePath('changes', '013-after-close', 'brief.md'));
    assert.equal(scheduler.pending.length, 0, 'events after close must not schedule');
    delayed.callback();
    assert.deepEqual(batches, [{ ids: [11] }], 'no delayed frame after close');
  });
});

describe('events HTTP transport', () => {
  it('serves a keep-open framed stream with no-store headers and no CORS', async () => {
    const watcher = new FakeWatcher();
    const scheduler = new ManualScheduler();
    const { factory } = fakeWatcherFactory(watcher);
    const handle = await startServer({ watch: factory, schedule: scheduler.schedule });

    const connection = new SseConnection(handle.port);
    await connection.ready;
    assert.equal(connection.status, 200);
    assert.equal(connection.headers['content-type'], 'text/event-stream; charset=utf-8');
    assert.equal(connection.headers['cache-control'], 'no-store');
    assert.equal(connection.headers['content-length'], undefined);
    assert.equal(connection.headers['access-control-allow-origin'], undefined);

    await delay(20);
    assert.equal(connection.ended, false, 'stream stays open without an initial snapshot');

    watcher.emit('change', changePath('changes', '010-active-change', 'brief.md'));
    assert.equal(scheduler.pending.length, 1);
    scheduler.fire();
    const frame = await connection.nextFrame();
    assert.equal(frame, 'event: changed\ndata: {"ids":[10]}\n\n');
    assert.equal(frame, formatChangedEvent([10]));
    assert.deepEqual(parseIds(frame), [10]);
    connection.destroy();
  });

  it('answers HEAD with matching headers and no stream or body', async () => {
    const watcher = new FakeWatcher();
    const scheduler = new ManualScheduler();
    const { factory, calls } = fakeWatcherFactory(watcher);
    const handle = await startServer({ watch: factory, schedule: scheduler.schedule });

    const get = new SseConnection(handle.port);
    await get.ready;
    const head = await fetch(new URL('api/events', handle.url), { method: 'HEAD' });

    assert.equal(head.status, get.status);
    assert.equal(head.headers.get('content-type'), get.headers['content-type']);
    assert.equal(head.headers.get('cache-control'), get.headers['cache-control']);
    assert.equal(head.headers.get('content-length'), null);
    assert.equal(head.headers.get('access-control-allow-origin'), null);
    assert.equal(await head.text(), '');

    assert.equal(calls.length, 1);
    get.destroy();
  });

  it('fans one batch out to every client and cleans up disconnects idempotently', async () => {
    const watcher = new FakeWatcher();
    const scheduler = new ManualScheduler();
    const { factory, calls } = fakeWatcherFactory(watcher);
    const handle = await startServer({ watch: factory, schedule: scheduler.schedule });

    const first = new SseConnection(handle.port);
    const second = new SseConnection(handle.port);
    await first.ready;
    await second.ready;

    first.destroy();
    await delay(20);

    watcher.emit('change', changePath('changes', '010-active-change', 'brief.md'));
    scheduler.fire();
    assert.equal(await second.nextFrame(), formatChangedEvent([10]));

    first.destroy();
    second.destroy();
    assert.equal(calls.length, 1, 'connecting and disconnecting never adds a watcher');

    await handle.close();
    await handle.close();
    assert.equal(watcher.closeCalls, 1);
  });

  it('clears the timer, ends clients, closes the watcher, then the listener', async () => {
    const order: string[] = [];
    const watcher = new FakeWatcher();
    const baseClose = watcher.close.bind(watcher);
    watcher.close = async (): Promise<void> => {
      order.push('watcher');
      await baseClose();
    };
    const scheduler = new ManualScheduler();
    const schedule: ScheduleFn = (callback, delayMs) => {
      const timer = scheduler.schedule(callback, delayMs);
      const baseCancel = timer.cancel.bind(timer);
      return {
        cancel: () => {
          order.push('timer');
          baseCancel();
        },
      };
    };
    const { factory } = fakeWatcherFactory(watcher);
    const handle = await startServer({ watch: factory, schedule });

    const connection = new SseConnection(handle.port);
    await connection.ready;
    watcher.emit('change', changePath('changes', '010-active-change', 'brief.md'));
    const delayed = scheduler.pending[0];
    assert.ok(delayed);

    await handle.close();
    assert.deepEqual(order.slice(0, 2), ['timer', 'watcher']);
    assert.equal(watcher.closeCalls, 1);
    await connection.closed;
    assert.equal(connection.ended, true);
    await assert.rejects(() => fetch(new URL('api/report', handle.url)));

    delayed.callback();
    await delay(10);
    assert.deepEqual(connection.headers['content-type'], 'text/event-stream; charset=utf-8');
    assert.equal(connection.ended, true, 'no delayed write after shutdown');

    await handle.close();
    assert.equal(watcher.closeCalls, 1);
  });

  it('closes every created resource when watcher initialization fails', async () => {
    const port = await reserveFreePort();
    const factory: WatcherFactory = () => {
      throw new Error('watcher boom');
    };
    await assert.rejects(() => startServer({ port, watch: factory }), /watcher boom/);

    const blocker = http.createServer();
    await new Promise<void>((resolve) => blocker.listen(port, '127.0.0.1', () => resolve()));
    await closeBlocker(blocker);
  });

  it('closes the watcher and rejects once when HTTP startup fails', async () => {
    const port = await reserveFreePort();
    const blocker = http.createServer();
    await new Promise<void>((resolve) => blocker.listen(port, '127.0.0.1', () => resolve()));

    const watcher = new FakeWatcher();
    const scheduler = new ManualScheduler();
    const { factory } = fakeWatcherFactory(watcher);
    await assert.rejects(
      () => startServer({ port, watch: factory, schedule: scheduler.schedule }),
      /EADDRINUSE|address already in use/i,
    );
    assert.equal(watcher.closeCalls, 1);

    await closeBlocker(blocker);
  });
});

describe('real chokidar invalidation', () => {
  it(
    'debounces change writes and emits one event for capability refresh',
    { timeout: 20000 },
    async () => {
      let realWatcher: FSWatcher | null = null;
      let resolveReady: () => void = () => {};
      const ready = new Promise<void>((resolve) => {
        resolveReady = resolve;
      });
      const watch: WatcherFactory = (paths, options) => {
        realWatcher = chokidarWatch([...paths], { ignoreInitial: options.ignoreInitial });
        realWatcher.once('ready', () => resolveReady());
        const emitter = realWatcher as unknown as {
          on(event: string, listener: (target: string) => void): unknown;
          close(): Promise<void>;
        };
        return {
          on: (event, listener) => emitter.on(event, listener),
          close: () => (realWatcher as FSWatcher).close(),
        };
      };
      const handle = await startServer({
        config: defineConfig({ serve: { port: 0, eventDebounceMs: 250 } }),
        watch,
      });

      const connection = new SseConnection(handle.port);
      await connection.ready;
      await ready;

      const changeDir = changePath('changes', '010-active-change');
      await Promise.all([
        fs.writeFile(path.join(changeDir, 'debounce-a.txt'), 'a'),
        fs.writeFile(path.join(changeDir, 'debounce-b.txt'), 'b'),
        fs.writeFile(path.join(changeDir, 'debounce-c.txt'), 'c'),
      ]);
      const first = await waitForIds(connection, [10], 8000);
      assert.equal(first, formatChangedEvent([10]));

      await fs.writeFile(
        changePath('specs', 'alpha', 'spec.md'),
        '# alpha Specification\nchanged\n',
      );
      const second = await waitForIds(connection, [], 8000);
      assert.equal(second, formatChangedEvent([]));

      connection.destroy();
    },
  );
});
