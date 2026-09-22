import type { Inbox, MetricsReport, OsqInlineData, WebChange, WebGraph } from './contracts.js';
import type { Route } from './router.js';

/** The minimal response contract the data layer needs from `fetch`. */
export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (input: string) => Promise<FetchResponseLike>;

/** The minimal `changed` event contract the data layer needs. */
export interface EventSourceEvent {
  readonly data: string;
}

export interface EventSourceLike {
  addEventListener(type: 'changed', listener: (event: EventSourceEvent) => void): void;
  close(): void;
}

export interface EventSourceConstructor {
  new (url: string): EventSourceLike;
}

/** Documents currently held by the data layer. Missing means not yet loaded. */
export interface DashboardSnapshot {
  readonly report: MetricsReport | null;
  readonly graph: WebGraph | null;
  readonly inbox: Inbox | null;
  readonly change: WebChange | null;
}

export interface DashboardDataOptions {
  /** Injected documents; when omitted the typed global document is preferred. */
  readonly inline?: OsqInlineData | null;
  readonly fetch?: FetchLike;
  readonly eventSource?: EventSourceConstructor;
  /** Injectable global scope for Node tests. Defaults to `globalThis`. */
  readonly global?: GlobalScope;
}

interface GlobalScope {
  readonly __OSQ_DATA__?: OsqInlineData;
  readonly EventSource?: EventSourceConstructor;
}

export interface DashboardData {
  /** True when a typed inline document was found. */
  readonly inline: boolean;
  /** Load the documents required by `route`, preferring inlined values. */
  load(route: Route): Promise<DashboardSnapshot>;
  /** The most recently applied snapshot. */
  snapshot(): DashboardSnapshot;
  /** Observe successfully applied refreshes. */
  subscribe(listener: (snapshot: DashboardSnapshot) => void): () => void;
  /** Close the single event source and release every listener. */
  close(): void;
}

const EMPTY_SNAPSHOT: DashboardSnapshot = { report: null, graph: null, inbox: null, change: null };
const EVENTS_PATH = '/api/events';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isReport = (value: unknown): value is MetricsReport =>
  isObject(value) && isObject(value.specs) && isObject(value.history) && isObject(value.tokens);

const isGraph = (value: unknown): value is WebGraph =>
  isObject(value) &&
  Array.isArray(value.capabilities) &&
  Array.isArray(value.changes) &&
  Array.isArray(value.edges);

const isInbox = (value: unknown): value is Inbox =>
  isObject(value) &&
  Array.isArray(value.needsYou) &&
  Array.isArray(value.running) &&
  Array.isArray(value.landed);

const isChange = (value: unknown): value is WebChange =>
  isObject(value) && typeof value.folderKey === 'string' && Array.isArray(value.tasks);

/** Parse a `changed` payload into sorted unique ids, or `null` when malformed. */
export function parseChangedIds(data: string): number[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isObject(parsed) || !Array.isArray(parsed.ids)) return null;
  const ids = new Set<number>();
  for (const value of parsed.ids) {
    if (typeof value !== 'number' || !Number.isInteger(value)) return null;
    ids.add(value);
  }
  return [...ids].sort((a, b) => a - b);
}

function resolveInline(options: DashboardDataOptions): OsqInlineData | null {
  if (options.inline !== undefined) return options.inline;
  const scope = options.global ?? (globalThis as GlobalScope);
  return scope.__OSQ_DATA__ ?? null;
}

function resolveEventSource(options: DashboardDataOptions): EventSourceConstructor | null {
  if (options.eventSource) return options.eventSource;
  const scope = options.global ?? (globalThis as GlobalScope);
  return scope.EventSource ?? null;
}

/**
 * Create the one data module that owns every report, graph, inbox, change, and
 * event access. Inlined documents win per document; anything else is fetched
 * same-origin and refreshed through one event source.
 */
export function createDashboardData(options: DashboardDataOptions = {}): DashboardData {
  const inline = resolveInline(options);
  const events = resolveEventSource(options);
  const load = options.fetch ?? ((input: string) => globalThis.fetch(input));
  const listeners = new Set<(snapshot: DashboardSnapshot) => void>();
  let snapshot: DashboardSnapshot = EMPTY_SNAPSHOT;
  let route: Route | null = null;
  let generation = 0;
  let source: EventSourceLike | null = null;
  let closed = false;

  function openSource(): void {
    if (source !== null || closed || events === null) return;
    source = new events(EVENTS_PATH);
    source.addEventListener('changed', (event) => {
      if (closed) return;
      const ids = parseChangedIds(event.data);
      if (ids === null) return;
      void run(() => refreshDocuments(ids));
    });
  }

  async function fetchDocument<T>(path: string, valid: (value: unknown) => value is T): Promise<T> {
    openSource();
    const response = await load(path);
    if (!response.ok) throw new Error(`request failed ${path}: ${response.status}`);
    const parsed: unknown = await response.json();
    if (!valid(parsed)) throw new Error(`unexpected document ${path}`);
    return parsed;
  }

  function getReport(): Promise<MetricsReport> {
    if (inline?.report) return Promise.resolve(inline.report);
    return fetchDocument('/api/report', isReport);
  }

  function getGraph(): Promise<WebGraph> {
    if (inline?.graph) return Promise.resolve(inline.graph);
    return fetchDocument('/api/graph', isGraph);
  }

  function getInbox(): Promise<Inbox> {
    if (inline?.inbox) return Promise.resolve(inline.inbox);
    return fetchDocument('/api/inbox', isInbox);
  }

  function getChange(folderKey: string): Promise<WebChange> {
    const inlined = inline?.changes?.[folderKey];
    if (inlined) return Promise.resolve(inlined);
    return fetchDocument(`/api/changes/${encodeURIComponent(folderKey)}`, isChange);
  }

  function loadRoute(next: Route): Promise<Partial<DashboardSnapshot>> {
    if (next.name === 'report') return loadReport();
    if (next.name === 'graph') return getGraph().then((graph) => ({ graph }));
    return getChange(next.folderKey).then((change) => ({ change }));
  }

  async function loadReport(): Promise<Partial<DashboardSnapshot>> {
    const [report, graph] = await Promise.all([getReport(), getGraph()]);
    return { report, graph };
  }

  async function refreshDocuments(ids: readonly number[]): Promise<Partial<DashboardSnapshot>> {
    const openChange = route?.name === 'change' ? snapshot.change : null;
    const affected =
      openChange !== null &&
      (ids.length === 0 || (openChange.id !== null && ids.includes(openChange.id)));
    const [report, graph, inbox] = await Promise.all([getReport(), getGraph(), getInbox()]);
    const partial: Partial<DashboardSnapshot> = { report, graph, inbox };
    if (!affected || openChange === null) return partial;
    return { ...partial, change: await getChange(openChange.folderKey) };
  }

  async function run(task: () => Promise<Partial<DashboardSnapshot>>): Promise<DashboardSnapshot> {
    const started = ++generation;
    const partial = await task();
    if (started !== generation || closed) return snapshot;
    snapshot = { ...snapshot, ...partial };
    for (const listener of [...listeners]) listener(snapshot);
    return snapshot;
  }

  return {
    inline: inline !== null,
    load(next) {
      route = next;
      return run(() => loadRoute(next));
    },
    snapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      if (closed) return;
      closed = true;
      source?.close();
      source = null;
      listeners.clear();
    },
  };
}
