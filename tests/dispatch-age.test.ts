import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { defineConfig } from '../src/core/foundation/config.js';
import { readDispatchItems } from '../src/core/status/dispatch-items.js';
import type { OrderedDispatchItem } from '../src/core/status/dispatch-order.js';
import {
  type DispatchWatch,
  type EveryFn,
  type TreesFn,
  type WatchDispatchOptions,
  watchDispatch,
} from '../src/core/status/dispatch-watch.js';
import { readDispatch, readDispatchQueue } from '../src/core/status/dispatch.js';
import { resolveWaitLogPath } from '../src/core/status/wait-log.js';
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
let home: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-dispatch-age-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-dispatch-age-home-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
});

function proposalMd(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'depends_on: []',
    'verify: node verify.cjs',
    '---',
    '## Goal',
    `${title} goal.`,
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

async function createChange(root: string, folderName: string, title: string): Promise<string> {
  const dir = path.join(root, CHANGES, folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(title), 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), taskMd('Task one'), 'utf8');
  return dir;
}

async function approve(folderPath: string): Promise<void> {
  await fs.mkdir(path.join(folderPath, '.run'), { recursive: true });
  await fs.writeFile(path.join(folderPath, '.run', 'approved'), 'sha256:fixture\n', 'utf8');
}

/** Two unapproved changes ready for approval, plus a running change to un-idle. */
async function buildTieProject(idle: boolean): Promise<void> {
  await createChange(tmpDir, '001-base', 'Base');
  await createChange(tmpDir, '002-base', 'Base two');
  if (!idle) {
    const runner = await createChange(tmpDir, '003-runner', 'Runner');
    await approve(runner);
  }
}

function seenApproval(change: string, at: Date): unknown {
  return {
    type: 'seen',
    item: { kind: 'approval', change, task: null },
    idle: false,
    unobserved: true,
    at: at.toISOString(),
    session: 'test-session',
  };
}

async function writeWaitLog(projectRoot: string, records: readonly unknown[]): Promise<void> {
  const logPath = await resolveWaitLogPath(projectRoot, home);
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  const lines = records.map((record) => JSON.stringify(record)).join('\n');
  await fs.writeFile(logPath, `${lines}\n`, 'utf8');
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

  async close(): Promise<void> {
    this.closed = true;
  }
}

function watchFactory(): WatcherFactory {
  return (_paths: readonly string[], _options: WatchOptions) => new FakeWatcher();
}

/** Debounce clock whose callback runs on the next microtask. */
class ImmediateScheduler {
  schedule: ScheduleFn = (callback, _delayMs) => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) callback();
    });
    return {
      cancel: () => {
        cancelled = true;
      },
    } satisfies TimerHandle;
  };
}

/** Manual poll clock: nothing fires until the test calls `fire`. */
class ManualEvery {
  callback: (() => void) | null = null;

  every: EveryFn = (callback, _delayMs) => {
    this.callback = callback;
    return { cancel: () => undefined };
  };

  fire(): void {
    if (this.callback === null) throw new Error('no poll callback to fire');
    this.callback();
  }
}

interface Derivation {
  readonly items: readonly OrderedDispatchItem[];
  readonly at: Date;
  readonly idle: boolean;
}

function startWatch(): { readonly derivations: Derivation[]; readonly stop: () => Promise<void> } {
  const derivations: Derivation[] = [];
  const config = defineConfig({ inbox: { pollSeconds: 12, eventDebounceMs: 100 } });
  const trees: TreesFn = async (projectRoot, cfg) => [
    singleChangeTree(projectRoot, cfg.paths.openspecRoot),
  ];
  const options: WatchDispatchOptions = {
    home,
    stderr: () => undefined,
    now: () => AT,
    schedule: new ImmediateScheduler().schedule,
    every: new ManualEvery().every,
    trees,
    watch: watchFactory(),
  };
  const watch: DispatchWatch = watchDispatch(tmpDir, config, options, (items, at, idle) => {
    derivations.push({ items, at, idle });
  });
  return { derivations, stop: () => watch.close() };
}

/** Yield to the event loop until `predicate` holds, without a real timer. */
async function settle(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 200000; i += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('condition was never met');
}

function approvals(items: readonly OrderedDispatchItem[]): string[] {
  return items.filter((item) => item.kind === 'approval').map((item) => item.change.id);
}

describe('dispatch age', () => {
  it('First seen breaks ties', async () => {
    await buildTieProject(false);
    const seenAt = new Date(2026, 0, 1, 9, 5);
    await writeWaitLog(tmpDir, [seenApproval('002-base', seenAt)]);
    const config = defineConfig({});

    const dispatch = await readDispatchItems(tmpDir, config);
    assert.equal(dispatch.watcherIdle, false);

    const preview = await readDispatch(tmpDir, config, home);
    assert.deepEqual(approvals(preview.items), ['002', '001']);
    const first = preview.items.find((item) => item.change.id === '002');
    assert.ok(first);
    assert.equal(first.reason, 'waiting since 2026-01-01 09:05');
    const second = preview.items.find((item) => item.change.id === '001');
    assert.ok(second);
    assert.equal(second.reason, 'in change order');

    const queue = await readDispatchQueue(tmpDir, config, home);
    assert.deepEqual(approvals(queue.items), ['002', '001']);
  });

  it('Logged before unlogged', async () => {
    await buildTieProject(false);
    const seenAt = new Date(2026, 0, 1, 9, 5);
    await writeWaitLog(tmpDir, [seenApproval('002-base', seenAt)]);
    const config = defineConfig({});

    const preview = await readDispatch(tmpDir, config, home);
    assert.deepEqual(approvals(preview.items), ['002', '001']);
    const first = preview.items.find((item) => item.change.id === '002');
    assert.ok(first);
    assert.equal(first.reason, 'waiting since 2026-01-01 09:05');
  });

  it('Idle and first seen', async () => {
    await buildTieProject(true);
    const seenAt = new Date(2026, 0, 1, 9, 5);
    await writeWaitLog(tmpDir, [seenApproval('002-base', seenAt)]);

    const h = startWatch();
    await settle(() => h.derivations.length >= 1);
    const first = h.derivations[0];
    assert.ok(first);
    assert.equal(first.idle, true);
    assert.deepEqual(approvals(first.items), ['002', '001']);
    await h.stop();
  });
});
