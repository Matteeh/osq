import type http from 'node:http';
import path from 'node:path';
import { watch } from 'chokidar';
import type { ChangeTree } from '../status/change-locations.js';
import { classifyTreePath, singleChangeTree, treeWatchPaths } from './web-trees.js';

/** Re-exported for focused callers that classify a single tree's paths. */
export { classifyChangePath } from './web-trees.js';

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

/** Create the one watcher and debounce accumulator owned by a server. */
export function createInvalidationHub(options: InvalidationHubOptions): InvalidationHub {
  const trees = options.trees ?? [singleChangeTree(options.projectRoot, options.openspecRoot)];
  const watched = treeWatchPaths(options.projectRoot, options.openspecRoot, trees);
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

  const watcher = factory(watched, { ignoreInitial: true });
  for (const event of WATCHED_EVENTS) {
    watcher.on(event, (target) => {
      if (closed || typeof target !== 'string') return;
      const id = classifyTreePath(path.resolve(target), trees);
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
