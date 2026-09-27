/**
 * Builds the code half of the system graph: the unowned `file` nodes and the
 * capability-to-capability `imports` edges. Ownership comes from each living
 * spec's Code ownership block; imports come from the import graph built with
 * the OpenSpec root left out. Nothing is persisted.
 */

import type { OsqConfig } from '../foundation/config.js';
import { ownerCapabilities, readCapabilityOwnership } from '../spec/capability-impact.js';
import { buildImportGraph } from '../spec/import-graph.js';
import { isTestPath } from '../trace/test-path.js';
import type {
  SystemGraphEdge,
  SystemGraphFilePair,
  SystemGraphNode,
  SystemGraphPart,
} from './system-graph-types.js';

function comparePairs(a: SystemGraphFilePair, b: SystemGraphFilePair): number {
  if (a.from !== b.from) return a.from < b.from ? -1 : 1;
  if (a.to !== b.to) return a.to < b.to ? -1 : 1;
  return 0;
}

function sortedPairs(pairs: readonly SystemGraphFilePair[]): SystemGraphFilePair[] {
  const seen = new Set<string>();
  const unique: SystemGraphFilePair[] = [];
  for (const pair of pairs) {
    const key = `${pair.from}\u0000${pair.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(pair);
  }
  return unique.sort(comparePairs);
}

function fileNodes(
  graph: Awaited<ReturnType<typeof buildImportGraph>>,
  ownersOf: ReadonlyMap<string, readonly string[]>,
): SystemGraphNode[] {
  const nodes: SystemGraphNode[] = [];
  for (const file of graph.files) {
    if ((ownersOf.get(file) ?? []).length > 0) continue;
    nodes.push({ kind: 'file', id: `file:${file}`, path: file, gap: 'unowned' });
  }
  return nodes;
}

function importEdges(
  graph: Awaited<ReturnType<typeof buildImportGraph>>,
  ownersOf: ReadonlyMap<string, readonly string[]>,
): SystemGraphEdge[] {
  const pairsByEdge = new Map<string, SystemGraphFilePair[]>();
  for (const file of graph.files) {
    const importers = ownersOf.get(file) ?? [];
    if (importers.length === 0) continue;
    for (const target of graph.importsOf(file)) {
      const targets = ownersOf.get(target) ?? [];
      if (targets.length === 0) continue;
      for (const from of importers) {
        for (const to of targets) {
          if (from === to) continue;
          const key = `${from}\u0000${to}`;
          const pairs = pairsByEdge.get(key) ?? [];
          pairs.push({ from: file, to: target });
          pairsByEdge.set(key, pairs);
        }
      }
    }
  }

  const edges: SystemGraphEdge[] = [];
  for (const [key, pairs] of pairsByEdge) {
    const [from, to] = key.split('\u0000');
    const sorted = sortedPairs(pairs);
    edges.push({
      key: `imports:capability:${from}->capability:${to}`,
      kind: 'imports',
      from: `capability:${from}`,
      to: `capability:${to}`,
      pairs: sorted,
      code: sorted.filter((pair) => !isTestPath(pair.from)).length,
      test: sorted.filter((pair) => isTestPath(pair.from)).length,
    });
  }
  return edges;
}

/** Build the unowned file nodes and the capability import edges. */
export async function buildSystemGraphCode(
  projectRoot: string,
  config: OsqConfig,
): Promise<SystemGraphPart> {
  const graph = await buildImportGraph(projectRoot, { skip: [config.paths.openspecRoot] });
  const ownerships = await readCapabilityOwnership(projectRoot, config.paths.openspecRoot);
  const ownersOf = new Map<string, readonly string[]>();
  for (const file of graph.files) ownersOf.set(file, ownerCapabilities(ownerships, file));
  return {
    nodes: fileNodes(graph, ownersOf),
    edges: importEdges(graph, ownersOf),
  };
}
