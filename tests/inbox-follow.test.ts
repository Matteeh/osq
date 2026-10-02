import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { CommandError } from '../src/cli/command-error.js';
import { inboxDispatchCommand } from '../src/cli/inbox-dispatch.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import type { ChangeTree } from '../src/core/status/change-locations.js';
import { type EveryFn, followDispatch } from '../src/core/status/dispatch-follow.js';
import { formatDispatchItemSummary, formatDispatchText } from '../src/core/status/dispatch-text.js';
import { readDispatch } from '../src/core/status/dispatch.js';
import type { InboxSound } from '../src/core/status/inbox-sound.js';
import type {
  ScheduleFn,
  TimerHandle,
  WatchOptions,
  WatcherFactory,
  WatcherLike,
} from '../src/core/web/web-events.js';
import { singleChangeTree } from '../src/core/web/web-trees.js';
import { runCliCaptured } from './cli-capture.js';

const CHANGES = path.join('openspec', 'changes');
const AT = new Date(2026, 0, 1, 9, 30);

let tmpDir: string;
let home: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-follow-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-follow-home-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
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

async function writeMarker(folderPath: string, rel: string, content: string): Promise<void> {
  const target = path.join(folderPath, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

function deadMarkerPath(folderPath: string, task = 1): string {
  return path.join(folderPath, '.run', 'dead', `${task}.md`);
}

async function writeDead(folderPath: string, task = 1): Promise<string> {
  const marker = deadMarkerPath(folderPath, task);
  await writeMarker(
    folderPath,
    path.join('.run', 'dead', `${task}.md`),
    '---\nreason: verify_red\n---\nboom\n',
  );
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

function recordingSound(): { sound: InboxSound; played: Date[] } {
  const played: Date[] = [];
  return {
    sound: {
      notify: (now) => {
        played.push(now);
      },
    },
    played,
  };
}

type TreesFn = (projectRoot: string, config: OsqConfig) => Promise<readonly ChangeTree[]>;

interface FollowHarness {
  readonly controller: AbortController;
  readonly done: Promise<void>;
  readonly out: Collector;
  readonly played: Date[];
  readonly scheduler: ManualScheduler;
  readonly every: ManualEvery;
  readonly watcherCalls: WatcherCall[];
  readonly current: () => FakeWatcher;
  readonly treeCount: () => number;
  stop(): Promise<void>;
}

function startFollow(overrides: { trees?: TreesFn } = {}): FollowHarness {
  const controller = new AbortController();
  const out = collector();
  const { sound, played } = recordingSound();
  const scheduler = new ManualScheduler();
  const every = new ManualEvery();
  const { factory, calls } = watchFactory();
  const config = defineConfig({ inbox: { pollSeconds: 12, eventDebounceMs: 100 } });
  let treeCalls = 0;
  const trees: TreesFn = async (projectRoot, cfg) => {
    treeCalls += 1;
    if (overrides.trees) return overrides.trees(projectRoot, cfg);
    return [singleChangeTree(projectRoot, cfg.paths.openspecRoot)];
  };
  const done = followDispatch(tmpDir, config, {
    stdout: out.write,
    now: () => AT,
    sound,
    signal: controller.signal,
    watch: factory,
    schedule: scheduler.schedule,
    every: every.every,
    trees,
  });
  return {
    controller,
    done,
    out,
    played,
    scheduler,
    every,
    watcherCalls: calls,
    current: () => {
      const call = calls[calls.length - 1];
      if (!call) throw new Error('no watcher created yet');
      return call.watcher;
    },
    treeCount: () => treeCalls,
    stop: async () => {
      controller.abort();
      await done;
    },
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

async function startup(h: FollowHarness): Promise<void> {
  await settle(() => h.treeCount() >= 2);
}

function deltaLines(h: FollowHarness, sign: string): string[] {
  return h.out
    .text()
    .split('\n')
    .filter((line) => line.includes(` ${sign} `));
}

describe('formatDispatchItemSummary', () => {
  it('is exactly the text after the position on each osq inbox list line', async () => {
    await buildProject();
    await writeDead(path.join(tmpDir, CHANGES, '002-work'));
    const preview = await readDispatch(tmpDir, defineConfig({}));
    const lines = formatDispatchText(preview).split('\n');
    const summaries = [
      'approval 001 Base (watcher idle; this gives it work)',
      'halt 002 Work task 1: Task one (watcher idle; this gives it work)',
    ];

    assert.deepEqual(preview.items.map(formatDispatchItemSummary), summaries);
    assert.equal(lines[1], `  1. ${summaries[0]}`);
    assert.equal(lines[2], `  2. ${summaries[1]}`);
  });
});

describe('followDispatch', () => {
  it('prints a new halt and sounds once', async () => {
    const { work } = await buildProject();
    const h = startFollow();
    await startup(h);
    assert.equal(h.played.length, 0);
    assert.ok(h.out.text().includes('Waiting for new items (Ctrl-C to stop).'));

    await writeDead(work);
    h.current().emit('add', deadMarkerPath(work));
    h.scheduler.fire();
    await settle(() => h.out.text().includes('+ halt'));

    const plus = deltaLines(h, '+');
    assert.equal(plus.length, 1);
    assert.match(plus[0], /^09:30 \+ halt 002 Work task 1: Task one /);
    assert.equal(h.played.length, 1);
    await h.stop();
  });

  it('makes no sound for items present at start', async () => {
    const { work } = await buildProject();
    await writeDead(work);
    const h = startFollow();
    await startup(h);
    assert.equal(h.played.length, 0);
    assert.ok(h.out.text().includes('halt 002 Work'));

    const base = h.treeCount();
    h.current().emit('change', path.join(work, 'proposal.md'));
    h.scheduler.fire();
    await settle(() => h.treeCount() > base);

    assert.equal(deltaLines(h, '+').length, 0);
    assert.equal(h.played.length, 0);
    await h.stop();
  });

  it('prints a departed item without a sound', async () => {
    const { work } = await buildProject();
    await writeDead(work);
    const h = startFollow();
    await startup(h);

    await fs.rm(deadMarkerPath(work));
    h.current().emit('unlink', deadMarkerPath(work));
    h.scheduler.fire();
    await settle(() => h.out.text().includes(' - halt'));

    const minus = deltaLines(h, '-');
    assert.equal(minus.length, 1);
    assert.match(minus[0], /^09:30 - halt 002 Work task 1: Task one /);
    assert.equal(h.played.length, 0);
    await h.stop();
  });

  it('finds an item on the poll timer without a watcher event', async () => {
    const empty = await createChange(tmpDir, '009-lonely', 'Lonely');
    await approve(empty);
    const h = startFollow();
    await startup(h);
    assert.ok(h.out.text().includes('Nothing needs you.'));
    assert.equal(h.every.delayMs, 12000);

    await writeDead(empty);
    h.every.fire();
    await settle(() => h.out.text().includes('+ halt'));

    assert.equal(deltaLines(h, '+').length, 1);
    assert.equal(h.played.length, 1);
    await h.stop();
  });

  it('prints two new items in dispatch order and sounds once', async () => {
    const first = await createChange(tmpDir, '003-first', 'First');
    const second = await createChange(tmpDir, '009-second', 'Second');
    await approve(first);
    await approve(second);
    const h = startFollow();
    await startup(h);

    await writeDead(first);
    await writeDead(second);
    h.current().emit('add', deadMarkerPath(first));
    h.current().emit('add', deadMarkerPath(second));
    h.scheduler.fire();
    await settle(() => deltaLines(h, '+').length === 2);

    const plus = deltaLines(h, '+');
    assert.match(plus[0], / halt 003 First /);
    assert.match(plus[1], / halt 009 Second /);
    assert.equal(h.played.length, 1);
    await h.stop();
  });

  it('treats an item that came back as new and sounds again', async () => {
    const { work } = await buildProject();
    await writeDead(work);
    const h = startFollow();
    await startup(h);

    await fs.rm(deadMarkerPath(work));
    h.current().emit('unlink', deadMarkerPath(work));
    h.scheduler.fire();
    await settle(() => deltaLines(h, '-').length === 1);
    assert.equal(h.played.length, 0);

    await writeDead(work);
    h.current().emit('add', deadMarkerPath(work));
    h.scheduler.fire();
    await settle(() => deltaLines(h, '+').length === 1);

    assert.equal(h.played.length, 1);
    await h.stop();
  });

  it('waits on an empty inbox until the signal aborts', async () => {
    const h = startFollow();
    await settle(() => h.out.text().includes('Waiting for new items (Ctrl-C to stop).'));
    assert.ok(h.out.text().includes('Nothing needs you.'));
    assert.equal(h.played.length, 0);
    assert.equal(deltaLines(h, '+').length, 0);

    await h.stop();
    assert.equal(h.every.cancelCalls, 1);
    assert.equal(h.current().closed, true);
  });

  it('opens a new hub when the watched trees change and derives once more', async () => {
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
    const h = startFollow({ trees });
    await settle(() => calls >= 3);

    assert.equal(h.watcherCalls.length, 2);
    assert.equal(h.watcherCalls[0]?.watcher.closed, true);
    assert.ok(h.watcherCalls[1]?.paths.some((path_) => path_.includes('002-work')));
    await h.stop();
  });
});

describe('inboxDispatchCommand follow', () => {
  it('passes follow seams through and resolves on abort', async () => {
    const { work } = await buildProject();
    const out = collector();
    const { sound, played } = recordingSound();
    const scheduler = new ManualScheduler();
    const every = new ManualEvery();
    const { factory, calls } = watchFactory();
    const controller = new AbortController();
    const config = defineConfig({ inbox: { pollSeconds: 12, eventDebounceMs: 100 } });

    const done = inboxDispatchCommand({
      cwd: tmpDir,
      config,
      follow: true,
      home,
      stdout: out.write,
      now: () => AT,
      sound,
      signal: controller.signal,
      watch: factory,
      schedule: scheduler.schedule,
      every: every.every,
    });
    await settle(() => out.text().includes('Waiting for new items (Ctrl-C to stop).'));
    await settle(() => calls.length >= 1);

    await writeDead(work);
    calls[calls.length - 1]?.watcher.emit('add', deadMarkerPath(work));
    scheduler.fire();
    await settle(() => out.text().includes('+ halt'));
    assert.equal(played.length, 1);

    controller.abort();
    await done;
  });

  it('rejects --follow with --json as a CommandError and prints nothing', async () => {
    const stderr = collector();
    const previous = process.exitCode;
    process.exitCode = undefined;
    try {
      await assert.rejects(
        () =>
          inboxDispatchCommand({
            cwd: tmpDir,
            config: defineConfig({}),
            follow: true,
            json: true,
            stderr: stderr.write,
          }),
        (error: unknown) => {
          assert.ok(error instanceof CommandError, `expected a CommandError, got ${String(error)}`);
          assert.equal(error.name, 'CommandError');
          assert.equal(error.message, 'osq inbox: --follow prints text; drop --json');
          assert.equal(error.exitCode, 1);
          return true;
        },
      );
      assert.equal(process.exitCode, undefined, 'the command leaves the exit code alone');
    } finally {
      process.exitCode = previous;
    }
    assert.equal(stderr.text(), '', 'the command prints nothing itself');
  });

  it('prints the refusal and exits 1 through runCli', async () => {
    const capture = await runCliCaptured(tmpDir, ['inbox', '--follow', '--json']);

    assert.equal(capture.exitCode, 1);
    assert.deepEqual(capture.lines, [
      { stream: 'stderr', text: 'osq inbox: --follow prints text; drop --json' },
    ]);
  });
});
