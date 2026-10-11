/**
 * The docs routes of the dashboard: `/api/docs` over HTTP, the hash routes
 * "Docs routes" lists, and the data layer loading the docs site for them.
 * Scenarios: "Docs over HTTP" and "Docs routes".
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  type DashboardData,
  type DashboardSnapshot,
  type EventSourceLike,
  type FetchLike,
  type FetchResponseLike,
  createDashboardData,
} from '../packages/ui/src/data.js';
import { type Route, parseHash, resolveRoute, routeToHash } from '../packages/ui/src/router.js';
import { loadConfig } from '../src/core/foundation/config.js';
import type { WebServerHandle } from '../src/core/web/web-server.js';
import { startWebServer } from '../src/core/web/web-server.js';
import type { DocsSite } from '../src/docs/docs-types.js';
import { cleanupDocsProjects, docsProject } from './docs-support.js';

const handles: WebServerHandle[] = [];

afterEach(async () => {
  while (handles.length > 0) {
    const handle = handles.pop();
    if (handle) await handle.close();
  }
  await cleanupDocsProjects();
});

describe('docs over HTTP', () => {
  it('serves the docs site at /api/docs', async () => {
    const root = await docsProject();
    const config = await loadConfig(root);
    const handle = await startWebServer({
      projectRoot: root,
      config,
      uiDir: path.join(root, 'empty-ui'),
      now: () => new Date('2026-06-01T00:00:00.000Z'),
    });
    handles.push(handle);

    const response = await fetch(new URL('/api/docs', handle.url));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    const site = (await response.json()) as DocsSite;
    assert.deepEqual(
      site.capabilities.map((page) => page.name),
      ['invoices', 'pricing'],
    );
    assert.deepEqual(
      site.adrs.map((adr) => adr.number),
      ['001', '002', '003', '004'],
    );
  });
});

describe('docs routes', () => {
  const rows: ReadonlyArray<readonly [string, Route]> = [
    ['#/docs', { name: 'docs' }],
    ['#/docs/capabilities/pricing', { name: 'docs-capability', capability: 'pricing' }],
    ['#/docs/adrs/004', { name: 'docs-adr', number: '004' }],
  ];

  it('parses every docs route and renders it back to its hash', () => {
    for (const [hash, route] of rows) {
      assert.deepEqual(parseHash(hash), route);
      assert.equal(routeToHash(route), hash);
    }
  });

  it('resolves an unusable docs name to the home route', () => {
    assert.equal(parseHash('#/docs/capabilities/a%2Fb'), null);
    assert.deepEqual(resolveRoute('#/docs/capabilities/a%2Fb'), { name: 'home' });
  });
});

describe('docs dashboard data', () => {
  const site: DocsSite = { version: 1, groups: [], capabilities: [], adrs: [] };
  const report = { specs: {}, history: {}, tokens: {} };
  const graph = { capabilities: [], changes: [], edges: [] };
  const inbox = { needsYou: [], running: [], landed: [] };

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

  const docsRoutes: readonly Route[] = [
    { name: 'docs' },
    { name: 'docs-capability', capability: 'pricing' },
    { name: 'docs-adr', number: '004' },
  ];

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

  function nextUpdate(data: DashboardData): Promise<DashboardSnapshot> {
    return new Promise((resolve) => {
      const unsubscribe = data.subscribe((snapshot) => {
        unsubscribe();
        resolve(snapshot);
      });
    });
  }

  it('loads the docs site for every docs route', async () => {
    for (const route of docsRoutes) {
      FakeEventSource.instances.length = 0;
      const { calls, fetch } = recordingFetch({ '/api/docs': site });
      const data = createDashboardData({ fetch, eventSource: FakeEventSource });
      const snapshot = await data.load(route);
      assert.equal(snapshot.docs, site);
      assert.deepEqual(calls, ['/api/docs']);
      data.close();
    }
  });

  it('refetches the docs site on a changed event while a docs route is open', async () => {
    FakeEventSource.instances.length = 0;
    const { calls, fetch } = recordingFetch({
      '/api/docs': site,
      '/api/report': report,
      '/api/graph': graph,
      '/api/inbox': inbox,
    });
    const data = createDashboardData({ fetch, eventSource: FakeEventSource });
    await data.load({ name: 'docs' });
    const source = FakeEventSource.instances[0];
    assert.ok(source);
    calls.length = 0;

    const update = nextUpdate(data);
    source.emit(JSON.stringify({ ids: [] }));
    await update;

    assert.deepEqual(calls, ['/api/report', '/api/graph', '/api/inbox', '/api/docs']);
    data.close();
  });
});
