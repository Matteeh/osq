import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PASS_WINDOW_SIZE,
  ReportView,
  aggregateTokens,
  capabilityWriteSeries,
  durationHistogram,
  landedChanges,
  passWindows,
  planningBoundaryIndex,
} from '../packages/ui/src/report/index.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { getMetricsReport } from '../src/core/report/report.js';
import type {
  WebCapabilityNode,
  WebChangeNode,
  WebGraph,
  WebGraphEdge,
  WebMetricObservation,
  WebTokenGroup,
} from '../src/core/web/web-data-types.js';
import { getWebGraph } from '../src/core/web/web-data.js';
import { buildWebFixture } from './fixtures/web/build.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const LANDED_LATER = '2026-03-01T00:00:00.000Z';
const LANDED_EARLIER = '2026-01-01T00:00:00.000Z';

let tmpDir: string;
let report: Awaited<ReturnType<typeof getMetricsReport>>;
let graph: Awaited<ReturnType<typeof getWebGraph>>;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-ui-report-'));
  await buildWebFixture(tmpDir);
  report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);
  graph = await getWebGraph(tmpDir, DEFAULT_CONFIG);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function observation(overrides: Partial<WebMetricObservation> = {}): WebMetricObservation {
  return {
    cost: null,
    costCoverage: { reported: 0, total: 0 },
    tokens: [],
    durations: [],
    firstAttemptPass: { reported: 0, total: 0 },
    ...overrides,
  };
}

function changeNode(
  overrides: Partial<WebChangeNode> & Pick<WebChangeNode, 'folderKey' | 'title' | 'landed'>,
): WebChangeNode {
  return {
    kind: 'change',
    id: null,
    slug: overrides.folderKey,
    state: 'archived',
    created: null,
    approved: null,
    rejection: null,
    planner: null,
    taskCount: 1,
    attempts: 0,
    execution: observation(),
    planning: observation(),
    ...overrides,
  };
}

function capability(id: string): WebCapabilityNode {
  return { kind: 'capability', id, folderKey: id, spec: `# ${id} Specification\n` };
}

function writesEdge(from: string, to: string): WebGraphEdge {
  return { key: `writes:${from}->${to}`, kind: 'writes', from, to };
}

function token(
  overrides: Partial<WebTokenGroup> & Pick<WebTokenGroup, 'harness' | 'model'>,
): WebTokenGroup {
  return {
    input: 0,
    cachedInput: 0,
    output: 0,
    reasoning: 0,
    total: 0,
    ...overrides,
  };
}

function render(props: { report: typeof report; graph: WebGraph }): string {
  return renderToStaticMarkup(createElement(ReportView, props));
}

function count(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

describe('delivery report figures', () => {
  it('renders exactly five purpose-labeled inline SVG figures from fixture documents', () => {
    const html = render({ report, graph });
    assert.equal(count(html, /<figure/g), 5);
    assert.equal(count(html, /<svg/g), 5);
    assert.match(html, /Landed cost/);
    assert.match(html, /Token provenance/);
    assert.match(html, /First-attempt pass windows/);
    assert.match(html, /Covered task durations/);
    assert.match(html, /Cumulative capability writes/);
    assert.match(html, /role="img"/);
  });

  it('orders landed cost and labels every value with exact coverage', () => {
    const html = render({ report, graph });
    assert.match(html, /1 of 1 attempts reported/);
    assert.match(html, /\$1\.50/);
    assert.match(html, /\$0\.75/);
    // No landed change carries a planning record in the fixture.
    assert.match(html, /No change has a valid planning record/);
  });

  it('groups tokens by recorded harness and model with cache share', () => {
    const html = render({ report, graph });
    assert.match(html, /opencode/);
    assert.match(html, /big-pickle/);
    assert.match(html, /cache share/);
    assert.match(html, /23%/);
  });

  it('sums first-attempt pass windows and covered durations from graph observations', () => {
    const html = render({ report, graph });
    assert.match(html, /100%/);
    assert.match(html, /5 to 15s/);
  });

  it('renders cumulative landed writes in stable capability order', () => {
    const html = render({ report, graph });
    assert.match(html, /Cumulative capability writes/);
    assert.match(html, /alpha/);
  });

  it('renders both scope resolver generations, combined acceptance lines, and five counters', () => {
    const html = render({ report, graph });
    assert.match(html, /Legacy scope-file evidence/);
    assert.match(html, /Resolver-2 scope-file evidence/);
    assert.match(html, /Combined acceptance-line evidence/);
    assert.match(html, /Detected/);
    assert.match(html, /Verification passed at detection/);
    assert.match(html, /Verification failed at detection/);
    assert.match(html, /Recertified by human/);
    assert.match(html, /Requeued for agent/);
  });
});

describe('report projections', () => {
  const lateGraph: WebGraph = {
    capabilities: [capability('alpha')],
    changes: [
      changeNode({
        folderKey: '001-early',
        title: 'Early',
        landed: LANDED_EARLIER,
        execution: observation({
          cost: 2,
          costCoverage: { reported: 1, total: 1 },
          firstAttemptPass: { reported: 1, total: 1 },
          durations: [3],
        }),
      }),
      changeNode({
        folderKey: '004-late',
        title: 'Late',
        landed: LANDED_LATER,
        execution: observation({
          cost: 0,
          costCoverage: { reported: 1, total: 2 },
          firstAttemptPass: { reported: 1, total: 2 },
          durations: [10, 30],
        }),
        planning: observation({ cost: 0, costCoverage: { reported: 1, total: 1 } }),
      }),
    ],
    edges: [writesEdge('001-early', 'alpha'), writesEdge('004-late', 'alpha')],
  };

  it('marks the first valid planning record and never draws earlier planning zeros', () => {
    const changes = landedChanges(lateGraph);
    assert.equal(planningBoundaryIndex(changes), 1);
    assert.equal(changes[0]?.planningCost, null);
    assert.equal(changes[1]?.planningCost, 0);
    const html = render({ report, graph: lateGraph });
    assert.match(html, /Planning records begin at change 004-late/);
    assert.match(html, /\$0\.00/);
    assert.match(html, /unavailable \(0 of 0 sessions reported\)/);
    assert.match(html, /1 of 2 attempts reported/);
  });

  it('chunks landed changes into consecutive windows of at most five', () => {
    const nodes = Array.from({ length: 7 }, (_, index) =>
      changeNode({
        folderKey: `${String(index + 1).padStart(3, '0')}-change`,
        title: `Change ${index}`,
        landed: new Date(Date.parse(LANDED_EARLIER) + index * 86_400_000).toISOString(),
        execution: observation({ firstAttemptPass: { reported: 1, total: 1 } }),
      }),
    );
    const changes = landedChanges({ capabilities: [], changes: nodes, edges: [] });
    const windows = passWindows(changes);
    assert.equal(windows.length, 2);
    assert.equal(windows[0]?.changes.length, PASS_WINDOW_SIZE);
    assert.equal(windows[1]?.changes.length, 2);
    assert.equal(windows[0]?.reported, 5);
    assert.equal(windows[0]?.total, 5);
    assert.equal(windows[0]?.rate, 1);
    assert.equal(windows[1]?.rate, 1);
  });

  it('derives duration bins only from finite non-negative covered values', () => {
    const histogramGraph: WebGraph = {
      capabilities: [],
      changes: [
        changeNode({
          folderKey: '001-a',
          title: 'A',
          landed: LANDED_EARLIER,
          execution: observation({ durations: [0, 4, 5, 60, -3, Number.POSITIVE_INFINITY] }),
        }),
      ],
      edges: [],
    };
    const bins = durationHistogram(histogramGraph);
    assert.equal(
      bins.reduce((total, bin) => total + bin.count, 0),
      4,
    );
    assert.equal(bins[0]?.count, 2);
    assert.equal(bins[1]?.count, 1);
    assert.equal(bins[3]?.count, 1);
  });

  it('increments one unique writes edge per landed change in stable capability order', () => {
    const writesGraph: WebGraph = {
      capabilities: [capability('alpha'), capability('beta')],
      changes: [
        changeNode({ folderKey: '001-c', title: 'One', landed: LANDED_EARLIER }),
        changeNode({ folderKey: '002-c', title: 'Two', landed: LANDED_LATER }),
        changeNode({
          folderKey: '003-c',
          title: 'Three',
          landed: '2026-04-01T00:00:00.000Z',
        }),
      ],
      edges: [
        writesEdge('001-c', 'alpha'),
        writesEdge('002-c', 'alpha'),
        writesEdge('002-c', 'beta'),
        writesEdge('003-c', 'beta'),
      ],
    };
    const series = capabilityWriteSeries(writesGraph, landedChanges(writesGraph));
    assert.deepEqual(
      series.map((entry) => entry.id),
      ['alpha', 'beta'],
    );
    assert.equal(series[0]?.total, 2);
    assert.equal(series[1]?.total, 2);
    assert.deepEqual(
      series[0]?.points.map((point) => point.cumulative),
      [1, 2, 2],
    );
    assert.deepEqual(
      series[1]?.points.map((point) => point.cumulative),
      [0, 1, 2],
    );
  });

  it('keeps unlike and unavailable token provenance in separate buckets', () => {
    const tokenGraph: WebGraph = {
      capabilities: [],
      changes: [
        changeNode({
          folderKey: '001-a',
          title: 'A',
          landed: LANDED_EARLIER,
          execution: observation({
            tokens: [
              token({
                harness: 'opencode',
                model: 'big-pickle',
                input: 100,
                cachedInput: 50,
                output: 10,
                total: 160,
              }),
            ],
          }),
        }),
        changeNode({
          folderKey: '002-b',
          title: 'B',
          landed: LANDED_LATER,
          execution: observation({
            tokens: [token({ harness: 'codex', model: null, output: 25, total: 25 })],
          }),
        }),
      ],
      edges: [],
    };
    const totals = aggregateTokens(tokenGraph);
    assert.equal(totals.length, 2);
    const opencode = totals.find((entry) => entry.harness === 'opencode');
    assert.equal(opencode?.model, 'big-pickle');
    assert.equal(opencode?.cacheShare, 0.33);
    const codex = totals.find((entry) => entry.harness === 'codex');
    assert.equal(codex?.model, null);
    assert.equal(codex?.cacheShare, null);

    const html = render({ report, graph: tokenGraph });
    assert.match(html, /model unavailable/);
    assert.match(html, /33%/);
  });

  it('excludes active and rejected nodes from landed timelines but keeps their covered durations', () => {
    const mixedGraph: WebGraph = {
      capabilities: [],
      changes: [
        changeNode({ folderKey: '001-active', title: 'Active', landed: null, state: 'active' }),
        changeNode({
          folderKey: '002-rejected',
          title: 'Rejected',
          landed: null,
          state: 'rejected',
        }),
        changeNode({
          folderKey: '003-a',
          title: 'A',
          landed: LANDED_EARLIER,
          execution: observation({
            cost: 1,
            costCoverage: { reported: 1, total: 1 },
            firstAttemptPass: { reported: 1, total: 1 },
          }),
        }),
      ],
      edges: [],
    };
    const changes = landedChanges(mixedGraph);
    assert.deepEqual(
      changes.map((change) => change.folderKey),
      ['003-a'],
    );
  });

  it('drops landed nodes with a missing or malformed date', () => {
    const malformedGraph: WebGraph = {
      capabilities: [],
      changes: [
        changeNode({ folderKey: '001-a', title: 'A', landed: null }),
        changeNode({ folderKey: '002-b', title: 'B', landed: 'not-a-date' }),
      ],
      edges: [],
    };
    assert.deepEqual(landedChanges(malformedGraph), []);
    const html = render({ report, graph: malformedGraph });
    assert.equal(count(html, /<figure/g), 5);
    assert.match(html, /unavailable/);
  });
});

describe('scope evidence and empty history', () => {
  it('renders legacy and resolver-2 series separately with the recorded boundary', () => {
    const scoped = {
      ...report,
      history: {
        ...report.history,
        sizes: {
          scopeFileSeries: [
            {
              resolver: 'legacy' as const,
              startsAtChange: null,
              byScopeFiles: [
                {
                  bucket: '1-2',
                  tasks: 4,
                  firstAttemptPassRate: 0.75,
                  meanAttempts: 1.2,
                  medianDurationSeconds: 12,
                },
              ],
              largestFirstAttemptPass: null,
            },
            {
              resolver: 'resolver-2' as const,
              startsAtChange: '004-first-v2',
              byScopeFiles: [
                {
                  bucket: '3-4',
                  tasks: 2,
                  firstAttemptPassRate: 0.5,
                  meanAttempts: 1.5,
                  medianDurationSeconds: null,
                },
              ],
              largestFirstAttemptPass: {
                change: '004-first-v2',
                task: '1',
                title: 'First v2',
                scopeFiles: 4,
                acceptanceLines: 3,
              },
            },
          ],
          byAcceptanceLines: [
            {
              bucket: '1-2',
              tasks: 6,
              firstAttemptPassRate: 0.67,
              meanAttempts: 1.3,
              medianDurationSeconds: 9,
            },
          ],
        },
      },
    };
    const html = render({ report: scoped, graph });
    assert.match(html, /Legacy scope-file evidence/);
    assert.match(html, /Resolver-2 scope-file evidence/);
    assert.match(html, /begins at change 004-first-v2/);
    assert.match(html, /004-first-v2/);
    assert.match(html, /Combined acceptance-line evidence/);
  });

  it('server-renders empty history without network access and without throwing', () => {
    const originalFetch = globalThis.fetch;
    let used = false;
    globalThis.fetch = (() => {
      used = true;
      throw new Error('network must not be used');
    }) as typeof globalThis.fetch;
    try {
      const html = render({
        report,
        graph: { capabilities: [], changes: [], edges: [] },
      });
      assert.equal(count(html, /<figure/g), 5);
      assert.equal(count(html, /<svg/g), 5);
      assert.match(html, /unavailable/);
      assert.equal(used, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('never mutates the MetricsReport or WebGraph inputs', () => {
    const reportBefore = JSON.stringify(report);
    const graphBefore = JSON.stringify(graph);
    render({ report, graph });
    assert.equal(JSON.stringify(report), reportBefore);
    assert.equal(JSON.stringify(graph), graphBefore);
  });
});

describe('report module line budget', () => {
  it('keeps every report source file at or under 250 lines', async () => {
    const dir = path.join(ROOT, 'packages', 'ui', 'src', 'report');
    const entries = await fs.readdir(dir);
    const violations: string[] = [];
    for (const entry of entries) {
      const source = await fs.readFile(path.join(dir, entry), 'utf8');
      const lines = source.split('\n').length;
      if (lines > 250) violations.push(`${entry} has ${lines} lines`);
    }
    assert.deepEqual(violations, []);
  });
});
