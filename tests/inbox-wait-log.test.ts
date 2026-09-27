import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { inboxDispatchCommand } from '../src/cli/inbox-dispatch.js';
import { defineConfig } from '../src/core/foundation/config.js';
import type { EveryFn } from '../src/core/status/dispatch-follow.js';
import type { CardInput } from '../src/core/status/dispatch-session.js';
import type { InboxSound } from '../src/core/status/inbox-sound.js';
import { type WaitRecord, readWaitLog, resolveWaitLogPath } from '../src/core/status/wait-log.js';
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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-wait-log-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-wait-log-home-'));
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

/** Scripted input that drains a queue and then resolves null. */
function scriptedInput(keys: (string | null)[]): CardInput {
  return {
    async key(): Promise<string | null> {
      return keys.length > 0 ? (keys.shift() as string | null) : null;
    },
    async line(): Promise<string | null> {
      return null;
    },
  };
}

/** A `seen` record that opens an episode for one change-level approval. */
function seenApproval(change: string, at: Date): WaitRecord {
  return {
    type: 'seen',
    item: { kind: 'approval', change, task: null },
    idle: false,
    unobserved: true,
    at: at.toISOString(),
    session: 'test-session',
  };
}

async function writeWaitLog(projectRoot: string, records: readonly WaitRecord[]): Promise<void> {
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

/** Yield to the event loop until `predicate` holds, without a real timer. */
async function settle(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 200000; i += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('condition was never met');
}

function types(records: readonly WaitRecord[]): string[] {
  return records.map((record) => record.type);
}

describe('inboxDispatchCommand wait log wiring', () => {
  it('Session writes the log', async () => {
    await createChange(tmpDir, '001-base', 'Base');
    const out = collector();

    await inboxDispatchCommand({
      cwd: tmpDir,
      config: defineConfig({}),
      home,
      isTerminal: () => true,
      input: scriptedInput(['q']),
      launch: async () => 0,
      stdout: out.write,
    });

    const records = (await readWaitLog(tmpDir, home)) ?? [];
    assert.deepEqual(types(records), ['start', 'seen', 'top', 'opened', 'stop']);
    const start = records[0];
    assert.equal(start?.type === 'start' ? start.mode : null, 'cards');
    const seen = records.find((record) => record.type === 'seen');
    assert.equal(seen?.type === 'seen' ? seen.unobserved : null, true);
    assert.deepEqual(seen?.type === 'seen' ? seen.item : null, {
      kind: 'approval',
      change: '001-base',
      task: null,
    });
  });

  it('Follow writes the log', async () => {
    await createChange(tmpDir, '001-base', 'Base');
    const controller = new AbortController();
    const factory = watchFactory();
    const every = new ManualEvery();
    const scheduler = new ImmediateScheduler();
    const { sound } = recordingSound();
    const out = collector();
    const config = defineConfig({ inbox: { pollSeconds: 12, eventDebounceMs: 100 } });
    let trees = 0;

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
      trees: async (projectRoot, cfg) => {
        trees += 1;
        return [singleChangeTree(projectRoot, cfg.paths.openspecRoot)];
      },
    });
    await settle(() => trees >= 2);
    controller.abort();
    await done;

    const records = (await readWaitLog(tmpDir, home)) ?? [];
    const start = records.find((record) => record.type === 'start');
    assert.equal(start?.type === 'start' ? start.mode : null, 'follow');
    assert.ok(records.some((record) => record.type === 'stop'));
  });

  it('Printing writes nothing', async () => {
    await createChange(tmpDir, '001-base', 'Base');
    const config = defineConfig({});

    const out = collector();
    await inboxDispatchCommand({
      cwd: tmpDir,
      config,
      home,
      isTerminal: () => false,
      stdout: out.write,
    });
    const jsonOut = collector();
    await inboxDispatchCommand({
      cwd: tmpDir,
      config,
      home,
      json: true,
      stdout: jsonOut.write,
    });

    assert.equal(await fs.stat(path.join(home, '.osq')).catch(() => null), null);
  });

  it('Printed order uses first seen', async () => {
    await createChange(tmpDir, '001-base', 'Base');
    await createChange(tmpDir, '002-base', 'Base two');
    await writeWaitLog(tmpDir, [seenApproval('002-base', new Date(2026, 0, 1, 9, 5))]);
    const out = collector();

    await inboxDispatchCommand({
      cwd: tmpDir,
      config: defineConfig({}),
      home,
      isTerminal: () => false,
      stdout: out.write,
    });

    const lines = out.text().split('\n');
    const higher = lines.findIndex((line) => line.includes('approval 002'));
    const lower = lines.findIndex((line) => line.includes('approval 001'));
    assert.ok(higher !== -1 && lower !== -1);
    assert.ok(higher < lower, `002 should print before 001:\n${out.text()}`);
  });
});
