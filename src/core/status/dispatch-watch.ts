import { DEFAULT_INBOX_CONFIG, type InboxConfig } from '../foundation/config-inbox.js';
import type { OsqConfig } from '../foundation/config.js';
import {
  type InvalidationHub,
  type ScheduleFn,
  type TimerHandle,
  type WatcherFactory,
  createInvalidationHub,
} from '../web/web-events.js';
import { treeWatchPaths } from '../web/web-trees.js';
import { type ChangeTree, changeTrees } from './change-locations.js';
import { readDispatchItems } from './dispatch-items.js';
import { type OrderedDispatchItem, orderDispatchItems } from './dispatch-order.js';

/** Creates a repeating timer and returns a handle that cancels it. */
export type EveryFn = (callback: () => void, delayMs: number) => { cancel(): void };

/** Resolves the change trees for a project, as `changeTrees` does. */
export type TreesFn = (projectRoot: string, config: OsqConfig) => Promise<readonly ChangeTree[]>;

/** Injectable seams so tests drive the watch loop without real resources. */
export interface WatchDispatchOptions {
  readonly stderr?: (message: string) => void;
  readonly now?: () => Date;
  readonly watch?: WatcherFactory;
  readonly schedule?: ScheduleFn;
  readonly every?: EveryFn;
  readonly trees?: TreesFn;
}

/** Called with each derivation's ordered items and the time it started. */
export type OnItems = (items: readonly OrderedDispatchItem[], at: Date) => void;

/** A running dispatch watch; `close` stops it and releases its resources. */
export interface DispatchWatch {
  close(): Promise<void>;
}

/** Shared seams and resolved config for one watch run. */
interface WatchContext {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  readonly inbox: InboxConfig;
  readonly err: (message: string) => void;
  readonly clock: () => Date;
  readonly every: EveryFn;
  readonly trees: TreesFn;
  readonly watch?: WatcherFactory;
  readonly schedule?: ScheduleFn;
}

/** Mutable state of one watch run. */
interface WatchState {
  hub: InvalidationHub | null;
  unsubscribe: (() => void) | null;
  poll: TimerHandle | null;
  watchedPaths: string[];
  running: boolean;
  queued: boolean;
  closed: boolean;
}

function defaultEvery(callback: () => void, delayMs: number): { cancel(): void } {
  const timer = setInterval(callback, delayMs);
  return { cancel: () => clearInterval(timer) };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function samePaths(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Fill every context seam from `options`, keeping the real default otherwise. */
function watchContext(
  projectRoot: string,
  config: OsqConfig,
  options: WatchDispatchOptions,
): WatchContext {
  return {
    projectRoot,
    config,
    inbox: config.inbox ?? DEFAULT_INBOX_CONFIG,
    err: options.stderr ?? ((message) => process.stderr.write(message)),
    clock: options.now ?? (() => new Date()),
    every: options.every ?? defaultEvery,
    trees: options.trees ?? changeTrees,
    ...(options.watch ? { watch: options.watch } : {}),
    ...(options.schedule ? { schedule: options.schedule } : {}),
  };
}

/** One derivation: read and order the items, then hand them to `onItems`. */
async function deriveOnce(state: WatchState, ctx: WatchContext, onItems: OnItems): Promise<void> {
  const at = ctx.clock();
  const dispatch = await readDispatchItems(ctx.projectRoot, ctx.config);
  const items = await orderDispatchItems(ctx.projectRoot, ctx.config, dispatch);
  if (state.closed) return;
  onItems(items, at);
}

/** Watch `trees` with a fresh hub, replacing the current subscription. */
function openHub(
  state: WatchState,
  ctx: WatchContext,
  onItems: OnItems,
  trees: readonly ChangeTree[],
  paths: string[],
): void {
  const hub = createInvalidationHub({
    projectRoot: ctx.projectRoot,
    openspecRoot: ctx.config.paths.openspecRoot,
    debounceMs: ctx.inbox.eventDebounceMs,
    trees,
    ...(ctx.watch ? { watch: ctx.watch } : {}),
    ...(ctx.schedule ? { schedule: ctx.schedule } : {}),
  });
  state.hub = hub;
  state.watchedPaths = paths;
  state.unsubscribe = hub.subscribe(() => {
    void runWatch(state, ctx, onItems);
  });
}

/** Re-read the trees; when their watched paths changed, replace the hub. */
async function refreshTrees(
  state: WatchState,
  ctx: WatchContext,
  onItems: OnItems,
): Promise<boolean> {
  const trees = await ctx.trees(ctx.projectRoot, ctx.config);
  const paths = treeWatchPaths(ctx.projectRoot, ctx.config.paths.openspecRoot, trees);
  if (samePaths(paths, state.watchedPaths)) return false;
  const old = state.hub;
  state.unsubscribe?.();
  state.unsubscribe = null;
  state.hub = null;
  await old?.close();
  openHub(state, ctx, onItems, trees, paths);
  return true;
}

/** Derive once at a time; a batch or poll during one queues one more. */
async function runWatch(state: WatchState, ctx: WatchContext, onItems: OnItems): Promise<void> {
  if (state.closed) return;
  if (state.running) {
    state.queued = true;
    return;
  }
  state.running = true;
  try {
    do {
      state.queued = false;
      await deriveOnce(state, ctx, onItems);
    } while (!state.closed && (await refreshTrees(state, ctx, onItems)));
  } catch (error) {
    ctx.err(`osq inbox: ${messageOf(error)}\n`);
  } finally {
    state.running = false;
  }
  if (state.queued && !state.closed) await runWatch(state, ctx, onItems);
}

/** Open the first hub, start the poll, and derive once as soon as possible. */
async function startWatch(state: WatchState, ctx: WatchContext, onItems: OnItems): Promise<void> {
  try {
    const trees = await ctx.trees(ctx.projectRoot, ctx.config);
    if (state.closed) return;
    openHub(
      state,
      ctx,
      onItems,
      trees,
      treeWatchPaths(ctx.projectRoot, ctx.config.paths.openspecRoot, trees),
    );
    state.poll = ctx.every(() => {
      void runWatch(state, ctx, onItems);
    }, ctx.inbox.pollSeconds * 1000);
    await runWatch(state, ctx, onItems);
  } catch (error) {
    ctx.err(`osq inbox: ${messageOf(error)}\n`);
  }
}

/** Stop deriving, cancel the poll, unsubscribe, and close the hub. */
async function closeWatch(state: WatchState, started: Promise<void>): Promise<void> {
  state.closed = true;
  state.poll?.cancel();
  state.poll = null;
  state.unsubscribe?.();
  state.unsubscribe = null;
  await started;
  await state.hub?.close();
  state.hub = null;
}

/**
 * Derive the ordered dispatch items on every invalidation batch and every poll,
 * one derivation at a time, handing each to `onItems`. Resolves nothing; call
 * `close()` to stop and release the watcher and the poll timer.
 */
export function watchDispatch(
  projectRoot: string,
  config: OsqConfig,
  options: WatchDispatchOptions,
  onItems: OnItems,
): DispatchWatch {
  const ctx = watchContext(projectRoot, config, options);
  const state: WatchState = {
    hub: null,
    unsubscribe: null,
    poll: null,
    watchedPaths: [],
    running: false,
    queued: false,
    closed: false,
  };
  const started = startWatch(state, ctx, onItems);
  return {
    close: () => closeWatch(state, started),
  };
}
