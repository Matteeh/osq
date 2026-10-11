/**
 * The code map: for each scenario of an opted-in capability, the functions the
 * system graph's `serves` edges tie to it and the test files its `proves`
 * edges tie to it. The graph is loaded once through `getSystemGraph`, and
 * every value is read from it; nothing is persisted.
 */

import type { OsqConfig } from '../core/foundation/config.js';
import type { DeltaRequirement } from '../core/spec/delta.js';
import type { SystemGraph, SystemGraphNode } from '../core/web/system-graph-types.js';
import { getSystemGraph } from '../core/web/system-graph.js';
import type { CodeMapEntry, CodeMapFunction } from './docs-types.js';

/** One opted-in capability and its living requirements. */
export interface CodeMapSource {
  readonly name: string;
  readonly requirements: readonly DeltaRequirement[];
}

/** Append `value` under `key`. */
function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function compareFunctions(a: CodeMapFunction, b: CodeMapFunction): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  return a.line - b.line;
}

/** Functions whose `serves` edge ends at `id`, sorted by file then line. */
function functionsFor(
  id: string,
  sources: ReadonlyMap<string, string[]>,
  nodes: ReadonlyMap<string, SystemGraphNode>,
): CodeMapFunction[] {
  const found: CodeMapFunction[] = [];
  for (const source of sources.get(id) ?? []) {
    const node = nodes.get(source);
    if (node?.kind === 'function') {
      found.push({ file: node.file, line: node.line, name: node.name });
    }
  }
  return found.sort(compareFunctions);
}

/** Test files whose `proves` edge ends at `id`, sorted. */
function testsFor(
  id: string,
  sources: ReadonlyMap<string, string[]>,
  nodes: ReadonlyMap<string, SystemGraphNode>,
): string[] {
  const found = new Set<string>();
  for (const source of sources.get(id) ?? []) {
    const node = nodes.get(source);
    if (node?.kind === 'test') found.add(node.file);
  }
  return [...found].sort();
}

/**
 * Build one capability's code map from a system graph: one entry per scenario
 * in spec order. The exact scenario node id is used, falling back to the first
 * scenario node of that capability and name on a collision.
 *
 * @scenario docs: Pages of the docs fixture
 * @adr 016
 */
export function codeMapFromGraph(
  graph: SystemGraph,
  capability: string,
  requirements: readonly DeltaRequirement[],
): CodeMapEntry[] {
  const nodes = new Map<string, SystemGraphNode>(
    graph.nodes.map((node) => [node.id, node] as const),
  );
  const serves = new Map<string, string[]>();
  const proves = new Map<string, string[]>();
  const byName = new Map<string, string>();
  for (const node of graph.nodes) {
    if (node.kind !== 'scenario' || node.capability !== capability) continue;
    if (!byName.has(node.name)) byName.set(node.name, node.id);
  }
  for (const edge of graph.edges) {
    if (edge.kind === 'serves') push(serves, edge.to, edge.from);
    else if (edge.kind === 'proves') push(proves, edge.to, edge.from);
  }

  const entries: CodeMapEntry[] = [];
  for (const requirement of requirements) {
    for (const scenario of requirement.scenarios) {
      const exact = `scenario:${capability}/${requirement.name}/${scenario.name}`;
      const id = nodes.has(exact) ? exact : byName.get(scenario.name);
      entries.push({
        requirement: requirement.name,
        scenario: scenario.name,
        functions: id === undefined ? [] : functionsFor(id, serves, nodes),
        tests: id === undefined ? [] : testsFor(id, proves, nodes),
      });
    }
  }
  return entries;
}

/**
 * Load the system graph and build the code map of every source, in source
 * order. The graph is loaded once.
 *
 * @scenario docs: Pages of the docs fixture
 * @adr 016
 */
export async function buildCodeMaps(
  projectRoot: string,
  config: OsqConfig,
  sources: readonly CodeMapSource[],
): Promise<Map<string, CodeMapEntry[]>> {
  const graph = await getSystemGraph(projectRoot, config);
  const maps = new Map<string, CodeMapEntry[]>();
  for (const source of sources) {
    maps.set(source.name, codeMapFromGraph(graph, source.name, source.requirements));
  }
  return maps;
}
