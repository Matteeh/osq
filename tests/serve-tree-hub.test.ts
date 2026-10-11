import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { scenario } from '@matteeh/osq/testing';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import type { ChangeTree } from '../src/core/status/change-locations.js';
import type { EveryFn, TreesFn } from '../src/core/status/dispatch-watch.js';
import type {
  ScheduleFn,
  TimerHandle,
  WatchOptions,
  WatcherFactory,
  WatcherLike,
} from '../src/core/web/web-events.js';
import { type WebServerHandle, startWebServer } from '../src/core/web/web-server.js';
import { createTreeHub } from '../src/core/web/web-tree-hub.js';

const execFileAsync = promisify(execFile);
const AUTHOR = 'Osq Author <author@example.invalid>';

const tmpDirs: string[] = [];
const handles: WebServerHandle[] = [];

/** Close every started server, then remove every temporary directory. */
async function cleanup(): Promise<void> {
  while (handles.length > 0) {
    const handle = handles.pop();
    if (handle) await handle.close();
  }
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

after(cleanup);

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** Ignore the redirecting variables, like osq's own git reads. */
function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) {
    Reflect.deleteProperty(env, key);
  }
  return env;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, env: cleanGitEnv() });
  return stdout.trim();
}

/** A temporary repository with a local identity and one commit. */
async function makeRepo(prefix: string): Promise<string> {
  const parent = await makeTempDir(prefix);
  const repo = path.join(parent, 'repo');
  await fs.mkdir(repo);
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await fs.writeFile(path.join(repo, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'init'], repo);
  return repo;
}

function vcsConfig(): OsqConfig {
  return defineConfig({
    vcs: { enabled: true, author: AUTHOR },
    serve: { port: 0 },
  });
}

function plainConfig(): OsqConfig {
  return defineConfig({ serve: { port: 0 } });
}

/** A `ChangeTree` shaped like `changeTrees` returns, without touching git. */
function checkoutTree(root: string): ChangeTree {
  const changesDir = path.join(root, 'openspec', 'changes');
  return {
    root,
    changesDir,
    archiveDir: path.join(changesDir, 'archive'),
    rejectedDir: path.join(changesDir, 'rejected'),
  };
}

/** The worktree tree of one change folder, with its change to watch. */
function worktreeTree(root: string, folder: string): ChangeTree {
  return { ...checkoutTree(root), worktreeFolder: folder };
}

/** The `trees` seam fed from a fixed sequence, so later calls differ. */
class ManualTrees {
  private nextCall = 0;
  private readonly sequence: readonly (readonly ChangeTree[])[];

  constructor(...sequence: readonly (readonly ChangeTree[])[]) {
    this.sequence = sequence;
  }

  readonly fn: TreesFn = async (_projectRoot, _config) => {
    const index = Math.min(this.nextCall, this.sequence.length - 1);
    this.nextCall += 1;
    return this.sequence[index] ?? [];
  };

  get calls(): number {
    return this.nextCall;
  }
}

/** A chokidar-shaped watcher whose events and close calls the test controls. */
class FakeWatcher implements WatcherLike {
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
    this.closed = true;
  }
}

interface WatchRecord {
  readonly watcher: FakeWatcher;
  readonly paths: readonly string[];
  readonly options: WatchOptions;
}

/** A factory that hands each hub its own fake watcher and records the calls. */
function watchFactory(): { factory: WatcherFactory; records: WatchRecord[] } {
  const records: WatchRecord[] = [];
  const factory: WatcherFactory = (paths, options) => {
    const watcher = new FakeWatcher();
    records.push({ watcher, paths: [...paths], options });
    return watcher;
  };
  return { factory, records };
}

/** Manual debounce clock: nothing fires until the test calls `fire`. */
class ManualScheduler {
  private callback: (() => void) | null = null;

  readonly schedule: ScheduleFn = (callback) => {
    this.callback = callback;
    return {
      cancel: () => {
        this.callback = null;
      },
    } satisfies TimerHandle;
  };

  fire(): void {
    const callback = this.callback;
    this.callback = null;
    callback?.();
  }
}

/** Manual poll clock: nothing fires until the test calls `fire`. */
class ManualEvery {
  cancelled = false;
  private callback: (() => void) | null = null;

  readonly every: EveryFn = (callback) => {
    this.callback = callback;
    return {
      cancel: () => {
        this.cancelled = true;
      },
    };
  };

  fire(): void {
    if (this.callback === null) throw new Error('no poll callback to fire');
    this.callback();
  }
}

interface Harness {
  readonly handle: WebServerHandle;
  readonly records: WatchRecord[];
  readonly scheduler: ManualScheduler;
  readonly every: ManualEvery;
  readonly trees: ManualTrees;
}

/** Start `startWebServer` over fake watcher, manual debounce, poll and trees. */
async function startHarness(root: string, config: OsqConfig, trees: ManualTrees): Promise<Harness> {
  const { factory, records } = watchFactory();
  const scheduler = new ManualScheduler();
  const every = new ManualEvery();
  const uiDir = await makeTempDir('osq-tree-hub-ui-');
  const homeDir = await makeTempDir('osq-tree-hub-home-');
  const handle = await startWebServer({
    projectRoot: root,
    config,
    uiDir,
    home: homeDir,
    watch: factory,
    schedule: scheduler.schedule,
    every: every.every,
    trees: trees.fn,
  });
  handles.push(handle);
  return { handle, records, scheduler, every, trees };
}

/** Yield to the event loop until `predicate` holds, without a real timer. */
async function settle(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 400000; i += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('condition was never met');
}

/** The paths the first watcher was given, after the server starts and closes. */
async function serverRecordPaths(root: string, config: OsqConfig): Promise<string[]> {
  const trees = new ManualTrees([checkoutTree(root)]);
  const h = await startHarness(root, config, trees);
  const paths = [...(h.records[0]?.paths ?? [])];
  await h.handle.close();
  return paths;
}

/** Emit one record write and collect the client's frame and watcher count. */
async function recordChangeFrames(
  root: string,
  config: OsqConfig,
): Promise<{ frames: number[][]; watchers: number }> {
  const trees = new ManualTrees([checkoutTree(root)]);
  const h = await startHarness(root, config, trees);
  const client = new SseConnection(h.handle.port);
  await client.ready;
  h.records[0]?.watcher.emit('change', path.join(root, '.git', 'osq-trees.jsonl'));
  h.scheduler.fire();
  const frame = await client.nextFrame();
  await settle(() => trees.calls >= 2);
  client.destroy();
  return { frames: [parseIds(frame)], watchers: h.records.length };
}

/** Have the trees seam grow a worktree after the first batch, then read frames. */
async function newWorktreeFrames(
  root: string,
  config: OsqConfig,
): Promise<{
  frames: number[][];
  watchers: number;
  watcherPaths: readonly string[];
  firstClosed: boolean;
}> {
  const trees = new ManualTrees(
    [checkoutTree(root)],
    [checkoutTree(root), worktreeTree(root, '001-a')],
  );
  const h = await startHarness(root, config, trees);
  const client = new SseConnection(h.handle.port);
  await client.ready;
  h.records[0]?.watcher.emit('change', path.join(root, 'openspec', 'changes', '001-a', 'brief.md'));
  h.scheduler.fire();
  const first = await client.nextFrame();
  const second = await client.nextFrame();
  client.destroy();
  return {
    frames: [parseIds(first), parseIds(second)],
    watchers: h.records.length,
    watcherPaths: h.records[1]?.paths ?? [],
    firstClosed: h.records[0]?.watcher.closed ?? false,
  };
}

/** Fire the poll and read the frame the swap sends, plus the watcher count. */
async function pollNewWorktreeFrames(
  root: string,
  config: OsqConfig,
): Promise<{ frames: number[][]; watchers: number; watcherPaths: readonly string[] }> {
  const trees = new ManualTrees(
    [checkoutTree(root)],
    [checkoutTree(root), worktreeTree(root, '001-a')],
  );
  const h = await startHarness(root, config, trees);
  const client = new SseConnection(h.handle.port);
  await client.ready;
  h.every.fire();
  const frame = await client.nextFrame();
  client.destroy();
  return {
    frames: [parseIds(frame)],
    watchers: h.records.length,
    watcherPaths: h.records[1]?.paths ?? [],
  };
}

/** Close the server and report whether the poll was cancelled and the watcher closed. */
async function closeServerPoll(
  root: string,
  config: OsqConfig,
): Promise<{ pollCancelled: boolean; watcherClosed: boolean }> {
  const trees = new ManualTrees([checkoutTree(root)]);
  const h = await startHarness(root, config, trees);
  await h.handle.close();
  return {
    pollCancelled: h.every.cancelled,
    watcherClosed: h.records[0]?.watcher.closed ?? false,
  };
}

interface PendingWaiter {
  resolve: (frame: string) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/** Minimal SSE client that buffers frames and resolves one at a time. */
class SseConnection {
  readonly ready: Promise<void>;
  private readonly frames: string[] = [];
  private readonly waiters: PendingWaiter[] = [];
  private buffer = '';
  private readyResolve!: () => void;
  private readonly request: http.ClientRequest;

  constructor(port: number) {
    this.ready = new Promise<void>((resolve) => {
      this.readyResolve = resolve;
    });
    this.request = http.get(
      { host: '127.0.0.1', port, path: '/api/events', agent: false },
      (res) => {
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => this.ingest(chunk));
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

describe('tree hub server wiring', () => {
  scenario(
    'web-inspection',
    "Tree record in the server's watch",
    { covers: (root: string, config: OsqConfig) => serverRecordPaths(root, config) },
    async ({ run, then }) => {
      const root = await makeRepo('osq-tree-hub-record-watch-');
      const paths = await run(root, vcsConfig());
      await then(
        "the hub's watcher is given `<checkout>/.git/osq-trees.jsonl` among its paths",
        () => {
          assert.ok(
            paths.includes(path.join(root, '.git', 'osq-trees.jsonl')),
            `watcher paths ${paths.join(', ')} do not include the tree record`,
          );
        },
      );
    },
  );

  scenario(
    'web-inspection',
    'Tree record change',
    { covers: (root: string, config: OsqConfig) => recordChangeFrames(root, config) },
    async ({ run, then }) => {
      const root = await makeRepo('osq-tree-hub-record-change-');
      const result = await run(root, vcsConfig());
      await then(
        'connected clients receive one changed event with ids `[]` and the watcher is not replaced',
        () => {
          assert.deepEqual(
            result.frames,
            [[]],
            `unexpected frames ${JSON.stringify(result.frames)}`,
          );
          assert.equal(result.watchers, 1, 'the watcher was replaced');
        },
      );
    },
  );

  scenario(
    'web-inspection',
    'New worktree while serving',
    { covers: (root: string, config: OsqConfig) => newWorktreeFrames(root, config) },
    async ({ run, then }) => {
      const root = await makeRepo('osq-tree-hub-new-worktree-');
      const result = await run(root, plainConfig());
      await then(
        "a second watcher opens over the new paths, the first watcher closes, and connected clients receive a changed event with ids `[]` after the batch's own event",
        () => {
          assert.equal(result.watchers, 2, 'a second watcher did not open');
          assert.ok(
            result.watcherPaths.includes(path.join(root, 'openspec', 'changes', '001-a')),
            `second watcher paths ${result.watcherPaths.join(', ')} lack the worktree folder`,
          );
          assert.equal(result.firstClosed, true, 'the first watcher was not closed');
          assert.deepEqual(
            result.frames,
            [[1], []],
            `unexpected frames ${JSON.stringify(result.frames)}`,
          );
        },
      );
    },
  );

  scenario(
    'web-inspection',
    'Poll finds a new worktree',
    { covers: (root: string, config: OsqConfig) => pollNewWorktreeFrames(root, config) },
    async ({ run, then }) => {
      const root = await makeRepo('osq-tree-hub-poll-');
      const result = await run(root, plainConfig());
      await then(
        'a second watcher opens over the new paths and connected clients receive one changed event with ids `[]`',
        () => {
          assert.equal(result.watchers, 2, 'a second watcher did not open');
          assert.ok(
            result.watcherPaths.includes(path.join(root, 'openspec', 'changes', '001-a')),
            `second watcher paths ${result.watcherPaths.join(', ')} lack the worktree folder`,
          );
          assert.deepEqual(
            result.frames,
            [[]],
            `unexpected frames ${JSON.stringify(result.frames)}`,
          );
        },
      );
    },
  );

  scenario(
    'web-inspection',
    'Server closes the poll',
    { covers: (root: string, config: OsqConfig) => closeServerPoll(root, config) },
    async ({ run, then }) => {
      const root = await makeRepo('osq-tree-hub-close-');
      const result = await run(root, plainConfig());
      await then('the poll timer is cancelled and the current watcher is closed', () => {
        assert.equal(result.pollCancelled, true, 'the poll timer was not cancelled');
        assert.equal(result.watcherClosed, true, 'the current watcher was not closed');
      });
    },
  );
});

describe('tree hub default poll and pending batches', () => {
  it('defaults the poll to an unrefed setInterval', async () => {
    const root = await makeRepo('osq-tree-hub-unref-');
    const config = plainConfig();
    const originalSetInterval = globalThis.setInterval;
    const created: NodeJS.Timeout[] = [];
    const unrefed: NodeJS.Timeout[] = [];
    globalThis.setInterval = ((
      callback: (...args: unknown[]) => void,
      ms?: number,
      ...args: unknown[]
    ) => {
      const timer = originalSetInterval(callback, ms, ...args);
      const originalUnref = timer.unref.bind(timer);
      timer.unref = () => {
        unrefed.push(timer);
        return originalUnref();
      };
      created.push(timer);
      return timer;
    }) as unknown as typeof setInterval;
    try {
      const hub = await createTreeHub({ projectRoot: root, config, debounceMs: 50 });
      await hub.close();
    } finally {
      globalThis.setInterval = originalSetInterval;
    }
    assert.equal(created.length, 1, 'expected exactly one poll interval');
    assert.deepEqual(unrefed, created, 'expected the poll interval to be unref()ed');
  });

  it('cancelPending cancels the current hub pending batch', async () => {
    const root = await makeRepo('osq-tree-hub-cancel-');
    const config = plainConfig();
    const trees = new ManualTrees([checkoutTree(root)]);
    const { factory, records } = watchFactory();
    const scheduler = new ManualScheduler();
    const every = new ManualEvery();
    const hub = await createTreeHub({
      projectRoot: root,
      config,
      debounceMs: 50,
      trees: trees.fn,
      every: every.every,
      watch: factory,
      schedule: scheduler.schedule,
    });
    const frames: number[][] = [];
    hub.subscribe((batch) => frames.push([...batch.ids]));
    records[0]?.watcher.emit('change', path.join(root, 'openspec', 'changes', '001-a', 'brief.md'));
    hub.cancelPending();
    scheduler.fire();
    assert.deepEqual(frames, [], 'a cancelled pending batch must not fire');
    await hub.close();
  });
});
