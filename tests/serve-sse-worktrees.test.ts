import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { defineConfig } from '../src/core/foundation/config.js';
import type { ChangeTree } from '../src/core/status/change-locations.js';
import {
  type InvalidationBatch,
  type ScheduleFn,
  type TimerHandle,
  type WatchEvent,
  type WatchOptions,
  type WatcherFactory,
  type WatcherLike,
  createInvalidationHub,
} from '../src/core/web/web-events.js';
import { type WebServerHandle, startWebServer } from '../src/core/web/web-server.js';

const execFileAsync = promisify(execFile);

const tmpDirs: string[] = [];
const handles: WebServerHandle[] = [];

afterEach(async () => {
  while (handles.length > 0) {
    const handle = handles.pop();
    if (handle) await handle.close();
  }
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

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

/** A temporary repository with a local identity, ready for a first commit. */
async function initRepo(dir: string): Promise<void> {
  await git(['init', '-q', '-b', 'main'], dir);
  await git(['config', 'user.name', 'osq'], dir);
  await git(['config', 'user.email', 'osq@example.invalid'], dir);
}

/** Write one active change folder with a proposal and a task. */
async function writeChange(root: string, folder: string): Promise<void> {
  const dir = path.join(root, 'openspec', 'changes', folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), '# proposal\n', 'utf8');
}

/** A `ChangeTree` shaped like `changeTrees` returns, without touching git. */
function fakeTree(root: string, worktreeFolder?: string): ChangeTree {
  const changesDir = path.join(root, 'openspec', 'changes');
  return {
    root,
    ...(worktreeFolder !== undefined ? { worktreeFolder } : {}),
    changesDir,
    archiveDir: path.join(changesDir, 'archive'),
    rejectedDir: path.join(changesDir, 'rejected'),
  };
}

/** A chokidar-shaped watcher whose events and close calls the test controls. */
class FakeWatcher implements WatcherLike {
  closed = false;
  private readonly listeners = new Map<string, Set<(target: string) => void>>();

  on(event: WatchEvent, listener: (target: string) => void): unknown {
    const set = this.listeners.get(event) ?? new Set<(target: string) => void>();
    set.add(listener);
    this.listeners.set(event, set);
    return undefined;
  }

  emit(event: WatchEvent, target: string): void {
    for (const listener of this.listeners.get(event) ?? []) listener(target);
  }

  async close(): Promise<void> {
    this.closed = true;
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

describe('invalidation across osq worktrees', () => {
  it('watches each worktree change folder and invalidates its numeric id', () => {
    const watcher = new FakeWatcher();
    const { factory, calls } = fakeWatcherFactory(watcher);
    const scheduler = new ManualScheduler();
    const checkout = fakeTree(path.resolve('/tmp/osq-serve-checkout'));
    const worktree = fakeTree(path.resolve('/tmp/osq-serve-worktrees/001-a'), '001-a');
    const hub = createInvalidationHub({
      projectRoot: checkout.root,
      openspecRoot: 'openspec',
      debounceMs: 50,
      trees: [checkout, worktree],
      watch: factory,
      schedule: scheduler.schedule,
    });
    const batches: InvalidationBatch[] = [];
    hub.subscribe((batch) => batches.push(batch));

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].paths, [
      path.join(checkout.root, 'openspec'),
      path.join(worktree.changesDir, '001-a'),
    ]);

    watcher.emit('change', path.join(worktree.changesDir, '001-a', 'brief.md'));
    scheduler.fire();
    assert.deepEqual(batches, [{ ids: [1] }]);

    watcher.emit('change', path.join(worktree.changesDir, '002-b', 'brief.md'));
    scheduler.fire();
    assert.deepEqual(batches, [{ ids: [1] }, { ids: [] }], 'unknown paths stay global');
  });

  it('behaves exactly as before when no trees are resolved', () => {
    const watcher = new FakeWatcher();
    const { factory, calls } = fakeWatcherFactory(watcher);
    const scheduler = new ManualScheduler();
    const projectRoot = path.resolve('/tmp/osq-serve-default');
    const hub = createInvalidationHub({
      projectRoot,
      openspecRoot: 'openspec',
      debounceMs: 50,
      watch: factory,
      schedule: scheduler.schedule,
    });
    const batches: InvalidationBatch[] = [];
    hub.subscribe((batch) => batches.push(batch));

    assert.deepEqual(calls[0].paths, [path.join(projectRoot, 'openspec')]);

    watcher.emit('change', path.join(projectRoot, 'openspec', 'changes', '007-a', 'brief.md'));
    scheduler.fire();
    assert.deepEqual(batches, [{ ids: [7] }]);
  });
});

describe('serve server wiring', () => {
  it('passes the resolved worktree trees to the invalidation hub', async () => {
    const tmp = await makeTempDir('osq-serve-worktrees-');
    const repo = path.join(tmp, 'repo');
    const wtRoot = path.join(tmp, 'worktrees');
    await fs.mkdir(repo, { recursive: true });
    await fs.mkdir(wtRoot, { recursive: true });
    await initRepo(repo);
    await writeChange(repo, '001-a');
    await git(['add', '-A'], repo);
    await git(['commit', '-qm', 'changes'], repo);
    await git(['branch', 'osq/001-a'], repo);
    const wt = path.join(wtRoot, '001-a');
    await git(['worktree', 'add', wt, 'osq/001-a'], repo);

    const config = defineConfig({
      vcs: { enabled: true, author: 'osq <osq@example.invalid>', worktreeRoot: wtRoot },
      serve: { port: 0 },
    });
    const uiDir = await makeTempDir('osq-serve-ui-');
    const homeDir = await makeTempDir('osq-serve-home-');
    const watcher = new FakeWatcher();
    const { factory, calls } = fakeWatcherFactory(watcher);
    const scheduler = new ManualScheduler();
    const handle = await startWebServer({
      projectRoot: repo,
      config,
      uiDir,
      home: homeDir,
      watch: factory,
      schedule: scheduler.schedule,
    });
    handles.push(handle);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].paths[0], path.join(repo, 'openspec'));
    assert.equal(
      await fs.realpath(calls[0].paths[1]),
      path.join(await fs.realpath(wt), 'openspec', 'changes', '001-a'),
    );
  });
});
