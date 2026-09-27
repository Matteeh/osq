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
import { formatDispatchItemSummary, formatDispatchText } from './dispatch-text.js';
import { readDispatch } from './dispatch.js';
import type { InboxSound } from './inbox-sound.js';

/** Creates a repeating timer and returns a handle that cancels it. */
export type EveryFn = (callback: () => void, delayMs: number) => { cancel(): void };

/** Injectable seams so tests drive the follow loop without real resources. */
export interface FollowDispatchOptions {
  readonly stdout?: (message: string) => void;
  readonly stderr?: (message: string) => void;
  readonly now?: () => Date;
  readonly sound?: InboxSound;
  readonly signal?: AbortSignal;
  readonly watch?: WatcherFactory;
  readonly schedule?: ScheduleFn;
  readonly every?: EveryFn;
  readonly trees?: (projectRoot: string, config: OsqConfig) => Promise<readonly ChangeTree[]>;
}

/** Shared seams and resolved config for one follow run. */
interface FollowContext {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  readonly inbox: InboxConfig;
  readonly out: (message: string) => void;
  readonly err: (message: string) => void;
  readonly clock: () => Date;
  readonly sound: InboxSound;
  readonly every: EveryFn;
  readonly trees: (projectRoot: string, config: OsqConfig) => Promise<readonly ChangeTree[]>;
  readonly watch?: WatcherFactory;
  readonly schedule?: ScheduleFn;
}

/** Mutable state of one follow run. */
interface Follower {
  hub: InvalidationHub | null;
  unsubscribe: (() => void) | null;
  poll: TimerHandle | null;
  watchedPaths: string[];
  previous: readonly OrderedDispatchItem[];
  running: boolean;
  queued: boolean;
  closed: boolean;
}

function defaultEvery(callback: () => void, delayMs: number): { cancel(): void } {
  const timer = setInterval(callback, delayMs);
  return { cancel: () => clearInterval(timer) };
}

/** Kind, change folder, and task number as one identity. */
function identityOf(item: OrderedDispatchItem): string {
  return `${item.kind}\u0000${item.change.folder}\u0000${item.task?.number ?? ''}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function samePaths(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Fill every context seam from `options`, keeping the real default otherwise. */
function followContext(
  projectRoot: string,
  config: OsqConfig,
  options: FollowDispatchOptions,
): FollowContext {
  return {
    projectRoot,
    config,
    inbox: config.inbox ?? DEFAULT_INBOX_CONFIG,
    out: options.stdout ?? ((message) => process.stdout.write(message)),
    err: options.stderr ?? ((message) => process.stderr.write(message)),
    clock: options.now ?? (() => new Date()),
    sound: options.sound ?? { notify: () => undefined },
    every: options.every ?? defaultEvery,
    trees: options.trees ?? changeTrees,
    ...(options.watch ? { watch: options.watch } : {}),
    ...(options.schedule ? { schedule: options.schedule } : {}),
  };
}

/** Print `+` lines for new items and `-` lines for departed ones, in order. */
function followDelta(
  follower: Follower,
  items: readonly OrderedDispatchItem[],
  at: Date,
  out: (message: string) => void,
): boolean {
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const before = new Set(follower.previous.map(identityOf));
  const after = new Set(items.map(identityOf));
  let appeared = 0;
  for (const item of items) {
    if (before.has(identityOf(item))) continue;
    out(`${time} + ${formatDispatchItemSummary(item)}\n`);
    appeared += 1;
  }
  for (const item of follower.previous) {
    if (after.has(identityOf(item))) continue;
    out(`${time} - ${formatDispatchItemSummary(item)}\n`);
  }
  follower.previous = items;
  return appeared > 0;
}

/** One derivation of the queue and its delta, sounding once per new batch. */
async function deriveOnce(follower: Follower, ctx: FollowContext): Promise<void> {
  const at = ctx.clock();
  const dispatch = await readDispatchItems(ctx.projectRoot, ctx.config);
  const items = await orderDispatchItems(ctx.projectRoot, ctx.config, dispatch);
  if (followDelta(follower, items, at, ctx.out)) ctx.sound.notify(at);
}

/** Watch `trees` with a fresh hub, replacing the current subscription. */
function openFollowerHub(
  follower: Follower,
  ctx: FollowContext,
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
  follower.hub = hub;
  follower.watchedPaths = paths;
  follower.unsubscribe = hub.subscribe(() => {
    void runFollower(follower, ctx);
  });
}

/** Re-read the trees; when their watched paths changed, replace the hub. */
async function refreshTrees(follower: Follower, ctx: FollowContext): Promise<boolean> {
  const trees = await ctx.trees(ctx.projectRoot, ctx.config);
  const paths = treeWatchPaths(ctx.projectRoot, ctx.config.paths.openspecRoot, trees);
  if (samePaths(paths, follower.watchedPaths)) return false;
  const old = follower.hub;
  follower.unsubscribe?.();
  follower.unsubscribe = null;
  follower.hub = null;
  await old?.close();
  openFollowerHub(follower, ctx, trees, paths);
  return true;
}

/** Derive once at a time; a batch or poll during one queues one more. */
async function runFollower(follower: Follower, ctx: FollowContext): Promise<void> {
  if (follower.closed) return;
  if (follower.running) {
    follower.queued = true;
    return;
  }
  follower.running = true;
  try {
    do {
      follower.queued = false;
      await deriveOnce(follower, ctx);
    } while (!follower.closed && (await refreshTrees(follower, ctx)));
  } catch (error) {
    ctx.err(`osq inbox: ${messageOf(error)}\n`);
  } finally {
    follower.running = false;
  }
  if (follower.queued && !follower.closed) await runFollower(follower, ctx);
}

/** Resolve once `signal` aborts, after closing the hub and cancelling the poll. */
function waitForAbort(follower: Follower, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => {
      if (follower.closed) return;
      follower.closed = true;
      follower.poll?.cancel();
      follower.poll = null;
      follower.unsubscribe?.();
      follower.unsubscribe = null;
      void follower.hub?.close();
      follower.hub = null;
      resolve();
    };
    if (signal === undefined) return;
    if (signal.aborted) finish();
    else signal.addEventListener('abort', finish, { once: true });
  });
}

/**
 * Print the current dispatch text, then follow the change trees and the poll
 * timer, printing each item that appears or departs and sounding for new ones.
 * Resolves when `options.signal` aborts; otherwise it follows until interrupted.
 */
export async function followDispatch(
  projectRoot: string,
  config: OsqConfig,
  options: FollowDispatchOptions = {},
): Promise<void> {
  const ctx = followContext(projectRoot, config, options);
  const follower: Follower = {
    hub: null,
    unsubscribe: null,
    poll: null,
    watchedPaths: [],
    previous: [],
    running: false,
    queued: false,
    closed: false,
  };
  const initialTrees = await ctx.trees(projectRoot, config);
  openFollowerHub(
    follower,
    ctx,
    initialTrees,
    treeWatchPaths(projectRoot, config.paths.openspecRoot, initialTrees),
  );
  const preview = await readDispatch(projectRoot, config);
  ctx.out(`${formatDispatchText(preview)}\n`);
  ctx.out('Waiting for new items (Ctrl-C to stop).\n');
  follower.previous = preview.items;
  follower.poll = ctx.every(() => {
    void runFollower(follower, ctx);
  }, ctx.inbox.pollSeconds * 1000);
  void runFollower(follower, ctx);
  await waitForAbort(follower, options.signal);
}
