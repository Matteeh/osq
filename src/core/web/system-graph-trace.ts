/** The system graph's traceability nodes, edges, survivors, and gaps. */

import { DEFAULT_TRACEABILITY_CONFIG } from '../foundation/config-traceability.js';
import { sameAdrNumber } from '../foundation/decisions.js';
import type { MutationSurvivorEntry } from '../report/report-mutation.js';
import { optedInCapabilities, ownedFunctions } from '../report/report-traceability.js';
import { type CapabilityOwnership, readCapabilityOwnership } from '../spec/capability-impact.js';
import type { ScenarioIndex } from '../trace/scenario-index.js';
import type { ScannedFunction } from '../trace/tag-scan.js';
import type {
  SystemAdrNode,
  SystemCapabilityGaps,
  SystemCapabilityNode,
  SystemFunctionNode,
  SystemGraphEdge,
  SystemGraphIdAllocator,
  SystemGraphNode,
  SystemGraphNodeSet,
  SystemGraphTraceInput,
  SystemGraphTracePart,
  SystemScenarioNode,
  SystemTestNode,
} from './system-graph-types.js';

interface CapabilityTrace {
  readonly node: SystemCapabilityNode;
  readonly scenarios: readonly SystemScenarioNode[];
  readonly untested: readonly SystemScenarioNode[];
  readonly owned: readonly ScannedFunction[];
}
function scenarioKey(capability: string, name: string): string {
  return `${capability}\u0000${name}`;
}
function functionKey(file: string, name: string): string {
  return `${file}#${name}`;
}
function makeEdge(kind: SystemGraphEdge['kind'], from: string, to: string): SystemGraphEdge {
  return { key: `${kind}:${from}->${to}`, kind, from, to };
}
function ofKind<K extends SystemGraphNode['kind']>(
  node: SystemGraphNode,
  kind: K,
): node is Extract<SystemGraphNode, { kind: K }> {
  return node.kind === kind;
}
function capabilityTrace(
  node: SystemCapabilityNode,
  scenarios: readonly SystemScenarioNode[],
  index: ScenarioIndex,
  ownerships: readonly CapabilityOwnership[],
): CapabilityTrace {
  const untested = scenarios.filter(
    (scenario) => index.testsNaming(node.name, scenario.name).length === 0,
  );
  return { node, scenarios, untested, owned: ownedFunctions(node.name, index, ownerships) };
}
function wantedFunctions(
  index: ScenarioIndex,
  owned: ReadonlySet<string>,
  scenarioIds: ReadonlyMap<string, string>,
  optedIn: ReadonlySet<string>,
): Map<string, ScannedFunction> {
  const wanted = new Map<string, ScannedFunction>();
  for (const fn of index.functions) {
    const key = functionKey(fn.file, fn.name);
    const serves = fn.scenarios.some(
      (tag) =>
        optedIn.has(tag.capability) && scenarioIds.has(scenarioKey(tag.capability, tag.name)),
    );
    if (owned.has(key) || serves) wanted.set(key, fn);
  }
  return wanted;
}
function survivorMap(
  scores: SystemGraphTraceInput['mutationScores'],
): Map<string, MutationSurvivorEntry[]> {
  const map = new Map<string, MutationSurvivorEntry[]>();
  const seen = new Set<string>();
  for (const score of scores ?? []) {
    for (const survivor of score.survivors) {
      const marker = JSON.stringify(survivor);
      if (seen.has(marker)) continue;
      seen.add(marker);
      const key = functionKey(survivor.file, survivor.function);
      map.set(key, [...(map.get(key) ?? []), survivor]);
    }
  }
  return map;
}
function traceNodes(
  caps: readonly CapabilityTrace[],
  wanted: ReadonlyMap<string, ScannedFunction>,
  owned: ReadonlySet<string>,
  survivors: ReadonlyMap<string, readonly MutationSurvivorEntry[]>,
  index: ScenarioIndex,
  allocateId: SystemGraphIdAllocator,
): {
  functions: SystemGraphNodeSet<SystemFunctionNode>;
  tests: SystemGraphNodeSet<SystemTestNode>;
} {
  const functionIds = new Map<string, string>();
  const functionNodes: SystemFunctionNode[] = [];
  for (const [key, fn] of wanted) {
    const id = allocateId(`function:${key}`);
    functionIds.set(key, id);
    functionNodes.push({
      kind: 'function',
      id,
      file: fn.file,
      line: fn.line,
      name: fn.name,
      scenarios: fn.scenarios.map((tag) => `${tag.capability}: ${tag.name}`),
      adrs: [...fn.adrs],
      survivors: survivors.get(key) ?? [],
      gap: owned.has(key) && fn.scenarios.length === 0 ? 'unclaimed' : null,
    });
  }

  const files = new Set<string>();
  for (const cap of caps) {
    for (const scenario of cap.scenarios) {
      for (const file of index.testsNaming(cap.node.name, scenario.name)) files.add(file);
    }
  }
  const testIds = new Map<string, string>();
  const testNodes: SystemTestNode[] = [];
  for (const file of index.scenarioTestFiles) {
    if (!files.has(file)) continue;
    const id = allocateId(`test:${file}`);
    testIds.set(file, id);
    testNodes.push({ kind: 'test', id, file });
  }
  return {
    functions: { nodes: functionNodes, ids: functionIds },
    tests: { nodes: testNodes, ids: testIds },
  };
}
function traceEdges(
  caps: readonly CapabilityTrace[],
  wanted: ReadonlyMap<string, ScannedFunction>,
  functions: ReadonlyMap<string, string>,
  tests: ReadonlyMap<string, string>,
  scenarioIds: ReadonlyMap<string, string>,
  adrNodes: readonly SystemAdrNode[],
  index: ScenarioIndex,
): SystemGraphEdge[] {
  const edges: SystemGraphEdge[] = [];
  for (const cap of caps) {
    for (const fn of cap.owned) {
      const to = functions.get(functionKey(fn.file, fn.name));
      if (to !== undefined) edges.push(makeEdge('owns', cap.node.id, to));
    }
  }
  for (const [key, fn] of wanted) {
    const from = functions.get(key);
    if (from === undefined) continue;
    for (const tag of fn.scenarios) {
      const to = scenarioIds.get(scenarioKey(tag.capability, tag.name));
      if (to !== undefined) edges.push(makeEdge('serves', from, to));
    }
    for (const number of fn.adrs) {
      const adr = adrNodes.find((node) => sameAdrNumber(node.number, number));
      if (adr !== undefined) edges.push(makeEdge('follows', from, adr.id));
    }
    for (const [testFile, testId] of tests) {
      if (index.covers(testFile, fn.file, fn.name)) edges.push(makeEdge('covers', testId, from));
    }
  }
  for (const cap of caps) {
    for (const scenario of cap.scenarios) {
      for (const file of index.testsNaming(cap.node.name, scenario.name)) {
        const from = tests.get(file);
        if (from !== undefined) edges.push(makeEdge('proves', from, scenario.id));
      }
    }
  }
  return edges;
}
export async function buildSystemGraphTrace(
  input: SystemGraphTraceInput,
): Promise<SystemGraphTracePart> {
  const traceability = input.config.traceability ?? DEFAULT_TRACEABILITY_CONFIG;
  const optedIn = new Set(
    await optedInCapabilities(input.projectRoot, input.config.paths.openspecRoot, traceability),
  );
  const ownerships = await readCapabilityOwnership(
    input.projectRoot,
    input.config.paths.openspecRoot,
  );

  const scenarioNodes = input.specNodes.filter((node) => ofKind(node, 'scenario'));
  const adrNodes = input.specNodes.filter((node) => ofKind(node, 'adr'));
  const scenarioIds = new Map<string, string>();
  for (const scenario of scenarioNodes) {
    const key = scenarioKey(scenario.capability, scenario.name);
    if (!scenarioIds.has(key)) scenarioIds.set(key, scenario.id);
  }
  const caps = input.specNodes
    .filter(
      (node): node is SystemCapabilityNode => ofKind(node, 'capability') && optedIn.has(node.name),
    )
    .map((node) =>
      capabilityTrace(
        node,
        scenarioNodes.filter((scenario) => scenario.capability === node.name),
        input.index,
        ownerships,
      ),
    );

  const owned = new Set(
    caps.flatMap((cap) => cap.owned.map((fn) => functionKey(fn.file, fn.name))),
  );
  const wanted = wantedFunctions(input.index, owned, scenarioIds, optedIn);
  const nodes = traceNodes(
    caps,
    wanted,
    owned,
    survivorMap(input.mutationScores),
    input.index,
    input.allocateId,
  );

  const gaps = new Map<string, SystemCapabilityGaps>();
  const scenarioGaps = new Map<string, string>();
  for (const cap of caps) {
    gaps.set(cap.node.name, {
      untested: cap.untested.length,
      unclaimed: cap.owned.filter((fn) => fn.scenarios.length === 0).length,
    });
    for (const scenario of cap.untested) scenarioGaps.set(scenario.id, 'untested');
  }

  return {
    nodes: [...nodes.functions.nodes, ...nodes.tests.nodes],
    edges: traceEdges(
      caps,
      wanted,
      nodes.functions.ids,
      nodes.tests.ids,
      scenarioIds,
      adrNodes,
      input.index,
    ),
    gaps,
    scenarioGaps,
  };
}
