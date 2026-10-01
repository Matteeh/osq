import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { defineConfig } from '../src/core/foundation/config.js';
import type {
  CardInput,
  CardSessionOptions,
  Launcher,
} from '../src/core/status/dispatch-session.js';
import { runCardSession } from '../src/core/status/dispatch-session.js';
import type { EveryFn } from '../src/core/status/dispatch-watch.js';
import type { InboxSound } from '../src/core/status/inbox-sound.js';
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
const WAITING = 'Nothing needs you. Waiting for new items (q to quit).';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-dispatch-session-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
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

/** An unapproved change ready for approval, plus an approved change to kill. */
async function buildProject(): Promise<{ approval: string; work: string }> {
  const approval = await createChange(tmpDir, '001-base', 'Base');
  const work = await createChange(tmpDir, '002-work', 'Work');
  await approve(work);
  await writeDead(work);
  return { approval, work };
}

/** A change-level regression, which maps to the reject key. */
async function buildRegression(): Promise<string> {
  const change = await createChange(tmpDir, '004-change', 'Change regression');
  await approve(change);
  await writeMarker(
    change,
    path.join('.run', 'regressed', 'change.md'),
    '---\nreason: worktree_dirty\n---\nx\n',
  );
  return change;
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
  keyCalls = 0;
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
    this.keyCalls += 1;
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

type LaunchHandler = (args: readonly string[]) => number | Promise<number>;

interface StartOptions {
  readonly launch?: LaunchHandler;
  readonly signal?: AbortSignal;
}

interface SessionHarness {
  readonly input: ScriptedInput;
  readonly out: Collector;
  readonly launched: string[][];
  readonly played: Date[];
  readonly every: ManualEvery;
  readonly watcherCalls: WatcherCall[];
  readonly current: () => FakeWatcher;
  readonly done: Promise<void>;
}

function startSession(start: StartOptions = {}): SessionHarness {
  const input = new ScriptedInput();
  const out = collector();
  const launched: string[][] = [];
  const { sound, played } = recordingSound();
  const every = new ManualEvery();
  const scheduler = new ImmediateScheduler();
  const { factory, calls } = watchFactory();
  const config = defineConfig({ inbox: { pollSeconds: 12, eventDebounceMs: 100 } });
  const launch: Launcher = async (args) => {
    launched.push([...args]);
    return start.launch ? start.launch(args) : 0;
  };
  const options: CardSessionOptions = {
    input,
    launch,
    sound,
    stdout: out.write,
    now: () => AT,
    ...(start.signal ? { signal: start.signal } : {}),
    watch: factory,
    schedule: scheduler.schedule,
    every: every.every,
    trees: async (projectRoot, cfg) => [singleChangeTree(projectRoot, cfg.paths.openspecRoot)],
  };
  const done = runCardSession(tmpDir, config, options);
  return {
    input,
    out,
    launched,
    played,
    every,
    watcherCalls: calls,
    current: () => {
      const call = calls[calls.length - 1];
      if (!call) throw new Error('no watcher created yet');
      return call.watcher;
    },
    done,
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

/** The `Needs you (<n>):` counts in the order they printed. */
function screenCounts(text: string): number[] {
  return [...text.matchAll(/Needs you \((\d+)\):/g)].map((match) => Number(match[1]));
}

/** The card header line after every `Needs you (<n>):` line, in order. */
function cardHeaders(text: string): string[] {
  const lines = text.split('\n');
  const headers: string[] = [];
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (lines[i]?.startsWith('Needs you (')) headers.push(lines[i + 1] ?? '');
  }
  return headers;
}

describe('runCardSession', () => {
  it('approves the first item, prints separators, and shows the next card', async () => {
    const { approval } = await buildProject();
    const h = startSession({
      launch: async (args) => {
        if (args[0] === 'approve') await approve(approval);
        return 0;
      },
    });
    h.input.pushKey('a');
    h.input.pushKey('q');
    await h.done;

    assert.deepEqual(h.launched, [['approve', '001']]);
    assert.match(h.out.text(), /── osq approve 001 ──/);
    assert.match(h.out.text(), /── exit 0 ──/);
    assert.deepEqual(cardHeaders(h.out.text()), ['approval: 001-base', 'halt: 002-work']);
    assert.deepEqual(screenCounts(h.out.text()), [2, 1]);
  });

  it('prints the exit code and shows the same card again when the item stays', async () => {
    await createChange(tmpDir, '001-base', 'Base');
    const h = startSession({ launch: () => 1 });
    h.input.pushKey('a');
    h.input.pushKey('q');
    await h.done;

    assert.deepEqual(h.launched, [['approve', '001']]);
    assert.match(h.out.text(), /── exit 1 ──/);
    assert.deepEqual(cardHeaders(h.out.text()), ['approval: 001-base', 'approval: 001-base']);
  });

  it('asks for the reject reason and passes it as one argument', async () => {
    await buildRegression();
    const h = startSession();
    h.input.pushKey('x');
    h.input.pushLine('wrong approach');
    h.input.pushKey('q');
    await h.done;

    assert.deepEqual(h.input.lineQuestions, ['Reason: ']);
    assert.deepEqual(h.launched, [['reject', '004', '--reason', 'wrong approach']]);
    assert.match(h.out.text(), /── osq reject 004 --reason <text> ──/);
  });

  it('shows the same card without launching when the reason is empty', async () => {
    await buildRegression();
    const h = startSession();
    h.input.pushKey('x');
    h.input.pushLine('');
    h.input.pushKey('q');
    await h.done;

    assert.deepEqual(h.launched, []);
    assert.deepEqual(cardHeaders(h.out.text()), ['halt: 004-change', 'halt: 004-change']);
  });

  it('moves a skipped item behind the rest and cycles back to it', async () => {
    await buildProject();
    const h = startSession();
    h.input.pushKey('n');
    h.input.pushKey('n');
    h.input.pushKey('q');
    await h.done;

    assert.deepEqual(cardHeaders(h.out.text()), [
      'approval: 001-base',
      'halt: 002-work',
      'approval: 001-base',
    ]);
  });

  it('drops a skipped item that goes away', async () => {
    const { approval } = await buildProject();
    const h = startSession();
    h.input.pushKey('n');
    await settle(() => h.out.text().includes('halt: 002-work'));
    assert.deepEqual(screenCounts(h.out.text()), [2, 2]);
    assert.deepEqual(cardHeaders(h.out.text()), ['approval: 001-base', 'halt: 002-work']);

    await approve(approval);
    h.input.pushKey('z');
    await settle(() => screenCounts(h.out.text()).length >= 3);

    const counts = screenCounts(h.out.text());
    assert.equal(counts[counts.length - 1], 1);
    assert.equal(cardHeaders(h.out.text())[2], 'halt: 002-work');

    h.input.pushKey('q');
    await h.done;
  });

  it('waits on an empty inbox, notifies once, and opens the first card', async () => {
    const work = await createChange(tmpDir, '002-work', 'Work');
    await approve(work);
    const h = startSession();
    await settle(() => h.out.text().includes(WAITING));
    await settle(() => h.watcherCalls.length >= 1);
    assert.equal(h.input.keyCalls, 1);

    await writeDead(work);
    h.every.fire();
    await settle(() => h.out.text().includes('halt: 002-work'));

    assert.equal(h.played.length, 1);
    assert.equal(h.played[0], AT);
    assert.equal(h.input.keyCalls, 1);

    h.input.pushKey('q');
    await h.done;
    assert.equal(h.every.cancelCalls, 1);
    assert.equal(h.current().closed, true);
  });

  it('never sounds while a card is open and picks up a new item after the key', async () => {
    await createChange(tmpDir, '001-base', 'Base');
    const h = startSession();
    await settle(() => h.out.text().includes('Needs you (1):'));
    assert.equal(h.played.length, 0);

    const work = await createChange(tmpDir, '002-work', 'Work');
    await approve(work);
    await writeDead(work);
    assert.equal(h.played.length, 0);

    h.input.pushKey('z');
    await settle(() => h.out.text().includes('Needs you (2):'));
    assert.equal(h.played.length, 0);
    assert.deepEqual(cardHeaders(h.out.text()), ['approval: 001-base', 'approval: 001-base']);

    h.input.pushKey('q');
    await h.done;
  });

  it('ignores an unknown key and shows the same card', async () => {
    await createChange(tmpDir, '001-base', 'Base');
    const h = startSession();
    h.input.pushKey('z');
    h.input.pushKey('q');
    await h.done;

    assert.deepEqual(h.launched, []);
    assert.deepEqual(cardHeaders(h.out.text()), ['approval: 001-base', 'approval: 001-base']);
  });

  it('quits on q on a card without launching anything', async () => {
    await createChange(tmpDir, '001-base', 'Base');
    const h = startSession();
    await settle(() => h.out.text().includes('Needs you (1):'));
    h.input.pushKey('q');
    await h.done;

    assert.deepEqual(h.launched, []);
    assert.equal(h.played.length, 0);
  });

  it('quits on q while waiting and closes the watch', async () => {
    const work = await createChange(tmpDir, '002-work', 'Work');
    await approve(work);
    const h = startSession();
    await settle(() => h.watcherCalls.length >= 1);
    h.input.pushKey('q');
    await h.done;

    assert.equal(h.every.cancelCalls, 1);
    assert.equal(h.current().closed, true);
  });

  it('ends when the signal aborts while a card is open', async () => {
    await createChange(tmpDir, '001-base', 'Base');
    const controller = new AbortController();
    const h = startSession({ signal: controller.signal });
    await settle(() => h.out.text().includes('Needs you (1):'));
    controller.abort();
    await h.done;

    assert.deepEqual(h.launched, []);
  });

  it('ends when the signal aborts while waiting', async () => {
    const work = await createChange(tmpDir, '002-work', 'Work');
    await approve(work);
    const controller = new AbortController();
    const h = startSession({ signal: controller.signal });
    await settle(() => h.watcherCalls.length >= 1);
    controller.abort();
    await h.done;

    assert.equal(h.every.cancelCalls, 1);
  });
});
