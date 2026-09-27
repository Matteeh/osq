import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { defineConfig } from '../src/core/foundation/config.js';
import type { EveryFn, FollowDispatchOptions } from '../src/core/status/dispatch-follow.js';
import { followDispatch } from '../src/core/status/dispatch-follow.js';
import type {
  CardInput,
  CardSessionOptions,
  Launcher,
} from '../src/core/status/dispatch-session.js';
import { runCardSession } from '../src/core/status/dispatch-session.js';
import type { InboxSound } from '../src/core/status/inbox-sound.js';
import { type WaitRecord, readWaitLog } from '../src/core/status/wait-log.js';
import { type WaitRecorder, createWaitRecorder } from '../src/core/status/wait-recorder.js';
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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-wait-recording-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-wait-recording-home-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
});

function proposalMd(title: string, goal: string): string {
  return [
    '---',
    `title: ${title}`,
    'depends_on: []',
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

async function createChange(root: string, folderName: string, title: string): Promise<string> {
  const dir = path.join(root, CHANGES, folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(title, `${title} goal.`), 'utf8');
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

async function writeDead(folderPath: string, task = 1): Promise<void> {
  const marker = deadMarkerPath(folderPath, task);
  await fs.mkdir(path.dirname(marker), { recursive: true });
  await fs.writeFile(marker, '---\nreason: verify_red\n---\nboom\n', 'utf8');
}

/** An unapproved change ready for approval, plus an approved change to kill. */
async function buildProject(): Promise<{ approval: string; work: string }> {
  const approval = await createChange(tmpDir, '001-base', 'Base');
  const work = await createChange(tmpDir, '002-work', 'Work');
  await approve(work);
  await writeDead(work);
  return { approval, work };
}

interface Collector {
  readonly text: () => string;
  readonly write: (message: string) => void;
}

function collector(): Collector {
  let buffer = '';
  return {
    text: () => buffer,
    write: (message: string) => {
      buffer += message;
    },
  };
}

/** Scripted terminal input: `key()` drains a queue and leaves a later key pending. */
class ScriptedInput implements CardInput {
  readonly lineQuestions: string[] = [];
  private readonly keys: (string | null)[] = [];
  private readonly lines: (string | null)[] = [];
  private keyResolver: ((value: string | null) => void) | null = null;

  pushKey(value: string | null): void {
    const resolver = this.keyResolver;
    if (resolver !== null) {
      this.keyResolver = null;
      resolver(value);
      return;
    }
    this.keys.push(value);
  }

  pushLine(value: string | null): void {
    this.lines.push(value);
  }

  async key(): Promise<string | null> {
    if (this.keys.length > 0) return this.keys.shift() as string | null;
    return new Promise<string | null>((resolve) => {
      this.keyResolver = resolve;
    });
  }

  async line(question: string): Promise<string | null> {
    this.lineQuestions.push(question);
    return this.lines.length > 0 ? (this.lines.shift() as string | null) : null;
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

interface ScheduledTimer {
  callback: () => void;
  cancelled: boolean;
  fired: boolean;
}

/** Manual debounce clock: nothing fires until the test calls `fire`. */
class ManualScheduler {
  readonly timers: ScheduledTimer[] = [];

  schedule: ScheduleFn = (callback, _delayMs) => {
    const timer: ScheduledTimer = { callback, cancelled: false, fired: false };
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

  every: EveryFn = (callback) => {
    this.callback = callback;
    return {
      cancel: () => undefined,
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

interface SessionHarness {
  readonly input: ScriptedInput;
  readonly out: Collector;
  readonly launched: string[][];
  readonly done: Promise<void>;
}

function startSession(recorder: WaitRecorder | undefined, launch: Launcher): SessionHarness {
  const input = new ScriptedInput();
  const out = collector();
  const launched: string[][] = [];
  const { sound } = recordingSound();
  const every = new ManualEvery();
  const scheduler = new ImmediateScheduler();
  const { factory } = watchFactory();
  const config = defineConfig({ inbox: { pollSeconds: 12, eventDebounceMs: 100 } });
  const wrapped: Launcher = async (args) => {
    launched.push([...args]);
    return launch(args);
  };
  const options: CardSessionOptions = {
    input,
    launch: wrapped,
    sound,
    stdout: out.write,
    now: () => AT,
    home,
    watch: factory,
    schedule: scheduler.schedule,
    every: every.every,
    trees: async (projectRoot, cfg) => [singleChangeTree(projectRoot, cfg.paths.openspecRoot)],
    ...(recorder ? { recorder } : {}),
  };
  const done = runCardSession(tmpDir, config, options);
  return { input, out, launched, done };
}

interface FollowHarness {
  readonly controller: AbortController;
  readonly done: Promise<void>;
  readonly out: Collector;
  readonly scheduler: ManualScheduler;
  readonly every: ManualEvery;
  readonly watcherCalls: WatcherCall[];
  readonly current: () => FakeWatcher;
  readonly treeCount: () => number;
}

function startFollow(recorder: WaitRecorder): FollowHarness {
  const controller = new AbortController();
  const out = collector();
  const scheduler = new ManualScheduler();
  const every = new ManualEvery();
  const { factory, calls } = watchFactory();
  const config = defineConfig({ inbox: { pollSeconds: 12, eventDebounceMs: 100 } });
  let treeCalls = 0;
  const trees = async (projectRoot: string, cfg: { paths: { openspecRoot: string } }) => {
    treeCalls += 1;
    return [singleChangeTree(projectRoot, cfg.paths.openspecRoot)];
  };
  const options: FollowDispatchOptions = {
    stdout: out.write,
    now: () => AT,
    signal: controller.signal,
    recorder,
    home,
    watch: factory,
    schedule: scheduler.schedule,
    every: every.every,
    trees,
  };
  const done = followDispatch(tmpDir, config, options);
  return {
    controller,
    done,
    out,
    scheduler,
    every,
    watcherCalls: calls,
    current: () => {
      const call = calls[calls.length - 1];
      if (!call) throw new Error('no watcher created yet');
      return call.watcher;
    },
    treeCount: () => treeCalls,
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

function logTypes(records: readonly WaitRecord[]): string[] {
  return records.map((record) => record.type);
}

function createRecorder(mode: 'cards' | 'follow'): WaitRecorder {
  return createWaitRecorder(tmpDir, mode, { home, stderr: () => undefined });
}

describe('wait recording from the card session', () => {
  it('records start, seen, top, opened, gone, top, opened, and stop as it approves', async () => {
    const { approval } = await buildProject();
    const recorder = createRecorder('cards');
    const h = startSession(recorder, async (args) => {
      if (args[0] === 'approve') await approve(approval);
      return 0;
    });
    h.input.pushKey('a');
    h.input.pushKey('q');
    await h.done;

    const records = (await readWaitLog(tmpDir, home)) ?? [];
    assert.deepEqual(logTypes(records), [
      'start',
      'seen',
      'seen',
      'top',
      'opened',
      'gone',
      'top',
      'opened',
      'stop',
    ]);
    const start = records[0];
    assert.equal(start?.type === 'start' ? start.mode : null, 'cards');
    assert.deepEqual(
      records
        .filter((record) => record.type === 'seen')
        .map((record) => (record.type === 'seen' ? record.item : null)),
      [
        { kind: 'approval', change: '001-base', task: null },
        { kind: 'halt', change: '002-work', task: '1' },
      ],
    );
    assert.deepEqual(h.launched, [['approve', '001']]);
  });

  it('writes nothing when no recorder is given', async () => {
    await buildProject();
    const h = startSession(undefined, async () => 0);
    h.input.pushKey('q');
    await h.done;

    assert.equal(await readWaitLog(tmpDir, home), null);
  });
});

describe('wait recording from the follow loop', () => {
  it('records start, a null top, the new halt, its top, and stop', async () => {
    const work = await createChange(tmpDir, '002-work', 'Work');
    await approve(work);
    const recorder = createRecorder('follow');
    const h = startFollow(recorder);
    await settle(() => h.treeCount() >= 2);
    assert.ok(h.out.text().includes('Waiting for new items (Ctrl-C to stop).'));

    await writeDead(work);
    h.current().emit('add', deadMarkerPath(work));
    h.scheduler.fire();
    await settle(() => h.out.text().includes('+ halt'));

    h.controller.abort();
    await h.done;

    const records = (await readWaitLog(tmpDir, home)) ?? [];
    assert.deepEqual(logTypes(records), ['start', 'top', 'seen', 'top', 'stop']);
    const start = records[0];
    assert.equal(start?.type === 'start' ? start.mode : null, 'follow');
    const firstTop = records[1];
    assert.equal(firstTop?.type === 'top' ? firstTop.item : 'missing', null);
    const seen = records[2];
    assert.equal(seen?.type === 'seen' ? seen.unobserved : null, false);
    assert.deepEqual(seen?.type === 'seen' ? seen.item : null, {
      kind: 'halt',
      change: '002-work',
      task: '1',
    });
    const haltTop = records[3];
    assert.equal(haltTop?.type === 'top' ? haltTop.item?.kind : null, 'halt');
    assert.equal(h.every.callback !== null, true);
  });
});
