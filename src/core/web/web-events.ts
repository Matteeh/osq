import type http from 'node:http';
import path from 'node:path';
import { watch } from 'chokidar';
import type { ChangeTree } from '../status/change-locations.js';
import { numericIdOf } from './web-data-folders.js';

/** Framed invalidation payload: affected numeric ids, empty for shared documents. */
export interface InvalidationBatch {
  readonly ids: readonly number[];
}

/** Watcher events that can change dashboard documents. */
export type WatchEvent = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | 'error';

/** Minimal chokidar-compatible seam so focused tests can inject a fake watcher. */
export interface WatcherLike {
  on(event: WatchEvent, listener: (target: string) => void): unknown;
  close(): Promise<void>;
}

export interface WatchOptions {
  readonly ignoreInitial: boolean;
}

export type WatcherFactory = (paths: readonly string[], options: WatchOptions) => WatcherLike;

/** Cancellable debounce timer seam for deterministic tests. */
export interface TimerHandle {
  cancel(): void;
}

export type ScheduleFn = (callback: () => void, delayMs: number) => TimerHandle;

export interface InvalidationHubOptions {
  readonly projectRoot: string;
  readonly openspecRoot: string;
  readonly debounceMs: number;
  /**
   * Resolved change trees for callers that can await `changeTrees`. When
   * absent, the single tree of today's canonical layout is used.
   */
  readonly trees?: readonly ChangeTree[];
  readonly watch?: WatcherFactory;
  readonly schedule?: ScheduleFn;
}

/** One server-owned subscription surface; clients never create a watcher. */
export interface InvalidationHub {
  subscribe(listener: (batch: InvalidationBatch) => void): () => void;
  cancelPending(): void;
  close(): Promise<void>;
}

/** SSE response headers shared by GET and HEAD. */
export const SSE_HEADERS: http.OutgoingHttpHeaders = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-store',
  Connection: 'keep-alive',
};

const WATCHED_EVENTS: readonly WatchEvent[] = ['add', 'change', 'unlink', 'addDir', 'unlinkDir'];

function defaultWatch(paths: readonly string[], options: WatchOptions): WatcherLike {
  const watcher = watch([...paths], { ignoreInitial: options.ignoreInitial });
  const emitter = watcher as unknown as {
    on(event: string, listener: (target: string) => void): unknown;
    close(): Promise<void>;
  };
  return {
    on: (event, listener) => emitter.on(event, listener),
    close: () => watcher.close(),
  };
}

function defaultSchedule(callback: () => void, delayMs: number): TimerHandle {
  const timer = setTimeout(callback, delayMs);
  return { cancel: () => clearTimeout(timer) };
}

function folderKeyWithin(base: string, target: string): string | null {
  const relative = path.relative(base, target);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  const key = relative.split(path.sep)[0];
  return key === undefined || key === '' || key === '.' ? null : key;
}

/**
 * Leading numeric id for a path inside exactly one change folder, or `null`
 * when the path belongs to shared state: capability specs, root layout, or an
 * unrecognized folder.
 */
export function classifyChangePath(
  target: string,
  changesDir: string,
  archiveDir: string,
  rejectedDir: string,
): number | null {
  for (const base of [archiveDir, rejectedDir]) {
    const key = folderKeyWithin(base, target);
    if (key !== null) return numericIdOf(key);
  }
  const key = folderKeyWithin(changesDir, target);
  if (key === null || key === 'archive' || key === 'rejected') return null;
  return numericIdOf(key);
}

/**
 * The one tree changes live in, built synchronously for direct callers such as
 * focused tests. `changeTrees` is async only because a later stage adds
 * worktree discovery, so this mirrors the single tree it returns today.
 */
function singleChangeTree(projectRoot: string, openspecRoot: string): ChangeTree {
  const root = path.resolve(projectRoot);
  const changesDir = path.join(root, openspecRoot, 'changes');
  return {
    root,
    changesDir,
    archiveDir: path.join(changesDir, 'archive'),
    rejectedDir: path.join(changesDir, 'rejected'),
  };
}

/** Create the one watcher and debounce accumulator owned by a server. */
export function createInvalidationHub(options: InvalidationHubOptions): InvalidationHub {
  const tree = options.trees?.[0] ?? singleChangeTree(options.projectRoot, options.openspecRoot);
  const changesDir = path.resolve(tree.changesDir);
  const archiveDir = path.resolve(tree.archiveDir);
  const rejectedDir = path.resolve(tree.rejectedDir);
  const root = path.resolve(options.projectRoot, options.openspecRoot);
  const factory = options.watch ?? defaultWatch;
  const schedule = options.schedule ?? defaultSchedule;

  const listeners = new Set<(batch: InvalidationBatch) => void>();
  const ids = new Set<number>();
  let global = false;
  let pending: TimerHandle | null = null;
  let sequence = 0;
  let closed = false;
  let closing: Promise<void> | null = null;

  function emitBatch(): void {
    const batch: InvalidationBatch = { ids: global ? [] : [...ids].sort((a, b) => a - b) };
    ids.clear();
    global = false;
    for (const listener of [...listeners]) listener(batch);
  }

  function cancelPending(): void {
    sequence += 1;
    if (pending !== null) {
      pending.cancel();
      pending = null;
    }
    ids.clear();
    global = false;
  }

  const watcher = factory([root], { ignoreInitial: true });
  for (const event of WATCHED_EVENTS) {
    watcher.on(event, (target) => {
      if (closed || typeof target !== 'string') return;
      const id = classifyChangePath(path.resolve(target), changesDir, archiveDir, rejectedDir);
      if (id === null) global = true;
      else ids.add(id);
      if (pending === null) {
        sequence += 1;
        const token = sequence;
        pending = schedule(() => {
          if (closed || token !== sequence) return;
          pending = null;
          emitBatch();
        }, options.debounceMs);
      }
    });
  }
  watcher.on('error', () => undefined);

  return {
    subscribe(listener) {
      if (closed) return () => undefined;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    cancelPending,
    close() {
      if (closing !== null) return closing;
      closed = true;
      cancelPending();
      listeners.clear();
      closing = Promise.resolve().then(() => watcher.close());
      return closing;
    },
  };
}

/** The exact wire frame for one debounced invalidation. */
export function formatChangedEvent(ids: readonly number[]): string {
  return `event: changed\ndata: ${JSON.stringify({ ids })}\n\n`;
}

/** One broadcast surface for every connected `/api/events` response. */
export interface EventStream {
  handle(res: http.ServerResponse, head: boolean): void;
  close(): void;
}

/** Track connected SSE responses and fan out one frame per derived batch. */
export function createEventStream(hub: InvalidationHub): EventStream {
  const clients = new Set<http.ServerResponse>();
  const unsubscribe = hub.subscribe((batch) => {
    const frame = formatChangedEvent(batch.ids);
    for (const res of clients) {
      if (!res.writableEnded) res.write(frame);
    }
  });
  return {
    handle(res, head) {
      if (head) {
        res.writeHead(200, SSE_HEADERS);
        res.end();
        return;
      }
      res.writeHead(200, SSE_HEADERS);
      res.flushHeaders();
      clients.add(res);
      const remove = (): void => {
        clients.delete(res);
      };
      res.on('close', remove);
      res.on('error', remove);
    },
    close() {
      unsubscribe();
      for (const res of clients) {
        if (!res.writableEnded) res.end();
      }
      clients.clear();
    },
  };
}
