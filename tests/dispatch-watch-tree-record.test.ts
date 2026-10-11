import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { scenario } from '@matteeh/osq/testing';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import type { OrderedDispatchItem } from '../src/core/status/dispatch-order.js';
import type { EveryFn } from '../src/core/status/dispatch-watch.js';
import {
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

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHANGE_SLUG = '176-event-driven-follow';
const AUTHOR = 'Osq Author <author@example.invalid>';
const AT = new Date(2026, 0, 1, 9, 30);

/**
 * The living `status-inspection` spec has two scenarios named "Archived change
 * that needs steering" (under "Change next step" and "Dispatch items"), so
 * `lookupScenario` refuses every lookup for that capability. Build a lookup root
 * from a copy of the real spec with that one duplicate name removed, merge this
 * change's real delta while it exists, and point the lookup there. The living
 * spec itself is never touched.
 */
const DUPLICATE_SCENARIO = '#### Scenario: Archived change that needs steering';

const tmpDirs: string[] = [];

/** Remove every temporary directory this file created. */
async function cleanupDirs(): Promise<void> {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

after(cleanupDirs);

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

async function exists(target: string): Promise<boolean> {
  return fs
    .access(target)
    .then(() => true)
    .catch(() => false);
}

/** Rename every copy but the first of a repeated scenario header, removing a duplicate. */
function dedupeScenarioNames(content: string): string {
  const parts = content.split(DUPLICATE_SCENARIO);
  if (parts.length <= 1) return content;
  return parts
    .map((part, position) => (position === 0 ? part : `${DUPLICATE_SCENARIO} (${position})${part}`))
    .join('');
}

/** Build a lookup root holding the real spec without its duplicate scenario name. */
async function setupLookupRoot(): Promise<string> {
  const root = await makeTempDir('osq-dispatch-record-lookup-');
  const openspec = path.join(root, 'openspec');
  const specDir = path.join(openspec, 'specs', 'status-inspection');
  await fs.mkdir(specDir, { recursive: true });
  const living = await fs.readFile(
    path.join(REPO_ROOT, 'openspec', 'specs', 'status-inspection', 'spec.md'),
    'utf8',
  );
  await fs.writeFile(path.join(specDir, 'spec.md'), dedupeScenarioNames(living), 'utf8');

  const deltaDir = path.join(openspec, 'changes', CHANGE_SLUG, 'specs', 'status-inspection');
  await fs.mkdir(deltaDir, { recursive: true });
  const deltaSource = path.join(
    REPO_ROOT,
    'openspec',
    'changes',
    CHANGE_SLUG,
    'specs',
    'status-inspection',
    'spec.md',
  );
  if (await exists(deltaSource)) await fs.copyFile(deltaSource, path.join(deltaDir, 'spec.md'));
  return path.join(openspec, 'changes', CHANGE_SLUG);
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
async function initRepo(dir: string): Promise<void> {
  await git(['init', '-q', '-b', 'main'], dir);
  await git(['config', 'user.name', 'osq'], dir);
  await git(['config', 'user.email', 'osq@example.invalid'], dir);
  await fs.writeFile(path.join(dir, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], dir);
  await git(['commit', '-qm', 'init'], dir);
}

/** A fresh checkout repository rooted at a temporary parent. */
async function makeRepo(prefix: string): Promise<string> {
  const parent = await makeTempDir(prefix);
  const repo = path.join(parent, 'repo');
  await fs.mkdir(repo);
  await initRepo(repo);
  return repo;
}

function enabledConfig(): OsqConfig {
  return defineConfig({
    vcs: { enabled: true, author: AUTHOR },
    inbox: { pollSeconds: 12, eventDebounceMs: 100 },
  });
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
  readonly schedule: ScheduleFn = (callback, _delayMs) => {
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

  every: EveryFn = (callback, delayMs) => {
    this.callback = callback;
    this.delayMs = delayMs;
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

/** Start the dispatch watch with fake watcher and manual poll seams. */
function startWatch(root: string, config: OsqConfig): WatchHarness {
  const derivations: Derivation[] = [];
  const errors: string[] = [];
  const scheduler = new ImmediateScheduler();
  const every = new ManualEvery();
  const { factory, calls } = watchFactory();
  let treeCalls = 0;
  const trees: TreesFn = async (projectRoot, cfg) => {
    treeCalls += 1;
    return [singleChangeTree(projectRoot, cfg.paths.openspecRoot)];
  };
  const options: WatchDispatchOptions = {
    stderr: (message) => errors.push(message),
    now: () => AT,
    schedule: scheduler.schedule,
    every: every.every,
    trees,
    watch: factory,
  };
  const watch = watchDispatch(root, config, options, (items, at) => {
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
  for (let i = 0; i < 400000; i += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('condition was never met');
}

/** Start the watch and return the paths its first fake watcher was given. */
async function watchedPaths(root: string, config: OsqConfig): Promise<string[]> {
  const h = startWatch(root, config);
  await settle(() => h.derivations.length >= 1);
  const paths = [...(h.watcherCalls[0]?.paths ?? [])];
  await h.stop();
  return paths;
}

interface FireOutcome {
  readonly derivedAgain: boolean;
  readonly treesReadAgain: boolean;
}

/** Fire the record path and report whether the watch derived and re-read trees. */
async function recordFires(root: string, config: OsqConfig): Promise<FireOutcome> {
  const h = startWatch(root, config);
  await settle(() => h.derivations.length >= 1);
  const derivationsBefore = h.derivations.length;
  const treesBefore = h.treeCount();

  h.current().emit('change', path.join(root, '.git', 'osq-trees.jsonl'));
  await settle(() => h.derivations.length > derivationsBefore);

  const outcome = {
    derivedAgain: h.derivations.length > derivationsBefore,
    treesReadAgain: h.treeCount() > treesBefore,
  };
  await h.stop();
  return outcome;
}

describe('dispatch watch tree record', () => {
  let previousChange: string | undefined;

  before(async () => {
    previousChange = process.env.OSQ_CHANGE;
    process.env.OSQ_CHANGE = await setupLookupRoot();
  });

  after(() => {
    if (previousChange === undefined) Reflect.deleteProperty(process.env, 'OSQ_CHANGE');
    else process.env.OSQ_CHANGE = previousChange;
  });

  scenario(
    'status-inspection',
    'Tree record watched',
    { covers: (root: string, config: OsqConfig) => watchedPaths(root, config) },
    async ({ run, then }) => {
      const root = await makeRepo('osq-dispatch-record-watch-');
      const paths = await run(root, enabledConfig());
      await then(
        'the fake watcher is given `<checkout>/.git/osq-trees.jsonl` among its paths',
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
    'status-inspection',
    'Tree record fires',
    { covers: (root: string, config: OsqConfig) => recordFires(root, config) },
    async ({ run, then }) => {
      const root = await makeRepo('osq-dispatch-record-fires-');
      const result = await run(root, enabledConfig());
      await then('`onItems` is called again and `options.trees` is read again', () => {
        assert.equal(result.derivedAgain, true, 'onItems was not called again');
        assert.equal(result.treesReadAgain, true, 'options.trees was not read again');
      });
    },
  );
});
