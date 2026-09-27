import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_GRAPH_CONTROLS, GraphView, graphLayout } from '../packages/ui/src/graph/index.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import type { WebCapabilityNode, WebGraph } from '../src/core/web/web-data-types.js';
import { getWebGraph } from '../src/core/web/web-data.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-ui-graph-groups-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function write(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

function capability(id: string, group?: string | null): WebCapabilityNode {
  return {
    kind: 'capability',
    id,
    folderKey: id,
    spec: `# ${id} Specification\n\n${id} body\n`,
    ...(group === undefined ? {} : { group }),
  };
}

function graphOf(capabilities: readonly WebCapabilityNode[]): WebGraph {
  return { capabilities, changes: [], edges: [] };
}

function render(graph: WebGraph): string {
  return renderToStaticMarkup(
    createElement(GraphView, { graph, onNavigate: () => {}, initialControls: undefined }),
  );
}

function count(html: string, pattern: RegExp): number {
  const global = new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
  );
  return (html.match(global) ?? []).length;
}

describe('graph layout with capability groups', () => {
  it('orders lanes by group name with ungrouped last and keeps the order within a group', () => {
    const graph = graphOf([
      capability('pricing', 'inventory'),
      capability('cli', 'platform'),
      capability('orders'),
    ]);
    const layout = graphLayout(graph, DEFAULT_GRAPH_CONTROLS);
    assert.deepEqual(
      layout.lanes.map((lane) => lane.id),
      ['pricing', 'cli', 'orders'],
    );
    assert.deepEqual(
      layout.groups.map((group) => group.group),
      ['inventory', 'platform', 'ungrouped'],
    );
    assert.deepEqual(
      layout.groups.map((group) => group.laneIds),
      [['pricing'], ['cli'], ['orders']],
    );

    const yById = new Map(layout.lanes.map((lane) => [lane.id, lane.y]));
    for (const group of layout.groups) {
      for (const id of group.laneIds) {
        assert.ok(group.y < (yById.get(id) ?? Number.POSITIVE_INFINITY));
      }
    }
    assert.ok((layout.groups[0]?.y ?? 0) < (layout.groups[1]?.y ?? 0));
    assert.ok((layout.groups[1]?.y ?? 0) < (layout.groups[2]?.y ?? 0));
  });

  it('keeps the capability order inside a group across several lanes', () => {
    const graph = graphOf([
      capability('b1', 'beta'),
      capability('a1', 'alpha'),
      capability('b2', 'beta'),
    ]);
    const layout = graphLayout(graph, DEFAULT_GRAPH_CONTROLS);
    assert.deepEqual(
      layout.lanes.map((lane) => lane.id),
      ['a1', 'b1', 'b2'],
    );
    assert.deepEqual(
      layout.groups.map((group) => group.group),
      ['alpha', 'beta'],
    );
    assert.deepEqual(layout.groups[1]?.laneIds, ['b1', 'b2']);
  });

  it('keeps the ungrouped layout when no capability has a group', () => {
    const withNulls = graphOf([capability('alpha', null), capability('beta', null)]);
    const withoutField = graphOf([capability('alpha'), capability('beta')]);
    const layout = graphLayout(withNulls, DEFAULT_GRAPH_CONTROLS);
    const plain = graphLayout(withoutField, DEFAULT_GRAPH_CONTROLS);
    assert.deepEqual(layout.groups, []);
    assert.deepEqual(
      layout.lanes.map((lane) => lane.id),
      ['alpha', 'beta'],
    );
    const geometry = (value: typeof layout): unknown => ({
      lanes: value.lanes.map((lane) => ({ id: lane.id, index: lane.index, y: lane.y })),
      groups: value.groups,
      marks: value.marks,
      depends: value.depends,
      reads: value.reads,
      width: value.width,
      height: value.height,
      laneLabelWidth: value.laneLabelWidth,
      plotRight: value.plotRight,
      activeBand: value.activeBand,
      rejectedBand: value.rejectedBand,
    });
    assert.deepEqual(geometry(layout), geometry(plain));
  });
});

describe('graph canvas with capability groups', () => {
  it('draws one labelled header row per group', () => {
    const graph = graphOf([
      capability('pricing', 'inventory'),
      capability('cli', 'platform'),
      capability('orders'),
    ]);
    const html = render(graph);
    assert.equal(count(html, /class="graph-group-header"/), 3);
    assert.match(html, /data-group="inventory"/);
    assert.match(html, /data-group="platform"/);
    assert.match(html, /data-group="ungrouped"/);
    assert.match(html, /class="graph-group-label"[^>]*>inventory</);
    assert.match(html, /class="graph-group-label"[^>]*>platform</);
    assert.match(html, /class="graph-group-label"[^>]*>ungrouped</);
  });

  it('draws no group header when no capability has a group', () => {
    const html = render(graphOf([capability('alpha'), capability('beta')]));
    assert.equal(count(html, /class="graph-group-header"/), 0);
    assert.equal(html.includes('data-group='), false);
  });
});

describe('capability groups in the web data', () => {
  it('fills group from the living sidecar and null without one', async () => {
    await write(
      tmpDir,
      'openspec/specs/pricing/spec.md',
      '# pricing Specification\n\n## Purpose\n\npricing purpose.\n',
    );
    await write(tmpDir, 'openspec/specs/pricing/osq.yml', 'group: inventory\n');
    await write(
      tmpDir,
      'openspec/specs/orders/spec.md',
      '# orders Specification\n\n## Purpose\n\norders purpose.\n',
    );
    await write(
      tmpDir,
      'openspec/specs/broken/spec.md',
      '# broken Specification\n\n## Purpose\n\nbroken purpose.\n',
    );
    await write(tmpDir, 'openspec/specs/broken/osq.yml', 'group: 7\n');

    const graph = await getWebGraph(tmpDir, DEFAULT_CONFIG);
    const byId = new Map(graph.capabilities.map((node) => [node.id, node]));
    assert.equal(byId.get('pricing')?.group, 'inventory');
    assert.equal(byId.get('orders')?.group, null);
    assert.equal(byId.get('broken')?.group, null);
  });
});
