import { DEFAULT_INBOX_CONFIG } from '../foundation/config-inbox.js';
import type { OsqConfig } from '../foundation/config.js';
import type { ChangeTree } from '../status/change-locations.js';
import { changeTrees } from '../status/change-locations.js';
import type { EveryFn, TreesFn } from '../status/dispatch-watch.js';
import { treeRecordPath } from '../vcs/tree-record.js';
import {
  type InvalidationBatch,
  type InvalidationHub,
  type ScheduleFn,
  type TimerHandle,
  type WatcherFactory,
  createInvalidationHub,
} from './web-events.js';
import { treeWatchPaths } from './web-trees.js';

/** Options for a hub that resolves the change trees and tree record itself. */
export interface TreeHubOptions {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  /** Debounce window for one filesystem batch, in milliseconds. */
  readonly debounceMs: number;
  /** Resolves the change trees, as `changeTrees` does. */
  readonly trees?: TreesFn;
  /** Repeating timer seam for the `inbox.pollSeconds` re-resolution. */
  readonly every?: EveryFn;
  readonly watch?: WatcherFactory;
  readonly schedule?: ScheduleFn;
}

/** Mutable state of one tree hub run. */
interface TreeHubState {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  readonly debounceMs: number;
  readonly listTrees: TreesFn;
  readonly every: EveryFn;
  readonly pollSeconds: number;
  readonly recordPath: string | null;
  readonly watch?: WatcherFactory;
  readonly schedule?: ScheduleFn;
  readonly listeners: Set<(batch: InvalidationBatch) => void>;
  current: InvalidationHub | null;
  watched: string[];
  poll: TimerHandle | null;
  resolving: boolean;
  queued: boolean;
  closed: boolean;
}

/** The default poll: a repeating timer that never holds the process alive. */
function defaultEvery(callback: () => void, delayMs: number): TimerHandle {
  const timer = setInterval(callback, delayMs);
  timer.unref();
  return { cancel: () => clearInterval(timer) };
}

function samePaths(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Open a hub over one tree set and forward every batch, then re-resolve. */
function openHub(state: TreeHubState, trees: readonly ChangeTree[]): InvalidationHub {
  const inner = createInvalidationHub({
    projectRoot: state.projectRoot,
    openspecRoot: state.config.paths.openspecRoot,
    debounceMs: state.debounceMs,
    trees,
    ...(state.recordPath !== null ? { recordPath: state.recordPath } : {}),
    ...(state.watch ? { watch: state.watch } : {}),
    ...(state.schedule ? { schedule: state.schedule } : {}),
  });
  inner.subscribe((batch) => {
    if (state.closed) return;
    for (const listener of [...state.listeners]) listener(batch);
    void resolveTrees(state);
  });
  return inner;
}

/** One tree resolution: swap hubs when the watched paths changed. */
async function resolveOnce(state: TreeHubState): Promise<void> {
  let trees: readonly ChangeTree[];
  try {
    trees = await state.listTrees(state.projectRoot, state.config);
  } catch {
    return;
  }
  if (state.closed) return;
  const paths = treeWatchPaths(state.projectRoot, state.config.paths.openspecRoot, trees);
  if (samePaths(paths, state.watched)) return;
  const previous = state.current;
  state.current = openHub(state, trees);
  state.watched = paths;
  await previous?.close();
  if (state.closed) return;
  for (const listener of [...state.listeners]) listener({ ids: [] });
}

/** Run resolutions one at a time; one arriving during another queues one more. */
async function resolveTrees(state: TreeHubState): Promise<void> {
  if (state.closed) return;
  if (state.resolving) {
    state.queued = true;
    return;
  }
  state.resolving = true;
  try {
    do {
      state.queued = false;
      await resolveOnce(state);
    } while (state.queued && !state.closed);
  } finally {
    state.resolving = false;
  }
}

/**
 * Create the invalidation hub `osq serve` owns. It resolves the change trees
 * and the tree record once, re-resolves the trees after every batch and every
 * `inbox.pollSeconds`, opens a fresh hub when the watched paths changed, and
 * tells its subscribers about the swap with an empty id batch.
 *
 * @scenario web-inspection: Tree record in the server's watch
 * @scenario web-inspection: Tree record change
 * @scenario web-inspection: New worktree while serving
 * @scenario web-inspection: Poll finds a new worktree
 * @scenario web-inspection: Server closes the poll
 * @adr 013
 */
export async function createTreeHub(options: TreeHubOptions): Promise<InvalidationHub> {
  const { projectRoot, config } = options;
  const listTrees = options.trees ?? changeTrees;
  const every = options.every ?? defaultEvery;
  const inbox = config.inbox ?? DEFAULT_INBOX_CONFIG;
  const recordPath = await treeRecordPath(projectRoot, config);
  const initial = await listTrees(projectRoot, config);
  const state: TreeHubState = {
    projectRoot,
    config,
    debounceMs: options.debounceMs,
    listTrees,
    every,
    pollSeconds: inbox.pollSeconds,
    recordPath,
    ...(options.watch ? { watch: options.watch } : {}),
    ...(options.schedule ? { schedule: options.schedule } : {}),
    listeners: new Set(),
    current: null,
    watched: treeWatchPaths(projectRoot, config.paths.openspecRoot, initial),
    poll: null,
    resolving: false,
    queued: false,
    closed: false,
  };
  state.current = openHub(state, initial);
  state.poll = every(() => {
    void resolveTrees(state);
  }, state.pollSeconds * 1000);

  return {
    subscribe(listener) {
      if (state.closed) return () => undefined;
      state.listeners.add(listener);
      return () => {
        state.listeners.delete(listener);
      };
    },
    cancelPending() {
      state.current?.cancelPending();
    },
    close() {
      if (state.closed) return Promise.resolve();
      state.closed = true;
      state.poll?.cancel();
      state.poll = null;
      state.listeners.clear();
      const inner = state.current;
      state.current = null;
      return Promise.resolve().then(() => inner?.close());
    },
  };
}
