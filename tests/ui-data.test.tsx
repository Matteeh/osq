import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App, type AppProps } from '../packages/ui/src/app.js';
import {
  type DashboardData,
  type DashboardSnapshot,
  type EventSourceLike,
  type FetchLike,
  type FetchResponseLike,
  createDashboardData,
} from '../packages/ui/src/data.js';
import { parseHash, resolveRoute, routeToHash } from '../packages/ui/src/router.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { getMetricsReport } from '../src/core/report/report.js';
import { getWebChange, getWebGraph } from '../src/core/web/web-data.js';
import { buildWebFixture } from './fixtures/web/build.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const NOW = new Date('2026-06-01T00:00:00.000Z');

let tmpDir: string;
let report: Awaited<ReturnType<typeof getMetricsReport>>;
let graph: Awaited<ReturnType<typeof getWebGraph>>;
let change: Awaited<ReturnType<typeof getWebChange>>;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-ui-data-'));
  await buildWebFixture(tmpDir);
  report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);
  graph = await getWebGraph(tmpDir, DEFAULT_CONFIG);
  change = await getWebChange(tmpDir, '010-active-change', DEFAULT_CONFIG, NOW);
  FakeEventSource.instances.length = 0;
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function jsonResponse(body: unknown, status = 200): FetchResponseLike {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function recordingFetch(documents: Record<string, unknown>) {
  const calls: string[] = [];
  const fetch: FetchLike = async (input) => {
    calls.push(input);
    const body = documents[input];
    return body === undefined ? jsonResponse({ error: 'not found' }, 404) : jsonResponse(body);
  };
  return { calls, fetch };
}

class FakeEventSource implements EventSourceLike {
  static readonly instances: FakeEventSource[] = [];
  readonly url: string;
  closed = false;
  private readonly listeners = new Map<'changed', (event: { data: string }) => void>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: 'changed', listener: (event: { data: string }) => void): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    this.closed = true;
  }

  emit(data: string): void {
    this.listeners.get('changed')?.({ data });
  }
}

function nextUpdate(data: DashboardData): Promise<DashboardSnapshot> {
  return new Promise((resolve) => {
    const unsubscribe = data.subscribe((snapshot) => {
      unsubscribe();
      resolve(snapshot);
    });
  });
}

function renderApp(overrides: Partial<AppProps> & Pick<AppProps, 'documents'>): string {
  const props: AppProps = {
    route: { name: 'report' },
    loading: false,
    error: null,
    onNavigate: () => {},
    onRefresh: () => {},
    ...overrides,
  };
  return renderToStaticMarkup(createElement(App, props));
}

const EMPTY: DashboardSnapshot = { report: null, graph: null, inbox: null, change: null };

describe('hash router', () => {
  it('recognizes the canonical report, graph, and change routes', () => {
    assert.deepEqual(parseHash('#/report'), { name: 'report' });
    assert.deepEqual(parseHash('#/graph'), { name: 'graph' });
    assert.deepEqual(parseHash('#/changes/010-active-change'), {
      name: 'change',
      folderKey: '010-active-change',
    });
    assert.deepEqual(parseHash('#/'), { name: 'report' });
    assert.deepEqual(parseHash('#'), { name: 'report' });
  });

  it('round-trips a safely encoded change key and preserves a fallback', () => {
    const route = { name: 'change', folderKey: '010 spaces & symbols' } as const;
    assert.deepEqual(parseHash(routeToHash(route)), route);
    assert.equal(resolveRoute('#/nothing-here'), resolveRoute('#/report'));
    assert.deepEqual(resolveRoute(''), { name: 'report' });
  });

  it('rejects separators, traversal, and malformed escapes', () => {
    for (const hash of [
      '#/changes/',
      '#/changes/a%2Fb',
      '#/changes/..%2Fetc',
      '#/changes/%2E%2E',
      '#/changes/a%5Cb',
      '#/changes/%FF',
    ]) {
      assert.equal(parseHash(hash), null, hash);
    }
  });
});

describe('UI workspace dependency boundary', () => {
  it('keeps the pinned React and Vite stack private to the workspace', async () => {
    const ui = JSON.parse(
      await fs.readFile(path.join(ROOT, 'packages/ui/package.json'), 'utf8'),
    ) as {
      private?: boolean;
      engines?: { node?: string };
      devDependencies?: Record<string, string>;
    };
    assert.equal(ui.private, true);
    assert.equal(ui.engines?.node, '>=24.0.0');
    const dev = ui.devDependencies ?? {};
    assert.equal(dev.react, '19.3.0');
    assert.equal(dev['react-dom'], '19.3.0');
    assert.equal(dev['@types/react'], '19.3.0');
    assert.equal(dev['@types/react-dom'], '19.3.0');
    assert.equal(dev.vite, '8.3.0');
    for (const forbidden of [
      'react-router',
      'react-router-dom',
      'd3',
      'zustand',
      'redux',
      'vitest',
    ]) {
      assert.equal(dev[forbidden], undefined, `${forbidden} must not be a UI dependency`);
    }
    const root = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    for (const frontend of ['react', 'react-dom', 'vite']) {
      assert.equal(root.dependencies?.[frontend], undefined, `${frontend} is a runtime dependency`);
    }
  });
});

describe('inlined dashboard data', () => {
  it('server-renders every route without fetch or EventSource', async () => {
    const inline = { report, graph, changes: { '010-active-change': change } };
    let fetches = 0;
    let sources = 0;
    const data = createDashboardData({
      inline,
      fetch: async () => {
        fetches += 1;
        throw new Error('network must not be used');
      },
      eventSource: class {
        constructor() {
          sources += 1;
          throw new Error('events must not be used');
        }
      } as unknown as typeof FakeEventSource,
    });
    assert.equal(data.inline, true);

    const reportSnapshot = await data.load({ name: 'report' });
    assert.equal(reportSnapshot.report, report);
    assert.equal(reportSnapshot.graph, graph);
    assert.equal(reportSnapshot.inbox, null);

    const graphSnapshot = await data.load({ name: 'graph' });
    assert.equal(graphSnapshot.graph, graph);

    const changeSnapshot = await data.load({ name: 'change', folderKey: '010-active-change' });
    assert.deepEqual(changeSnapshot.change, change);

    assert.equal(fetches, 0);
    assert.equal(sources, 0);
  });

  it('renders navigation, state messaging, and all three placeholders', () => {
    const inlineDocuments: DashboardSnapshot = {
      report,
      graph,
      inbox: null,
      change,
    };
    const reportHtml = renderApp({ route: { name: 'report' }, documents: inlineDocuments });
    assert.match(reportHtml, /href="#\/report"/);
    assert.match(reportHtml, /href="#\/graph"/);
    assert.match(reportHtml, /Delivery report/);

    const graphHtml = renderApp({ route: { name: 'graph' }, documents: inlineDocuments });
    assert.match(graphHtml, /Capability archive/);

    const changeHtml = renderApp({
      route: { name: 'change', folderKey: '010-active-change' },
      documents: inlineDocuments,
    });
    assert.match(changeHtml, /Active Change/);

    const emptyHtml = renderApp({ route: { name: 'report' }, documents: EMPTY });
    assert.match(emptyHtml, /No delivery report is available/);

    const loadingHtml = renderApp({
      route: { name: 'report' },
      documents: EMPTY,
      loading: true,
    });
    assert.match(loadingHtml, /Loading/);

    const errorHtml = renderApp({
      route: { name: 'report' },
      documents: EMPTY,
      error: 'boom',
    });
    assert.match(errorHtml, /role="alert"/);
    assert.match(errorHtml, /boom/);
  });
});

describe('live dashboard data', () => {
  const inbox = { needsYou: [], running: [], landed: [] };

  function liveDocuments(extra: Record<string, unknown> = {}) {
    return {
      '/api/report': report,
      '/api/graph': graph,
      '/api/inbox': inbox,
      '/api/changes/010-active-change': change,
      ...extra,
    };
  }

  it('owns the same-origin URLs and exactly one event source', async () => {
    const { calls, fetch } = recordingFetch(liveDocuments());
    const data = createDashboardData({ fetch, eventSource: FakeEventSource });
    await data.load({ name: 'change', folderKey: '010-active-change' });

    assert.deepEqual(calls, ['/api/changes/010-active-change']);
    assert.equal(FakeEventSource.instances.length, 1);
    assert.equal(FakeEventSource.instances[0]?.url, '/api/events');
  });

  it('encodes change selectors once', async () => {
    const key = '010 spaces & symbols';
    const { calls, fetch } = recordingFetch({
      [`/api/changes/${encodeURIComponent(key)}`]: change,
    });
    const data = createDashboardData({ fetch, eventSource: FakeEventSource });
    await data.load({ name: 'change', folderKey: key });
    assert.deepEqual(calls, [`/api/changes/${encodeURIComponent(key)}`]);
  });

  it('refetches shared documents and the open change on a matching id', async () => {
    const { calls, fetch } = recordingFetch(liveDocuments());
    const data = createDashboardData({ fetch, eventSource: FakeEventSource });
    await data.load({ name: 'change', folderKey: '010-active-change' });
    const source = FakeEventSource.instances[0];
    assert.ok(source);
    calls.length = 0;

    const update = nextUpdate(data);
    source.emit(JSON.stringify({ ids: [change.id] }));
    await update;

    assert.deepEqual(calls, [
      '/api/report',
      '/api/graph',
      '/api/inbox',
      '/api/changes/010-active-change',
    ]);
  });

  it('refetches shared documents but not an unrelated change', async () => {
    const { calls, fetch } = recordingFetch(liveDocuments());
    const data = createDashboardData({ fetch, eventSource: FakeEventSource });
    await data.load({ name: 'change', folderKey: '010-active-change' });
    const source = FakeEventSource.instances[0];
    assert.ok(source);
    calls.length = 0;

    const update = nextUpdate(data);
    source.emit(JSON.stringify({ ids: [99] }));
    await update;

    assert.deepEqual(calls, ['/api/report', '/api/graph', '/api/inbox']);
  });

  it('treats an empty id list as affecting the open change', async () => {
    const { calls, fetch } = recordingFetch(liveDocuments());
    const data = createDashboardData({ fetch, eventSource: FakeEventSource });
    await data.load({ name: 'change', folderKey: '010-active-change' });
    const source = FakeEventSource.instances[0];
    assert.ok(source);
    calls.length = 0;

    const update = nextUpdate(data);
    source.emit(JSON.stringify({ ids: [] }));
    await update;

    assert.deepEqual(calls, [
      '/api/report',
      '/api/graph',
      '/api/inbox',
      '/api/changes/010-active-change',
    ]);
  });

  it('ignores malformed changed events', async () => {
    const { calls, fetch } = recordingFetch(liveDocuments());
    const data = createDashboardData({ fetch, eventSource: FakeEventSource });
    await data.load({ name: 'report' });
    const source = FakeEventSource.instances[0];
    assert.ok(source);
    calls.length = 0;

    source.emit('not json');
    source.emit(JSON.stringify({ ids: 'nope' }));
    source.emit(JSON.stringify({ ids: [1.5] }));
    await flush();
    assert.deepEqual(calls, []);
  });

  it('lets a newer refresh win over a stale one', async () => {
    const pending: Array<{ url: string; resolve: (value: FetchResponseLike) => void }> = [];
    const fetch: FetchLike = (input) =>
      new Promise((resolve) => {
        pending.push({ url: input, resolve });
      });
    const data = createDashboardData({ fetch, eventSource: FakeEventSource });
    const first = data.load({ name: 'graph' });
    const second = data.load({ name: 'graph' });
    assert.equal(pending.length, 2);

    pending[1]?.resolve(jsonResponse({ capabilities: [], changes: [], edges: [], marker: 'new' }));
    await second;
    pending[0]?.resolve(jsonResponse({ capabilities: [], changes: [], edges: [], marker: 'old' }));
    await first;

    const current = data.snapshot().graph as unknown as { marker: string };
    assert.equal(current.marker, 'new');
  });

  it('closes the one event source and stops refreshing', async () => {
    const { calls, fetch } = recordingFetch(liveDocuments());
    const data = createDashboardData({ fetch, eventSource: FakeEventSource });
    await data.load({ name: 'graph' });
    const source = FakeEventSource.instances[0];
    assert.ok(source);
    assert.equal(source.closed, false);

    data.close();
    assert.equal(source.closed, true);
    calls.length = 0;
    source.emit(JSON.stringify({ ids: [] }));
    await flush();
    assert.deepEqual(calls, []);
  });
});
