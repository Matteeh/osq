import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { defineConfig } from '../src/core/foundation/config.js';
import type { ChangeTree } from '../src/core/status/change-locations.js';
import type { EveryFn, FollowDispatchOptions } from '../src/core/status/dispatch-follow.js';
import { followDispatch } from '../src/core/status/dispatch-follow.js';
import type { OrderedDispatchItem } from '../src/core/status/dispatch-order.js';
import {
  type DispatchWatch,
  type TreesFn,
  type WatchDispatchOptions,
  watchDispatch,
} from '../src/core/status/dispatch-watch.js';
import type {
  ScheduleFn,
  TimerHandle,
  WatchOptions,
  WatcherFactory,
  WatcherLike,
} from '../src/core/web/web-events.js';
import { singleChangeTree } from '../src/core/web/web-trees.js';

const CHANGES = path.join('openspec', 'changes');
const AT = new Date(2026, 0, 1, 9, 30);

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-dispatch-watch-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function proposalMd(title: string, goal: string, dependsOn: readonly string[] = []): string {
  const deps = dependsOn.map((id) => JSON.stringify(id)).join(', ');
  return [
    '---',
    `title: ${title}`,
    `depends_on: [${deps}]`,
    'verify: node verify.cjs',
    '---',
    '## Goal',
    goal,
    '',
    '## Surface',
    'None.',
    '',
    '## Human steps',
    'None',
    '',
  ].join('\n');
}

function taskMd(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'verify: node verify.cjs',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    `- [ ] ${title} criterion`,
    '',
  ].join('\n');
}

async function createChange(
  root: string,
  folderName: string,
  title: string,
  options: { dependsOn?: readonly string[]; goal?: string } = {},
): Promise<string> {
  const dir = path.join(root, CHANGES, folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'proposal.md'),
    proposalMd(title, options.goal ?? `${title} goal.`, options.dependsOn ?? []),
    'utf8',
  );
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), taskMd('Task one'), 'utf8');
  return dir;
}

async function approve(folderPath: string): Promise<void> {
  await fs.mkdir(path.join(folderPath, '.run'), { recursive: true });
  await fs.writeFile(path.join(folderPath, '.run', 'approved'), 'sha256:fixture\n', 'utf8');
}

function deadMarkerPath(folderPath: string, task = 1): string {
  return path.join(folderPath, '.run', 'dead', `${task}.md`);
}

async function writeDead(folderPath: string, task = 1): Promise<string> {
  const marker = deadMarkerPath(folderPath, task);
  await fs.mkdir(path.dirname(marker), { recursive: true });
  await fs.writeFile(marker, '---\nreason: verify_red\n---\nboom\n', 'utf8');
  return marker;
}

/** An unapproved change ready for approval, plus an approved change to mutate. */
async function buildProject(): Promise<{ approval: string; work: string }> {
  const approval = await createChange(tmpDir, '001-base', 'Base');
  const work = await createChange(tmpDir, '002-work', 'Work');
  await approve(work);
  return { approval, work };
}

interface Collector {
  readonly text: () => string;
  readonly write: (msg: string) => void;
}

function collector(): Collector {
  let buffer = '';
  return {
    text: () => buffer,
    write: (msg: string) => {
      buffer += msg;
    },
  };
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

interface WatcherCall {
  readonly watcher: FakeWatcher;
  readonly paths: readonly string[];
  readonly options: WatchOptions;
}

function watchFactory(): { factory: WatcherFactory; calls: WatcherCall[] } {
  const calls: WatcherCall[] = [];
  const factory: WatcherFactory = (paths, options) => {
    const watcher = new FakeWatcher();
    calls.push({ watcher, paths: [...paths], options });
    return watcher;
  };
  return { factory, calls };
}

/** Debounce clock whose callback runs on the next microtask. */
class ImmediateScheduler {
  cancelCalls = 0;

  schedule: ScheduleFn = (callback, _delayMs) => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) callback();
    });
    return {
      cancel: () => {
        cancelled = true;
        this.cancelCalls += 1;
      },
    } satisfies TimerHandle;
  };
}

/** Manual poll clock: nothing fires until the test calls `fire`. */
class ManualEvery {
  callback: (() => void) | null = null;
  delayMs = 0;
  cancelCalls = 0;

  every: EveryFn = (callback, delayMs) => {
    this.callback = callback;
    this.delayMs = delayMs;
    return {
      cancel: () => {
        this.cancelCalls += 1;
      },
    };
  };

  fire(): void {
    if (this.callback === null) throw new Error('no poll callback to fire');
    this.callback();
  }
}

interface Derivation {
  readonly items: readonly OrderedDispatchItem[];
  readonly at: Date;
}

interface WatchHarness {
  readonly derivations: Derivation[];
  readonly errors: string[];
  readonly every: ManualEvery;
  readonly watcherCalls: WatcherCall[];
  readonly current: () => FakeWatcher;
  readonly treeCount: () => number;
  stop(): Promise<void>;
}

function startWatch(overrides: { trees?: TreesFn; now?: () => Date } = {}): WatchHarness {
  const derivations: Derivation[] = [];
  const errors: string[] = [];
  const scheduler = new ImmediateScheduler();
  const every = new ManualEvery();
  const { factory, calls } = watchFactory();
  const config = defineConfig({ inbox: { pollSeconds: 12, eventDebounceMs: 100 } });
  let treeCalls = 0;
  const trees: TreesFn = async (projectRoot, cfg) => {
    treeCalls += 1;
    if (overrides.trees) return overrides.trees(projectRoot, cfg);
    return [singleChangeTree(projectRoot, cfg.paths.openspecRoot)];
  };
  const options: WatchDispatchOptions = {
    stderr: (message) => errors.push(message),
    now: overrides.now ?? (() => AT),
    schedule: scheduler.schedule,
    every: every.every,
    trees,
    watch: factory,
  };
  const watch: DispatchWatch = watchDispatch(tmpDir, config, options, (items, at) => {
    derivations.push({ items, at });
  });
  return {
    derivations,
    errors,
    every,
    watcherCalls: calls,
    current: () => {
      const call = calls[calls.length - 1];
      if (!call) throw new Error('no watcher created yet');
      return call.watcher;
    },
    treeCount: () => treeCalls,
    stop: () => watch.close(),
  };
}

/** Yield to the event loop until `predicate` holds, without a real timer. */
async function settle(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 200000; i += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('condition was never met');
}

/** Let every queued microtask and immediate run, then stop. */
async function flush(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

describe('watchDispatch', () => {
  it('derives once as soon as it starts, with the clock time it started', async () => {
    await buildProject();
    const h = startWatch();
    await settle(() => h.derivations.length >= 1);
    const first = h.derivations[0];
    assert.ok(first);
    assert.equal(first.at, AT);
    assert.ok(first.items.some((item) => item.kind === 'approval'));
    await h.stop();
  });

  it('derives on a watcher batch and sees the new halt item', async () => {
    const { work } = await buildProject();
    const h = startWatch();
    await settle(() => h.derivations.length >= 1);
    const before = h.derivations.length;

    await writeDead(work);
    h.current().emit('add', deadMarkerPath(work));
    await settle(() => h.derivations.length > before);

    const last = h.derivations[h.derivations.length - 1];
    assert.ok(last?.items.some((item) => item.kind === 'halt'));
    await h.stop();
  });

  it('derives on the poll timer without a watcher event', async () => {
    const h = startWatch();
    await settle(() => h.derivations.length >= 1);
    const before = h.derivations.length;
    assert.equal(h.every.delayMs, 12000);

    h.every.fire();
    await settle(() => h.derivations.length > before);
    await h.stop();
  });

  it('close closes the watcher, cancels the poll, and stops deriving', async () => {
    const h = startWatch();
    await settle(() => h.derivations.length >= 1);
    const watcher = h.current();
    await h.stop();

    assert.equal(h.every.cancelCalls, 1);
    assert.equal(watcher.closed, true);

    const count = h.derivations.length;
    watcher.emit('change', path.join(tmpDir, 'openspec', 'changes'));
    h.every.fire();
    await flush();
    assert.equal(h.derivations.length, count);
  });

  it('reports a derivation error and keeps watching', async () => {
    await buildProject();
    let calls = 0;
    const now = (): Date => {
      calls += 1;
      if (calls === 2) throw new Error('clock failed');
      return AT;
    };
    const h = startWatch({ now });
    await settle(() => h.derivations.length >= 1);

    h.every.fire();
    await settle(() => h.errors.length >= 1);
    assert.equal(h.errors[0], 'osq inbox: clock failed\n');

    const afterError = h.derivations.length;
    h.every.fire();
    await settle(() => h.derivations.length > afterError);
    await h.stop();
  });

  it('reopens the hub and derives once more when the watched trees change', async () => {
    const tree1 = singleChangeTree(tmpDir, 'openspec');
    const tree2: ChangeTree = {
      root: path.join(tmpDir, 'wt'),
      worktreeFolder: '002-work',
      changesDir: path.join(tmpDir, 'wt', 'openspec', 'changes'),
      archiveDir: path.join(tmpDir, 'wt', 'openspec', 'changes', 'archive'),
      rejectedDir: path.join(tmpDir, 'wt', 'openspec', 'changes', 'rejected'),
    };
    let calls = 0;
    const trees: TreesFn = async () => {
      calls += 1;
      return calls <= 1 ? [tree1] : [tree1, tree2];
    };
    const h = startWatch({ trees });
    await settle(() => calls >= 3);

    assert.equal(h.watcherCalls.length, 2);
    assert.equal(h.watcherCalls[0]?.watcher.closed, true);
    assert.ok(h.watcherCalls[1]?.paths.some((value) => value.includes('002-work')));
    await h.stop();
  });

  it('queues one more derivation when a batch arrives during one', async () => {
    await buildProject();
    let h: WatchHarness | null = null;
    let treeCalls = 0;
    const trees: TreesFn = async (projectRoot, cfg) => {
      treeCalls += 1;
      if (treeCalls === 2) h?.current().emit('change', path.join(tmpDir, 'openspec'));
      return [singleChangeTree(projectRoot, cfg.paths.openspecRoot)];
    };
    h = startWatch({ trees });
    await settle(() => h !== null && h.derivations.length >= 2);
    await h.stop();
  });
});

describe('followDispatch on watchDispatch', () => {
  it('prints the preview, follows a new item, and stops on abort', async () => {
    const { work } = await buildProject();
    const out = collector();
    const controller = new AbortController();
    const every = new ManualEvery();
    const scheduler = new ImmediateScheduler();
    const { factory, calls } = watchFactory();
    const config = defineConfig({ inbox: { pollSeconds: 12, eventDebounceMs: 100 } });
    const options: FollowDispatchOptions = {
      stdout: out.write,
      now: () => AT,
      signal: controller.signal,
      every: every.every,
      schedule: scheduler.schedule,
      watch: factory,
      trees: async (projectRoot, cfg) => [singleChangeTree(projectRoot, cfg.paths.openspecRoot)],
    };

    const done = followDispatch(tmpDir, config, options);
    await settle(() => out.text().includes('Waiting for new items (Ctrl-C to stop).'));

    await writeDead(work);
    calls[calls.length - 1]?.watcher.emit('add', deadMarkerPath(work));
    await settle(() => out.text().includes('+ halt'));

    controller.abort();
    await done;
    assert.equal(every.cancelCalls, 1);
  });
});
