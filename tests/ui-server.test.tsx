import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App, type AppProps } from '../packages/ui/src/app.js';
import { type ActionFetch, createActionClient } from '../packages/ui/src/change/actions-client.js';
import {
  type DashboardSnapshot,
  type EventSourceLike,
  type FetchLike,
  type FetchResponseLike,
  createDashboardData,
} from '../packages/ui/src/data.js';
import {
  ServerHeader,
  ServicePanel,
  createServerStatusClient,
  resolveApiBase,
} from '../packages/ui/src/server/index.js';
import type { ServiceRecord, WatcherRecord } from '../src/core/run/watch-state.js';
import type { WebServerStatus } from '../src/core/web/web-site.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function watcherRecord(overrides: Partial<WatcherRecord> = {}): WatcherRecord {
  return {
    pid: 1111,
    mode: 'background',
    version: '1.2.3',
    commit: 'abc1234',
    startedAt: '2026-06-01T00:00:00.000Z',
    waiting: null,
    ...overrides,
  };
}

function serviceRecord(overrides: Partial<ServiceRecord> = {}): ServiceRecord {
  return {
    pid: 2222,
    startedAt: '2026-06-01T00:00:00.000Z',
    log: '/h/.osq/watch/x/watch.log',
    ...overrides,
  };
}

function serverStatus(overrides: Partial<WebServerStatus> = {}): WebServerStatus {
  return {
    name: 'box',
    project: 'osq',
    path: '/p/osq/',
    service: serviceRecord(),
    watcher: watcherRecord(),
    log: '/h/.osq/watch/x/watch.log',
    ...overrides,
  };
}

const EMPTY_INBOX = { needsYou: [], running: [], landed: [] };

function renderApp(server: WebServerStatus | null): string {
  const documents: DashboardSnapshot = {
    report: null,
    graph: null,
    inbox: EMPTY_INBOX,
    change: null,
  };
  const props: AppProps = {
    route: { name: 'home' },
    documents,
    loading: false,
    error: null,
    onNavigate: () => {},
    onRefresh: () => {},
    server,
  };
  return renderToStaticMarkup(createElement(App, props));
}

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

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(): void {}

  close(): void {}
}

describe('resolveApiBase', () => {
  it('returns the project prefix only under /p/<project>/', () => {
    assert.equal(resolveApiBase('/'), '');
    assert.equal(resolveApiBase('/index.html'), '');
    assert.equal(resolveApiBase('/p/osq/'), '/p/osq');
    assert.equal(resolveApiBase('/p/osq/index.html'), '/p/osq');
    assert.equal(resolveApiBase('/p/../'), '');
    assert.equal(resolveApiBase('/p/osq'), '');
    assert.equal(resolveApiBase('/api/report'), '');
  });
});

describe('server status client', () => {
  it('requests <base>/api/server and returns the document', async () => {
    const calls: string[] = [];
    const client = createServerStatusClient(async (input) => {
      calls.push(input);
      return { ok: true, status: 200, json: async () => serverStatus() };
    });

    const result = await client.load('/p/osq');

    assert.deepEqual(calls, ['/p/osq/api/server']);
    assert.equal(result?.name, 'box');
    assert.equal(result?.project, 'osq');
  });

  it('returns null on a refused, thrown, or malformed request', async () => {
    const refused = createServerStatusClient(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    }));
    const thrown = createServerStatusClient(async () => {
      throw new Error('connection refused');
    });
    const malformed = createServerStatusClient(async () => ({
      ok: true,
      status: 200,
      json: async () => 5,
    }));

    assert.equal(await refused.load('/p/osq'), null);
    assert.equal(await thrown.load('/p/osq'), null);
    assert.equal(await malformed.load('/p/osq'), null);
  });
});

describe('dashboard data base', () => {
  it('prefixes every document and the event source under /p/<project>', async () => {
    FakeEventSource.instances.length = 0;
    const { calls, fetch } = recordingFetch({
      '/p/osq/api/report': { specs: {}, history: {}, tokens: {} },
      '/p/osq/api/graph': { capabilities: [], changes: [], edges: [] },
      '/p/osq/api/inbox': EMPTY_INBOX,
      '/p/osq/api/changes/010-active-change': {
        folderKey: '010-active-change',
        tasks: [],
      },
    });
    const data = createDashboardData({ base: '/p/osq', fetch, eventSource: FakeEventSource });

    await data.load({ name: 'report' });
    assert.deepEqual(calls, ['/p/osq/api/report', '/p/osq/api/graph']);

    await data.load({ name: 'home' });
    assert.equal(calls[2], '/p/osq/api/inbox');

    await data.load({ name: 'change', folderKey: '010-active-change' });
    assert.equal(calls[3], '/p/osq/api/changes/010-active-change');

    assert.equal(FakeEventSource.instances[0]?.url, '/p/osq/api/events');
    assert.ok(calls.every((url) => !url.includes('api/server')));
  });

  it('keeps the loopback /api paths and never asks for api/server', async () => {
    FakeEventSource.instances.length = 0;
    const { calls, fetch } = recordingFetch({ '/api/inbox': EMPTY_INBOX });
    const data = createDashboardData({ fetch, eventSource: FakeEventSource });

    await data.load({ name: 'home' });

    assert.deepEqual(calls, ['/api/inbox']);
    assert.equal(FakeEventSource.instances[0]?.url, '/api/events');
    assert.ok(calls.every((url) => !url.includes('api/server')));
  });
});

describe('actions client base', () => {
  it('prefixes the actions URL with the base', async () => {
    const calls: string[] = [];
    const fetch: ActionFetch = async (input) => {
      calls.push(input);
      return { status: 404, json: async () => ({}) };
    };
    assert.equal(await createActionClient(fetch, '/p/osq').load('001'), null);
    assert.deepEqual(calls, ['/p/osq/api/actions/001']);
  });

  it('keeps the default actions URL', async () => {
    const calls: string[] = [];
    const fetch: ActionFetch = async (input) => {
      calls.push(input);
      return { status: 404, json: async () => ({}) };
    };
    await createActionClient(fetch).load('001');
    assert.deepEqual(calls, ['/api/actions/001']);
  });
});

describe('server header', () => {
  it('shows the project and server name next to the title', () => {
    const html = renderToStaticMarkup(createElement(ServerHeader, { server: serverStatus() }));
    assert.match(html, /<span class="server-name">osq on box<\/span>/);
    assert.match(renderApp(serverStatus()), /osq on box/);
  });
});

describe('service panel', () => {
  const rows: ReadonlyArray<{
    readonly name: string;
    readonly watcher: WatcherRecord | null;
    readonly service: ServiceRecord | null;
    readonly lines: readonly string[];
    readonly absent: readonly string[];
  }> = [
    {
      name: 'a background watcher and a service record',
      watcher: watcherRecord({ mode: 'background', waiting: null }),
      service: serviceRecord(),
      lines: ['Watcher: running in the background', 'Service log: /h/.osq/watch/x/watch.log'],
      absent: ['Waiting:'],
    },
    {
      name: 'a terminal watcher and no service record',
      watcher: watcherRecord({ mode: 'terminal', waiting: null }),
      service: null,
      lines: ['Watcher: running in a terminal'],
      absent: ['Service log:'],
    },
    {
      name: 'a waiting background watcher and a service record',
      watcher: watcherRecord({ mode: 'background', waiting: 'osq build is stale' }),
      service: serviceRecord(),
      lines: [
        'Watcher: running in the background',
        'Waiting: osq build is stale',
        'Service log: /h/.osq/watch/x/watch.log',
      ],
      absent: [],
    },
    {
      name: 'no watcher and no service record',
      watcher: null,
      service: null,
      lines: ['Watcher: not running'],
      absent: ['Service log:', 'Waiting:'],
    },
  ];

  for (const row of rows) {
    it(`shows ${row.name}`, () => {
      const html = renderApp(serverStatus({ watcher: row.watcher, service: row.service }));
      assert.match(html, /service-panel/);
      for (const line of row.lines) assert.ok(html.includes(line), `${line} missing`);
      for (const gone of row.absent) assert.ok(!html.includes(gone), `${gone} must be absent`);
    });
  }

  it('names the watcher version, commit, and start time', () => {
    const html = renderApp(
      serverStatus({
        watcher: watcherRecord({
          version: '9.9.9',
          commit: 'deadbee',
          startedAt: '2026-06-01T01:02:03.000Z',
        }),
      }),
    );
    assert.match(html, /Version 9\.9\.9/);
    assert.match(html, /commit deadbee/);
    assert.match(html, /started 2026-06-01T01:02:03\.000Z/);
  });

  it('marks the waiting line as a warning in the existing palette', async () => {
    const html = renderApp(
      serverStatus({ watcher: watcherRecord({ waiting: 'osq build is stale' }) }),
    );
    assert.match(html, /<p class="service-warning">Waiting: osq build is stale<\/p>/);

    const css = await fs.readFile(
      path.join(ROOT, 'packages', 'ui', 'src', 'server', 'server.css'),
      'utf8',
    );
    assert.match(css, /\.service-warning\s*\{[^}]*color:\s*var\(--status-regressed\)/);
    assert.match(css, /overflow-wrap/);
    for (const match of css.matchAll(/width:\s*(\d+)px/g)) {
      assert.ok(Number(match[1]) <= 360, `a fixed ${match[1]}px width does not fit 360px`);
    }
  });

  it('renders the home view as before without a server status', () => {
    const html = renderApp(null);
    assert.doesNotMatch(html, /service-panel/);
    assert.doesNotMatch(html, /osq on box/);
    assert.doesNotMatch(html, /Watcher:/);
    assert.match(html, /Needs you/);
    assert.match(html, /Nothing needs your attention\./);
    assert.match(html, /Running/);
    assert.match(html, /Landed since last look/);
  });
});

describe('service panel component', () => {
  it('renders the panel directly for a server status', () => {
    const html = renderToStaticMarkup(createElement(ServicePanel, { server: serverStatus() }));
    assert.match(html, /Watcher: running in the background/);
  });
});
