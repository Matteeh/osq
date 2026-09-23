import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChangesView, orderChangeNodes } from '../packages/ui/src/changes/index.js';
import type {
  WebChangeNode,
  WebGraph,
  WebMetricObservation,
} from '../src/core/web/web-data-types.js';

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
  overrides: Partial<WebChangeNode> & Pick<WebChangeNode, 'folderKey' | 'title'>,
): WebChangeNode {
  return {
    kind: 'change',
    id: null,
    slug: overrides.folderKey,
    state: 'archived',
    created: null,
    approved: null,
    landed: null,
    rejection: null,
    planner: null,
    taskCount: 1,
    attempts: 0,
    execution: observation(),
    planning: observation(),
    ...overrides,
  };
}

function render(changes: readonly WebChangeNode[]): string {
  const graph: WebGraph = { capabilities: [], changes, edges: [] };
  return renderToStaticMarkup(createElement(ChangesView, { graph, onNavigate: () => {} }));
}

function count(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

const MIXED: readonly WebChangeNode[] = [
  changeNode({
    folderKey: '005-late-active',
    title: 'Late Active',
    id: 5,
    state: 'active',
    approved: '2026-02-01T00:00:00.000Z',
    taskCount: 4,
    doneCount: 2,
    landed: '2026-02-01T00:00:00.000Z',
    execution: observation({ cost: 1.25, costCoverage: { reported: 1, total: 2 } }),
  }),
  changeNode({
    folderKey: '007-unapproved',
    title: 'Unapproved',
    id: 7,
    state: 'active',
    approved: null,
    taskCount: 2,
    doneCount: 0,
  }),
  changeNode({
    folderKey: '003-archived',
    title: 'Archived',
    id: 3,
    state: 'archived',
    taskCount: 1,
    doneCount: 1,
    landed: '2026-01-10T00:00:00.000Z',
  }),
  changeNode({ folderKey: '002-rejected', title: 'Rejected', id: 2, state: 'rejected' }),
];

describe('changes view', () => {
  it('renders mixed changes once each with state, progress, costs, and landed date', () => {
    const html = render(MIXED);

    for (const key of ['005-late-active', '007-unapproved', '003-archived', '002-rejected']) {
      assert.equal(count(html, new RegExp(`href="#/changes/${key}"`, 'g')), 1, key);
    }
    assert.match(html, /5: Late Active/);
    assert.match(html, /in progress/);
    assert.match(html, /awaiting approval/);
    assert.match(html, /archived/);
    assert.match(html, /rejected/);
    assert.match(html, /2 of 4/);
    assert.match(html, /\$1\.25/);
    assert.match(html, /2026-02-01T00:00:00\.000Z/);
    assert.match(html, /—/);
  });

  it('puts active changes first, then the rest, each group by descending id', () => {
    assert.deepEqual(
      orderChangeNodes(MIXED).map((node) => node.folderKey),
      ['007-unapproved', '005-late-active', '003-archived', '002-rejected'],
    );
    const html = render(MIXED);
    const order = ['007-unapproved', '005-late-active', '003-archived', '002-rejected'].map((key) =>
      html.indexOf(`href="#/changes/${key}"`),
    );
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
    );
  });

  it('reads an approved active change as in progress with its done count', () => {
    const html = render([
      changeNode({
        folderKey: '010-active',
        title: 'Active',
        id: 10,
        state: 'active',
        approved: '2026-02-01T00:00:00.000Z',
        taskCount: 4,
        doneCount: 2,
      }),
    ]);
    assert.match(html, /in progress/);
    assert.match(html, /2 of 4/);
  });

  it('formats both cost columns through the shared formatter without a zero dollar value', () => {
    const html = render([
      changeNode({
        folderKey: '004-zero',
        title: 'Zero',
        id: 4,
        execution: observation({ cost: 0, costCoverage: { reported: 0, total: 3 } }),
        planning: observation({ cost: null, costCoverage: { reported: 0, total: 2 } }),
      }),
    ]);
    assert.equal(count(html, /not reported/g), 2);
    assert.doesNotMatch(html, /\$0\.0000/);
  });
});
