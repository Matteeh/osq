import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { inboxDispatchCommand } from '../src/cli/inbox-dispatch.js';
import { type OsqConfig, defineConfig, loadConfig } from '../src/core/foundation/config.js';
import type { EveryFn } from '../src/core/status/dispatch-follow.js';
import type { CardInput } from '../src/core/status/dispatch-session.js';
import type {
  ScheduleFn,
  TimerHandle,
  WatchOptions,
  WatcherFactory,
  WatcherLike,
} from '../src/core/web/web-events.js';
import { runCliCaptured } from './cli-capture.js';

const CHANGES = path.join('openspec', 'changes');
const BELL = '\u0007';

let project: string;
let home: string;
let config: OsqConfig;

beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inputs-inbox-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inputs-inbox-home-'));
  config = await loadConfig(project);
});

afterEach(async () => {
  await fs.rm(project, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
});

const PROPOSAL = [
  '---',
  'title: Demo',
  'depends_on: []',
  'verify: node verify.cjs',
  '---',
  '## Goal',
  'Demo goal.',
  '',
  '## Surface',
  'None.',
  '',
  '## Human steps',
  'None',
  '',
].join('\n');

const TASK = [
  '---',
  'title: Task one',
  'verify: node verify.cjs',
  'scope: []',
  'entry: []',
  'skills: []',
  '---',
  '## Acceptance',
  '- [ ] done',
  '',
].join('\n');

async function write(rel: string, content: string): Promise<void> {
  const target = path.join(project, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** An unapproved change, so the inbox has one approval item to show. */
async function seedChange(folderName = '001-base'): Promise<string> {
  await write(path.join(CHANGES, folderName, 'proposal.md'), PROPOSAL);
  await write(path.join(CHANGES, folderName, 'tasks', '1.md'), TASK);
  return folderName;
}

function deadMarkerPath(folderName: string, task = 1): string {
  return path.join(project, CHANGES, folderName, '.run', 'dead', `${task}.md`);
}

async function writeDead(folderName: string, task = 1): Promise<void> {
  await write(
    path.join(CHANGES, folderName, '.run', 'dead', `${task}.md`),
    '---\nreason: verify_red\n---\nboom\n',
  );
}

/** A scripted card input that quits on the first key. */
function quittingInput(): CardInput {
  return {
    key: async () => 'q',
    line: async () => null,
  };
}

interface Writers {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

interface Captured {
  readonly stdout: string;
  readonly stderr: string;
}

/** Run the command directly, proving no byte reaches the process streams. */
async function captureDirect(run: (writers: Writers) => Promise<unknown>): Promise<Captured> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const leaked: string[] = [];
  const originalStdout = process.stdout.write;
  const originalStderr = process.stderr.write;
  const record = (chunk: string | Uint8Array): boolean => {
    leaked.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  };
  process.stdout.write = record as typeof process.stdout.write;
  process.stderr.write = record as typeof process.stderr.write;
  try {
    await run({ stdout: (text) => stdout.push(text), stderr: (text) => stderr.push(text) });
  } finally {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
  }
  assert.deepEqual(leaked, [], 'the direct call wrote to a process stream');
  return { stdout: stdout.join(''), stderr: stderr.join('') };
}

/** Run the command through `runCli`, sharing the temporary home. */
async function captureCli(argv: readonly string[]): Promise<Captured> {
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const capture = await runCliCaptured(project, argv);
    assert.equal(capture.exitCode, undefined, `osq ${argv.join(' ')} exited nonzero`);
    return { stdout: capture.stdout, stderr: capture.stderr };
  } finally {
    if (originalHome === undefined) Reflect.deleteProperty(process.env, 'HOME');
    else process.env.HOME = originalHome;
  }
}

/** Run one command both ways in the same project and compare both streams. */
async function assertSame(
  argv: readonly string[],
  run: (writers: Writers) => Promise<unknown>,
): Promise<Captured> {
  const cli = await captureCli(argv);
  const direct = await captureDirect(run);
  assert.equal(direct.stdout, cli.stdout, `stdout differs for osq ${argv.join(' ')}`);
  assert.equal(direct.stderr, cli.stderr, `stderr differs for osq ${argv.join(' ')}`);
  return direct;
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

/** Manual debounce clock: nothing fires until the test calls `fire`. */
class ManualScheduler {
  private readonly timers: Array<{ callback: () => void; fired: boolean; cancelled: boolean }> = [];

  schedule: ScheduleFn = (callback, _delayMs) => {
    const timer = { callback, fired: false, cancelled: false };
    this.timers.push(timer);
    return {
      cancel: () => {
        timer.cancelled = true;
      },
    } satisfies TimerHandle;
  };

  fire(): void {
    const timer = this.timers.find((entry) => !entry.fired && !entry.cancelled);
    if (!timer) throw new Error('no pending debounce timer to fire');
    timer.fired = true;
    timer.callback();
  }
}

/** Manual poll clock: nothing fires until the test calls `fire`. */
class ManualEvery {
  private callback: (() => void) | null = null;

  every: EveryFn = (callback) => {
    this.callback = callback;
    return { cancel: () => undefined };
  };

  fire(): void {
    if (this.callback === null) throw new Error('no poll callback to fire');
    this.callback();
  }
}

/** Yield to the event loop until `predicate` holds, without a real timer. */
async function settle(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 200000; i += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('condition was never met');
}

describe('command inputs across osq inbox', () => {
  it('osq inbox prints the same text directly and through runCli', async () => {
    await seedChange();
    const direct = await assertSame(['inbox'], (writers) =>
      inboxDispatchCommand({
        cwd: project,
        config,
        home,
        isTerminal: () => false,
        ...writers,
      }),
    );
    assert.match(direct.stdout, /Needs you/);
    assert.equal(direct.stderr, '');
  });

  it('osq inbox --json prints the same text directly and through runCli', async () => {
    await seedChange();
    const direct = await assertSame(['inbox', '--json'], (writers) =>
      inboxDispatchCommand({
        cwd: project,
        config,
        home,
        json: true,
        isTerminal: () => false,
        ...writers,
      }),
    );
    assert.equal((JSON.parse(direct.stdout) as { watcherIdle: boolean }).watcherIdle, true);
    assert.equal(direct.stderr, '');
  });

  it('prints a wait-log failure line to the passed stderr', async () => {
    await seedChange();
    const fileHome = path.join(project, 'home-file');
    await fs.writeFile(fileHome, 'not a directory', 'utf8');
    const stdout: string[] = [];
    const stderr: string[] = [];

    await inboxDispatchCommand({
      cwd: project,
      config,
      home: fileHome,
      isTerminal: () => true,
      input: quittingInput(),
      launch: async () => 0,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });

    assert.match(stderr.join(''), /osq inbox: wait log: /);
    assert.ok(!stdout.join('').includes('wait log'));
  });

  it('rings the default bell through the passed stdout', async () => {
    const work = await seedChange('002-work');
    await write(path.join(CHANGES, '002-work', '.run', 'approved'), 'sha256:fixture\n');
    const controller = new AbortController();
    const stdout: string[] = [];
    const stderr: string[] = [];
    const { factory, calls } = watchFactory();
    const scheduler = new ManualScheduler();
    const every = new ManualEvery();
    const bellConfig = defineConfig({
      inbox: { sound: 'bell', pollSeconds: 12, eventDebounceMs: 100 },
    });

    const done = inboxDispatchCommand({
      cwd: project,
      config: bellConfig,
      follow: true,
      home,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
      signal: controller.signal,
      watch: factory,
      schedule: scheduler.schedule,
      every: every.every,
    });

    try {
      await settle(() => stdout.join('').includes('Waiting for new items (Ctrl-C to stop).'));
      await settle(() => calls.length >= 1);
      assert.ok(!stdout.join('').includes(BELL), 'no bell before a new item');

      await writeDead(work);
      calls[calls.length - 1]?.watcher.emit('add', deadMarkerPath(work));
      scheduler.fire();
      await settle(() => stdout.join('').includes(BELL));

      assert.ok(stdout.join('').includes(BELL));
      assert.equal(stderr.join(''), '');
    } finally {
      controller.abort();
      await done;
    }
  });
});
