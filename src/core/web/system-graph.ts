/**
 * The system graph: one versioned document assembled from the living specs,
 * sidecars, ADRs, changes, imports, and Code ownership. Derived from the
 * current project tree on every call, with nothing persisted and no layout.
 */

import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { collectMutationScores } from '../report/report-mutation.js';
import { buildImportGraph } from '../spec/import-graph.js';
import { listChanges } from '../status/change-locations.js';
import { buildScenarioIndex } from '../trace/scenario-index.js';
import { buildSystemGraphCode } from './system-graph-code.js';
import { buildSystemGraphSpecs } from './system-graph-specs.js';
import { buildSystemGraphTrace } from './system-graph-trace.js';
import type {
  SystemGraph,
  SystemGraphEdge,
  SystemGraphIdAllocator,
  SystemGraphNode,
  SystemGraphTracePart,
} from './system-graph-types.js';
import { getWebGraph } from './web-data-graph.js';
import type { WebGraph } from './web-data-types.js';

/** Allocate collision-safe node ids, suffixing `~2`, `~3`, ... on repeats. */
export function createSystemGraphIdAllocator(): SystemGraphIdAllocator {
  const counts = new Map<string, number>();
  return (base) => {
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return count === 0 ? base : `${base}~${count + 1}`;
  };
}

function changeNodes(graph: WebGraph): SystemGraphNode[] {
  return graph.changes.map((change) => ({
    kind: 'change' as const,
    id: `change:${change.folderKey}`,
    folderKey: change.folderKey,
    number: change.id,
    title: change.title,
    state: change.state,
    landed: change.landed,
  }));
}

function changeEdges(graph: WebGraph): SystemGraphEdge[] {
  const edges: SystemGraphEdge[] = [];
  for (const edge of graph.edges) {
    if (edge.kind !== 'reads' && edge.kind !== 'writes') continue;
    const from = `change:${edge.from}`;
    const to = `capability:${edge.to}`;
    edges.push({ key: `${edge.kind}:${from}->${to}`, kind: edge.kind, from, to });
  }
  return edges;
}

/** Apply the traceability part's opted-in state and gaps to one spec node. */
function applyTraceability(node: SystemGraphNode, trace: SystemGraphTracePart): SystemGraphNode {
  if (node.kind === 'capability') {
    const gaps = trace.gaps.get(node.name);
    return gaps === undefined ? node : { ...node, traceability: true, gaps };
  }
  if (node.kind === 'scenario') {
    const gap = trace.scenarioGaps.get(node.id);
    if (gap !== undefined) return { ...node, gap };
  }
  return node;
}

function compareId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function dedupeEdges(edges: readonly SystemGraphEdge[]): SystemGraphEdge[] {
  const byKey = new Map<string, SystemGraphEdge>();
  for (const edge of edges) if (!byKey.has(edge.key)) byKey.set(edge.key, edge);
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * Derive the system graph from the current project tree. Nodes are sorted by
 * id, edges by key, and each edge appears once.
 */
export async function getSystemGraph(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<SystemGraph> {
  const allocateId = createSystemGraphIdAllocator();
  const webGraph = await getWebGraph(projectRoot, config);
  const specs = await buildSystemGraphSpecs(projectRoot, config, allocateId);
  const code = await buildSystemGraphCode(projectRoot, config);
  const importGraph = await buildImportGraph(projectRoot, { skip: [config.paths.openspecRoot] });
  const index = buildScenarioIndex(projectRoot, importGraph);
  const changes = await listChanges(projectRoot, config, ['active', 'archived']);
  const mutationScores = await collectMutationScores(
    changes.map((change) => change.folderPath),
    config,
  );
  const trace = await buildSystemGraphTrace({
    projectRoot,
    config,
    index,
    specNodes: specs.nodes,
    mutationScores,
    allocateId,
  });
  const nodes = [
    ...specs.nodes.map((node) => applyTraceability(node, trace)),
    ...code.nodes,
    ...changeNodes(webGraph),
    ...trace.nodes,
  ];
  const edges = [...specs.edges, ...code.edges, ...changeEdges(webGraph), ...trace.edges];
  return { version: 1, nodes: nodes.sort(compareId), edges: dedupeEdges(edges) };
}
