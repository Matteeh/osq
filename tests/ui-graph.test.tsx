import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DEFAULT_GRAPH_CONTROLS,
  GRAPH_GEOMETRY,
  type GraphControls,
  GraphView,
  activationKey,
  changeRoute,
  fillValue,
  graphControlsReducer,
  graphLayout,
  navigateToChange,
  orderedArchived,
} from '../packages/ui/src/graph/index.js';
import { routeToHash } from '../packages/ui/src/router.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import type {
  WebCapabilityNode,
  WebChangeNode,
  WebGraph,
  WebGraphEdge,
  WebMetricObservation,
} from '../src/core/web/web-data-types.js';
import { getWebGraph } from '../src/core/web/web-data.js';
import { buildWebFixture } from './fixtures/web/build.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const EARLY = '2026-01-01T00:00:00.000Z';
const LATE = '2026-03-01T00:00:00.000Z';

let tmpDir: string;
let graph: WebGraph;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-ui-graph-'));
  await buildWebFixture(tmpDir);
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

function capability(id: string): WebCapabilityNode {
  return { kind: 'capability', id, folderKey: id, spec: `# ${id} Specification\n\n${id} body\n` };
}

function edge(kind: WebGraphEdge['kind'], from: string, to: string): WebGraphEdge {
  return { key: `${kind}:${from}->${to}`, kind, from, to };
}

function withControls(overrides: Partial<GraphControls> = {}): GraphControls {
  return { ...DEFAULT_GRAPH_CONTROLS, ...overrides };
}

function render(props: {
  graph: WebGraph;
  onNavigate?: () => void;
  initialControls?: GraphControls;
}): string {
  return renderToStaticMarkup(
    createElement(GraphView, {
      graph: props.graph,
      onNavigate: props.onNavigate ?? (() => {}),
      initialControls: props.initialControls,
    }),
  );
}

function count(html: string, pattern: RegExp): number {
  const global = new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
  );
  return (html.match(global) ?? []).length;
}

describe('graph layout helpers', () => {
  it('orders archived changes by landed time then folder key and drops bad dates', () => {
    const mixed: WebGraph = {
      capabilities: [capability('alpha')],
      changes: [
        changeNode({ folderKey: '002-b', title: 'B', landed: LATE }),
        changeNode({ folderKey: '001-a', title: 'A', landed: EARLY }),
        changeNode({ folderKey: '003-tie', title: 'Tie', landed: LATE }),
        changeNode({ folderKey: '004-bad', title: 'Bad', landed: 'not-a-date' }),
        changeNode({ folderKey: '005-active', title: 'Active', state: 'active' }),
      ],
      edges: [],
    };
    const ordered = orderedArchived(mixed);
    assert.deepEqual(
      ordered.map((entry) => entry.node.folderKey),
      ['001-a', '002-b', '003-tie'],
    );
    const layout = graphLayout(mixed, DEFAULT_GRAPH_CONTROLS);
    assert.deepEqual(
      layout.marks.map((mark) => mark.folderKey),
      ['001-a', '002-b', '003-tie', '005-active'],
    );
    const archivedMarks = layout.marks.filter((mark) => mark.location === 'archived');
    assert.ok((archivedMarks[0]?.x ?? 0) < (archivedMarks[1]?.x ?? 0));
    // Equal landed times get stable per-location ordinal offsets, not exact overlap.
    assert.ok((archivedMarks[1]?.x ?? 0) < (archivedMarks[2]?.x ?? 0));
  });

  it('renders one mark per change and connects every lane named by writes edges', () => {
    const multi: WebGraph = {
      capabilities: [capability('alpha'), capability('beta')],
      changes: [
        changeNode({ folderKey: '001-both', title: 'Both', landed: EARLY }),
        changeNode({ folderKey: '002-active', title: 'Active', state: 'active' }),
      ],
      edges: [
        edge('writes', '001-both', 'alpha'),
        edge('writes', '001-both', 'beta'),
        // A writes edge to an absent capability must not grow a synthetic lane.
        edge('writes', '001-both', 'ghost'),
      ],
    };
    const layout = graphLayout(multi, DEFAULT_GRAPH_CONTROLS);
    assert.deepEqual(
      layout.lanes.map((lane) => lane.id),
      ['alpha', 'beta'],
    );
    const both = layout.marks.find((mark) => mark.folderKey === '001-both');
    assert.deepEqual(both?.laneIds, ['alpha', 'beta']);
    assert.equal(both?.laneTargets.length, 2);
    assert.equal(layout.marks.filter((mark) => mark.folderKey === '001-both').length, 1);
    assert.equal(layout.marks.length, 2);
    // The two-lane mark sits between its anchors and connects them vertically.
    assert.ok((both?.y ?? 0) > (both?.laneTargets[0]?.y ?? 0));
    assert.ok((both?.y ?? 0) < (both?.laneTargets[1]?.y ?? Number.POSITIVE_INFINITY));
  });

  it('places active changes in a right gutter and rejected ones only on demand', () => {
    const layout = graphLayout(graph, DEFAULT_GRAPH_CONTROLS);
    assert.equal(
      layout.marks.some((mark) => mark.location === 'rejected'),
      false,
    );
    assert.equal(layout.rejectedBand, null);
    const active = layout.marks.find((mark) => mark.folderKey === '010-active-change');
    assert.equal(active?.location, 'active');
    assert.ok((active?.x ?? 0) > layout.plotRight);

    const shown = graphLayout(graph, withControls({ rejectedVisible: true }));
    assert.notEqual(shown.rejectedBand, null);
    const rejected = shown.marks.find((mark) => mark.location === 'rejected');
    assert.ok((rejected?.x ?? 0) > (active?.x ?? 0));
  });

  it('keeps a usable minimum content geometry derived from node count', () => {
    const empty = graphLayout({ capabilities: [], changes: [], edges: [] }, DEFAULT_GRAPH_CONTROLS);
    assert.ok(empty.width >= GRAPH_GEOMETRY.minPlotWidth);
    assert.ok(empty.height > 0);
    assert.ok(empty.plotRight > GRAPH_GEOMETRY.laneLabelWidth);
    const wide = graphLayout(graph, DEFAULT_GRAPH_CONTROLS);
    assert.ok(wide.width >= empty.width);
    assert.equal(wide.width, graphLayout(graph, DEFAULT_GRAPH_CONTROLS).width);
  });

  it('never mutates the graph document while projecting controls', () => {
    const before = JSON.stringify(graph);
    graphLayout(graph, DEFAULT_GRAPH_CONTROLS);
    graphLayout(graph, withControls({ fill: 'attempts', rejectedVisible: true }));
    assert.equal(JSON.stringify(graph), before);
  });
});

describe('graph controls and fill', () => {
  it('toggles each layer independently and toggles capability selection', () => {
    const noReads = graphControlsReducer(DEFAULT_GRAPH_CONTROLS, { type: 'toggle-reads' });
    assert.equal(noReads.readsVisible, false);
    assert.equal(noReads.dependsVisible, true);
    assert.equal(noReads.rejectedVisible, false);
    const noDepends = graphControlsReducer(noReads, { type: 'toggle-depends' });
    assert.equal(noDepends.dependsVisible, false);
    assert.equal(noDepends.readsVisible, false);
    const selected = graphControlsReducer(noDepends, {
      type: 'select-capability',
      capability: 'alpha',
    });
    assert.equal(selected.selectedCapability, 'alpha');
    assert.equal(
      graphControlsReducer(selected, { type: 'select-capability', capability: 'alpha' })
        .selectedCapability,
      null,
    );
    const attempts = graphControlsReducer(selected, { type: 'set-fill', fill: 'attempts' });
    assert.equal(attempts.fill, 'attempts');
    assert.equal(DEFAULT_GRAPH_CONTROLS.readsVisible, true);
  });

  it('drops each relationship layer without touching the document', () => {
    const before = JSON.stringify(graph);
    const full = graphLayout(graph, DEFAULT_GRAPH_CONTROLS);
    assert.equal(full.depends.length, 1);
    assert.equal(full.reads.length, 1);

    const withoutDepends = graphLayout(graph, withControls({ dependsVisible: false }));
    assert.equal(withoutDepends.depends.length, 0);
    assert.equal(withoutDepends.reads.length, 1);
    const withoutReads = graphLayout(graph, withControls({ readsVisible: false }));
    assert.equal(withoutReads.reads.length, 0);
    assert.equal(withoutReads.depends.length, 1);
    assert.equal(JSON.stringify(graph), before);
  });

  it('switches fill between summed observed cost and direct attempts', () => {
    const active = graph.changes.find((node) => node.folderKey === '010-active-change');
    assert.ok(active);
    const cost = fillValue(active, 'cost');
    assert.equal(cost.value, 0.75);
    assert.deepEqual(cost.coverage, { reported: 2, total: 5 });
    assert.equal(cost.state, 'partial');
    const attempts = fillValue(active, 'attempts');
    assert.equal(attempts.value, 3);
    assert.equal(attempts.state, 'complete');

    const layout = graphLayout(graph, withControls({ fill: 'attempts' }));
    const mark = layout.marks.find((entry) => entry.folderKey === '010-active-change');
    assert.equal(mark?.fill.mode, 'attempts');
    assert.equal(mark?.fill.value, active.attempts);
  });

  it('distinguishes absent and partial cost coverage without estimating', () => {
    const absent = changeNode({
      folderKey: '001-absent',
      title: 'Absent',
      execution: observation({ cost: null, costCoverage: { reported: 0, total: 2 } }),
    });
    const missing = fillValue(absent, 'cost');
    assert.equal(missing.value, null);
    assert.equal(missing.state, 'missing');
    assert.deepEqual(missing.coverage, { reported: 0, total: 2 });

    const partial = changeNode({
      folderKey: '002-partial',
      title: 'Partial',
      execution: observation({ cost: 1.5, costCoverage: { reported: 1, total: 1 } }),
      planning: observation({ cost: null, costCoverage: { reported: 0, total: 2 } }),
    });
    assert.equal(fillValue(partial, 'cost').state, 'partial');
    assert.equal(fillValue(partial, 'cost').value, 1.5);

    const complete = changeNode({
      folderKey: '003-complete',
      title: 'Complete',
      execution: observation({ cost: 1.5, costCoverage: { reported: 1, total: 1 } }),
      planning: observation({ cost: 0.25, costCoverage: { reported: 1, total: 1 } }),
    });
    assert.equal(fillValue(complete, 'cost').state, 'complete');
    assert.equal(fillValue(complete, 'cost').value, 1.75);
  });
});

describe('graph rendering', () => {
  it('renders labelled lanes, one mark per change, and typed relationship groups', () => {
    const html = render({ graph });
    assert.match(html, /Capability archive/);
    assert.equal(count(html, /data-capability=/), 2);
    assert.match(html, /data-capability="alpha"/);
    assert.match(html, /data-capability="beta"/);
    assert.ok(count(html, /data-change="010-active-change"/) === 1);
    assert.equal(count(html, /class="graph-mark /), graph.changes.length - 1);
    assert.match(html, /graph-relationships-depends/);
    assert.match(html, /graph-relationships-reads/);
    assert.match(html, /Dependency/);
    assert.match(html, /Reads/);
    assert.match(html, /graph-mark-connector/);
    assert.ok(count(html, /tabindex="0"/) >= 3);
  });

  it('hides rejected content by default and reveals it through the toggle', () => {
    const hidden = render({ graph });
    assert.equal(hidden.includes('002-rejected-change'), false);
    const shown = render({
      graph,
      initialControls: withControls({ rejectedVisible: true }),
    });
    assert.match(shown, /002-rejected-change/);
    assert.match(shown, /Rejected changes/);
  });

  it('exposes semantic controls with visible labels', () => {
    const html = render({ graph });
    assert.equal(count(html, /type="checkbox"/), 3);
    assert.equal(count(html, /type="radio"/), 2);
    assert.match(html, /Show rejected changes/);
    assert.match(html, /Show reads relationships/);
    assert.match(html, /Show dependency relationships/);
    assert.match(html, /Observed total cost/);
    assert.match(html, /Execution attempts/);
  });

  it('states the exact value and coverage in every focus label', () => {
    const html = render({ graph });
    const label = html.match(/aria-label="(Active Change;[^"]*)"/)?.[1] ?? '';
    assert.match(label, /Active Change/);
    assert.match(label, /date /);
    assert.match(label, /planner opencode\/big-pickle/);
    assert.match(label, /tasks 3/);
    assert.match(label, /attempts 3/);
    assert.match(label, /cost \$0\.75 \(2 of 5 attempts and sessions reported\)/);
    assert.match(label, /writes alpha, beta/);
  });

  it('switches the rendered fill mode without hiding coverage', () => {
    const html = render({ graph, initialControls: withControls({ fill: 'attempts' }) });
    assert.match(html, /3 attempts/);
    assert.match(html, /graph-fill-/);
  });

  it('scopes the SVG inside a labelled horizontally scrollable region', () => {
    const html = render({ graph });
    const layout = graphLayout(graph, DEFAULT_GRAPH_CONTROLS);
    assert.match(html, /aria-label="Capability archive graph"/);
    assert.match(html, /overflow-x:auto/);
    assert.match(html, new RegExp(`<svg[^>]*width="${layout.width}"`));
    assert.ok(layout.width >= GRAPH_GEOMETRY.minPlotWidth);
  });

  it('exposes complete capability spec text only after the exported selection transition', () => {
    const defaultHtml = render({ graph });
    assert.match(defaultHtml, /Activate a capability lane/);
    assert.equal(defaultHtml.includes('alpha capability purpose text.'), false);

    const selected = graphControlsReducer(DEFAULT_GRAPH_CONTROLS, {
      type: 'select-capability',
      capability: 'alpha',
    });
    const html = render({ graph, initialControls: selected });
    assert.match(html, /alpha specification/);
    assert.match(html, /alpha capability purpose text\./);
  });

  it('server-renders representative states without any network access', () => {
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
      const html = render({ graph, initialControls: withControls({ rejectedVisible: true }) });
      assert.ok(html.length > 0);
      assert.equal(used, false);
    } finally {
      globalThis.fetch = originalFetch;
      (globalThis as { EventSource?: unknown }).EventSource = originalEvents;
    }
  });
});

describe('graph interaction helpers', () => {
  it('navigates to a change folder-key route through the supplied callback', () => {
    assert.deepEqual(changeRoute('003-archived-unique'), {
      name: 'change',
      folderKey: '003-archived-unique',
    });
    assert.equal(routeToHash(changeRoute('003-archived-unique')), '#/changes/003-archived-unique');
    const routes: unknown[] = [];
    navigateToChange('010-active-change', (route) => routes.push(route));
    assert.deepEqual(routes, [{ name: 'change', folderKey: '010-active-change' }]);
  });

  it('activates on Enter and Space and ignores other keys', () => {
    let activations = 0;
    let prevented = 0;
    const event = (key: string) => ({
      key,
      preventDefault: () => {
        prevented += 1;
      },
    });
    activationKey(event('Enter'), () => {
      activations += 1;
    });
    activationKey(event(' '), () => {
      activations += 1;
    });
    activationKey(event('Spacebar'), () => {
      activations += 1;
    });
    activationKey(event('a'), () => {
      activations += 1;
    });
    assert.equal(activations, 3);
    assert.equal(prevented, 3);
  });
});

describe('graph module line budget', () => {
  it('keeps every graph source file at or under 250 lines', async () => {
    const dir = path.join(ROOT, 'packages', 'ui', 'src', 'graph');
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
