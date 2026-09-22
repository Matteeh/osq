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
  ChangeView,
  UNAVAILABLE,
  costWithCoverage,
  coverageText,
  formatCost,
  formatCount,
  formatExitCode,
  formatSeconds,
  formatTimeout,
  formatTimestamp,
  plannerLabel,
  runningDescription,
} from '../packages/ui/src/change/index.js';
import {
  type DashboardData,
  type DashboardSnapshot,
  type EventSourceLike,
  type FetchLike,
  type FetchResponseLike,
  createDashboardData,
} from '../packages/ui/src/data.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { getMetricsReport } from '../src/core/report.js';
import type { WebChange, WebRecertification, WebTask } from '../src/core/web-data-types.js';
import { getWebChange, getWebGraph } from '../src/core/web-data.js';
import { buildWebFixture, writeRunningLock } from './fixtures/web/build.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const ASOF = '2026-06-01T00:00:42.000Z';
const LOCK_START = Date.parse('2026-06-01T00:00:00.000Z');

let tmpDir: string;
let active: WebChange;
let running: WebChange;
let archived: WebChange;
let rejected: WebChange;
let report: Awaited<ReturnType<typeof getMetricsReport>>;
let graph: Awaited<ReturnType<typeof getWebGraph>>;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-ui-change-'));
  await buildWebFixture(tmpDir);
  await writeRunningLock(tmpDir, LOCK_START);
  const now = new Date(ASOF);
  active = await getWebChange(tmpDir, '010-active-change', DEFAULT_CONFIG, now);
  running = await getWebChange(tmpDir, '010-active-change', DEFAULT_CONFIG, now);
  archived = await getWebChange(tmpDir, '002-archived-change', DEFAULT_CONFIG, now);
  rejected = await getWebChange(tmpDir, '002-rejected-change', DEFAULT_CONFIG, now);
  report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);
  graph = await getWebGraph(tmpDir, DEFAULT_CONFIG);
  FakeEventSource.instances.length = 0;
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function webTask(overrides: Partial<WebTask> & Pick<WebTask, 'taskNumber' | 'title'>): WebTask {
  return {
    declaredScope: [],
    resolvedScope: [],
    acceptance: [],
    verify: 'node verify.cjs',
    state: 'pending',
    attempts: 0,
    reason: null,
    runningStart: null,
    runningElapsedSeconds: null,
    duration: null,
    cost: null,
    costCoverage: { reported: 0, total: 0 },
    recertifications: [],
    result: null,
    ...overrides,
  };
}

function webChange(
  overrides: Partial<WebChange> & Pick<WebChange, 'folderKey' | 'title'>,
): WebChange {
  return {
    id: null,
    slug: overrides.folderKey,
    state: 'active',
    location: 'active',
    planner: null,
    brief: null,
    goal: '',
    rejection: null,
    dependsOn: [],
    reads: [],
    writes: [],
    asOf: ASOF,
    tasks: [],
    ...overrides,
  };
}

function recertification(overrides: Partial<WebRecertification> = {}): WebRecertification {
  return {
    taskNumber: '1',
    timestamp: '2026-01-04T00:00:00.000Z',
    outcome: 'passed',
    actor: 'human',
    differingPaths: ['src/a.ts (modified)'],
    attribution: [{ path: 'src/a.ts (modified)', attribution: 'ambiguous' }],
    verify: 'node verify.cjs',
    exitCode: 0,
    timedOut: false,
    ...overrides,
  };
}

function renderChange(change: WebChange): string {
  return renderToStaticMarkup(createElement(ChangeView, { change }));
}

function count(html: string, pattern: RegExp): number {
  const global = new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
  );
  return (html.match(global) ?? []).length;
}

function taskOf(change: WebChange, number: string): WebTask | undefined {
  return change.tasks.find((task) => task.taskNumber === number);
}

describe('change formatting', () => {
  it('labels every unavailable observation instead of inferring a value', () => {
    assert.equal(formatCost(null), UNAVAILABLE);
    assert.equal(formatCost(Number.NaN), UNAVAILABLE);
    assert.equal(formatCost(Number.POSITIVE_INFINITY), UNAVAILABLE);
    assert.equal(formatCost(-1), UNAVAILABLE);
    assert.equal(formatCost(0), '$0.0000');
    assert.equal(formatCost(1.5), '$1.50');
    assert.equal(formatCount(Number.NaN), UNAVAILABLE);
    assert.equal(formatCount(3), '3');
    assert.equal(formatSeconds(null), UNAVAILABLE);
    assert.equal(formatSeconds(-2), UNAVAILABLE);
    assert.equal(formatSeconds(42), '42s');
    assert.equal(formatTimestamp(null), UNAVAILABLE);
    assert.equal(formatTimestamp(ASOF), ASOF);
    assert.equal(plannerLabel(null), UNAVAILABLE);
    assert.equal(plannerLabel('   '), UNAVAILABLE);
    assert.equal(plannerLabel('opencode/big-pickle'), 'opencode/big-pickle');
    assert.equal(formatExitCode(null), UNAVAILABLE);
    assert.equal(formatExitCode(0), '0');
    assert.equal(formatTimeout(null), UNAVAILABLE);
    assert.equal(formatTimeout(true), 'timed out');
    assert.equal(formatTimeout(false), 'no timeout');
  });

  it('keeps cost coverage adjacent and uses the server reported-of-total counts', () => {
    assert.equal(coverageText({ reported: 1, total: 2 }), '1 of 2');
    assert.equal(
      costWithCoverage(0.5, { reported: 1, total: 2 }),
      '$0.50 (1 of 2 attempts reported)',
    );
    assert.equal(
      costWithCoverage(null, { reported: 0, total: 0 }),
      'unavailable (0 of 0 attempts reported)',
    );
  });

  it('derives a running description only from server-supplied start and elapsed values', () => {
    const task = webTask({
      taskNumber: '2',
      title: 'Running',
      state: 'running',
      runningStart: '2026-06-01T00:00:00.000Z',
      runningElapsedSeconds: 42,
    });
    assert.equal(runningDescription(task), 'running since 2026-06-01T00:00:00.000Z, 42s elapsed');
    assert.equal(runningDescription(webTask({ taskNumber: '3', title: 'Idle' })), null);
    assert.equal(
      runningDescription(webTask({ taskNumber: '4', title: 'Bare', state: 'running' })),
      'running since unavailable, unavailable elapsed',
    );
  });
});

describe('change evidence view', () => {
  it('shows folder key, location, state, title, planner, and brief body', () => {
    const html = renderChange(active);
    assert.match(html, /Active Change/);
    assert.match(html, /Folder key<\/dt><dd>010-active-change<\/dd>/);
    assert.match(html, /Location<\/dt><dd>active<\/dd>/);
    assert.match(html, /State<\/dt><dd>active<\/dd>/);
    assert.match(html, /Planner<\/dt><dd>opencode\/big-pickle<\/dd>/);
    assert.match(html, /Brief body for active change\./);
    assert.equal(html.includes('brief absent'), false);
  });

  it('labels a missing brief and renders the complete proposal goal', () => {
    const html = renderChange(archived);
    assert.match(html, /brief absent/);
    assert.match(html, /Archived Change goal text\./);
    assert.match(html, /<pre class="brief-goal">Archived Change goal text\.<\/pre>/);
  });

  it('renders a semantic task table with exact provenance and unavailable labels', () => {
    const change = webChange({
      folderKey: '005-evidence',
      title: 'Evidence',
      tasks: [
        webTask({
          taskNumber: '1',
          title: 'Covered',
          state: 'done',
          attempts: 2,
          duration: 12,
          cost: 0.5,
          costCoverage: { reported: 1, total: 2 },
        }),
        webTask({
          taskNumber: '2',
          title: 'Blocked',
          state: 'dead',
          reason: 'verify_red',
          attempts: 1,
          cost: 0,
          costCoverage: { reported: 0, total: 1 },
        }),
      ],
    });
    const html = renderChange(change);
    assert.match(html, /<table class="task-table">/);
    assert.match(html, /<th scope="col">State<\/th>/);
    assert.match(html, /<th scope="row">1\. Covered<\/th><td class="task-state">done<\/td>/);
    assert.match(html, /<td>2<\/td><td>unavailable<\/td><td>12s<\/td>/);
    assert.match(html, /\$0\.50 \(1 of 2 attempts reported\)/);
    assert.match(html, /<td class="task-state">dead<\/td>/);
    assert.match(html, /verify_red/);
    assert.match(html, /\$0\.0000 \(0 of 1 attempts reported\)/);
  });

  it('exposes declared scope, resolved scope, acceptance, and verify without collapsing them', () => {
    const change = webChange({
      folderKey: '006-scope',
      title: 'Scope',
      tasks: [
        webTask({
          taskNumber: '1',
          title: 'Scoped',
          declaredScope: ['src/a.ts', 'src/b.*'],
          resolvedScope: [
            { relativePath: 'src/a.ts', absolutePath: '/repo/src/a.ts' },
            { relativePath: 'src/b.ts', absolutePath: null },
          ],
          acceptance: ['first criterion', 'second criterion'],
          verify: 'node verify.cjs --strict',
        }),
      ],
    });
    const html = renderChange(change);
    assert.match(html, /Declared scope/);
    assert.match(html, /<code>src\/b\.\*<\/code>/);
    assert.match(html, /Resolved scope files/);
    assert.match(html, /<code>src\/a\.ts<\/code> — present/);
    assert.match(html, /<code>src\/b\.ts<\/code> — not present/);
    assert.match(html, /first criterion/);
    assert.match(html, /second criterion/);
    assert.match(html, /<pre>node verify\.cjs --strict<\/pre>/);
    // The command is displayed as inert text, never executed or evaluated.
    assert.equal(html.includes('function eval'), false);
  });

  it('renders archived typed human recertification evidence in order or an explicit empty state', () => {
    const change = webChange({
      folderKey: '007-recert',
      title: 'Recert',
      state: 'archived',
      location: 'archived',
      tasks: [
        webTask({
          taskNumber: '3',
          title: 'Recertified',
          state: 'done',
          recertifications: [
            recertification(),
            recertification({
              timestamp: '2026-01-06T00:00:10.000Z',
              outcome: 'requeued',
              differingPaths: ['src/c.ts (modified)', 'src/d.ts (deleted)'],
              attribution: [
                { path: 'src/c.ts (modified)', attribution: '4' },
                { path: 'src/d.ts (deleted)', attribution: 'unknown' },
              ],
              verify: 'node verify.cjs',
              exitCode: 1,
              timedOut: true,
            }),
          ],
        }),
        webTask({ taskNumber: '4', title: 'No history' }),
      ],
    });
    const html = renderChange(change);
    assert.match(html, /Location<\/dt><dd>archived<\/dd>/);
    assert.match(html, /<td>human<\/td>/);
    assert.match(html, /<td>passed<\/td>/);
    assert.match(html, /2026-01-04T00:00:00\.000Z/);
    assert.match(html, /src\/a\.ts \(modified\): ambiguous/);
    assert.match(html, /<td>requeued<\/td>/);
    assert.match(html, /src\/d\.ts \(deleted\): unknown/);
    assert.match(html, /timed out/);
    assert.match(html, /No recertifications recorded\./);
    assert.equal(count(html, /No recertifications recorded\./), 1);
  });

  it('keeps verbatim results in a closed native disclosure and never injects markup', () => {
    const raw = 'line one\n<script>alert("x")</script> & done';
    const change = webChange({
      folderKey: '008-result',
      title: 'Result',
      tasks: [
        webTask({ taskNumber: '1', title: 'With result', result: raw }),
        webTask({ taskNumber: '2', title: 'Without result', result: null }),
        webTask({ taskNumber: '3', title: 'Empty result', result: '' }),
      ],
    });
    const html = renderChange(change);
    assert.equal(html.includes('<script>'), false);
    assert.match(html, /line one\n&lt;script&gt;/);
    assert.match(html, /&amp; done/);
    assert.equal(count(html, /<details class="result-disclosure" data-result="true">/), 1);
    assert.equal(/data-result="true"[^>]*\sopen/.test(html), false);
    assert.equal(count(html, /No result recorded/), 2);
    assert.equal(count(html, /data-result="true"/), 1);
  });

  it('renders running start and elapsed seconds from the server-derived document', () => {
    const html = renderChange(running);
    assert.match(html, /running since 2026-06-01T00:00:00\.000Z, 42s elapsed/);
    assert.match(html, /<td class="task-state">running<\/td>/);
  });

  it('renders rejected rejection evidence without treating it as active or landed', () => {
    const html = renderChange(rejected);
    assert.match(html, /Rejected Change/);
    assert.match(html, /Location<\/dt><dd>rejected<\/dd>/);
    assert.match(html, /superseded/);
    assert.match(html, /2026-03-01T00:00:00\.000Z/);
  });

  it('degrades malformed optional evidence to unavailable without hiding valid tasks', () => {
    const change = webChange({
      folderKey: '009-malformed',
      title: 'Malformed',
      planner: null,
      brief: null,
      goal: 'Malformed goal.',
      asOf: '',
      tasks: [
        webTask({
          taskNumber: '1',
          title: 'Still visible',
          state: 'pending',
          reason: null,
          duration: null,
          cost: null,
          costCoverage: { reported: 0, total: 2 },
          recertifications: [
            recertification({ outcome: null, timestamp: null, exitCode: null, timedOut: null }),
          ],
        }),
      ],
    });
    const html = renderChange(change);
    assert.match(html, /Still visible/);
    assert.match(html, /brief absent/);
    assert.match(html, /Malformed goal\./);
    assert.match(html, /unavailable \(0 of 2 attempts reported\)/);
    assert.match(html, /<td>unavailable<\/td>/);
    assert.match(html, /<td>human<\/td>/);
  });

  it('renders an explicit task empty state for an evidence-free change', () => {
    const html = renderChange(webChange({ folderKey: '011-empty', title: 'Empty' }));
    assert.match(html, /No tasks are recorded for this change\./);
    assert.equal(html.includes('<table class="task-table">'), false);
  });

  it('is wired into the shared app shell in place of the change placeholder', () => {
    const documents: DashboardSnapshot = { report, graph, inbox: null, change: active };
    const props: AppProps = {
      route: { name: 'change', folderKey: active.folderKey },
      documents,
      loading: false,
      error: null,
      onNavigate: () => {},
      onRefresh: () => {},
    };
    const html = renderToStaticMarkup(createElement(App, props));
    assert.match(html, /Task evidence/);
    assert.match(html, /Folder key/);
    assert.equal(html.includes('placeholder'), false);
  });

  it('server-renders representative documents without fetch or EventSource access', () => {
    const originalFetch = globalThis.fetch;
    const originalEvents = (globalThis as { EventSource?: unknown }).EventSource;
    let used = false;
    globalThis.fetch = (() => {
      used = true;
      throw new Error('network must not be used');
    }) as typeof globalThis.fetch;
    (globalThis as { EventSource?: unknown }).EventSource = class {
      constructor() {
        used = true;
        throw new Error('events must not be used');
      }
    };
    try {
      const archivedRecertified = webChange({
        folderKey: '012-archived-recert',
        title: 'Archived recertified',
        state: 'archived',
        location: 'archived',
        tasks: [
          webTask({
            taskNumber: '1',
            title: 'Recertified',
            state: 'done',
            result: 'done',
            recertifications: [recertification()],
          }),
        ],
      });
      for (const change of [active, running, archived, rejected, archivedRecertified]) {
        const html = renderChange(change);
        assert.ok(html.length > 0, change.folderKey);
      }
      assert.match(renderChange(archivedRecertified), /Archived recertified/);
      assert.match(renderChange(archivedRecertified), /<td>human<\/td>/);
      assert.equal(used, false);
    } finally {
      globalThis.fetch = originalFetch;
      (globalThis as { EventSource?: unknown }).EventSource = originalEvents;
    }
  });

  it('never mutates the WebChange document', () => {
    const before = JSON.stringify(active);
    renderChange(active);
    assert.equal(JSON.stringify(active), before);
  });
});

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function jsonResponse(body: unknown, status = 200): FetchResponseLike {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
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

describe('change route invalidation', () => {
  const inbox = { needsYou: [], running: [], landed: [] };

  it('replaces the route with a freshly fetched WebChange on relevant and global events', async () => {
    const later = (seconds: number): Promise<WebChange> =>
      getWebChange(
        tmpDir,
        '010-active-change',
        DEFAULT_CONFIG,
        new Date(LOCK_START + seconds * 1000),
      );
    const documents: Record<string, unknown> = {
      '/api/report': report,
      '/api/graph': graph,
      '/api/inbox': inbox,
      '/api/changes/010-active-change': await later(42),
    };
    const calls: string[] = [];
    const fetch: FetchLike = async (input) => {
      calls.push(input);
      const body = documents[input];
      return body === undefined ? jsonResponse({ error: 'not found' }, 404) : jsonResponse(body);
    };
    const data = createDashboardData({ fetch, eventSource: FakeEventSource });
    await data.load({ name: 'change', folderKey: '010-active-change' });

    const first = taskOf(data.snapshot().change as WebChange, '2');
    assert.equal(first?.runningElapsedSeconds, 42);
    const source = FakeEventSource.instances[0];
    assert.ok(source);
    assert.equal(source.url, '/api/events');

    // A matching numeric id refetches the open change.
    documents['/api/changes/010-active-change'] = await later(52);
    calls.length = 0;
    let update = nextUpdate(data);
    source.emit(JSON.stringify({ ids: [10] }));
    await update;
    assert.deepEqual(calls, [
      '/api/report',
      '/api/graph',
      '/api/inbox',
      '/api/changes/010-active-change',
    ]);
    assert.equal(taskOf(data.snapshot().change as WebChange, '2')?.runningElapsedSeconds, 52);

    // A global empty-id event also refetches the open change.
    documents['/api/changes/010-active-change'] = await later(62);
    update = nextUpdate(data);
    source.emit(JSON.stringify({ ids: [] }));
    await update;
    assert.equal(taskOf(data.snapshot().change as WebChange, '2')?.runningElapsedSeconds, 62);

    // An unrelated id refreshes shared documents but leaves the change in place.
    documents['/api/changes/010-active-change'] = await later(72);
    calls.length = 0;
    update = nextUpdate(data);
    source.emit(JSON.stringify({ ids: [99] }));
    await update;
    assert.deepEqual(calls, ['/api/report', '/api/graph', '/api/inbox']);
    assert.equal(taskOf(data.snapshot().change as WebChange, '2')?.runningElapsedSeconds, 62);

    // The replaced document renders the new elapsed value with no client timer.
    const html = renderChange(data.snapshot().change as WebChange);
    assert.match(html, /running since 2026-06-01T00:00:00\.000Z, 62s elapsed/);
    assert.equal(html.includes('setInterval'), false);

    data.close();
    await flush();
  });

  it('keeps change sources free of subscriptions, timers, markdown, and HTML injection', async () => {
    const dir = path.join(ROOT, 'packages', 'ui', 'src', 'change');
    const entries = await fs.readdir(dir);
    const forbidden = [
      'EventSource',
      'addEventListener',
      'setInterval',
      'setTimeout',
      'fetch(',
      'dangerouslySetInnerHTML',
      'markdown',
    ];
    for (const entry of entries) {
      const source = await fs.readFile(path.join(dir, entry), 'utf8');
      for (const token of forbidden) {
        assert.equal(source.includes(token), false, `${entry} must not contain ${token}`);
      }
      const lines = source.split('\n').length;
      assert.ok(lines <= 250, `${entry} has ${lines} lines`);
    }
  });
});
