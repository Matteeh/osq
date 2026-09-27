/**
 * Builds the spec half of the system graph: group, capability, requirement,
 * scenario, and ADR nodes together with their `contains` and `applies_to`
 * edges. Every value comes from the living sidecar, the living spec's parsed
 * requirements, or `readDecisions`; nothing is persisted.
 */

import type { OsqConfig } from '../foundation/config.js';
import { type Adr, readDecisions } from '../foundation/decisions.js';
import { readLivingSidecar } from '../spec/capability-sidecar.js';
import { type CapabilitySpec, parseCapabilitySpec } from '../spec/delta.js';
import type {
  SystemGraphEdge,
  SystemGraphIdAllocator,
  SystemGraphNode,
  SystemGraphPart,
} from './system-graph-types.js';
import { listCapabilityFolders, readCapabilitySpec } from './web-data-folders.js';

/** One living capability, read once for both its nodes and its groups. */
interface LivingCapability {
  readonly name: string;
  readonly group: string | null;
  readonly spec: CapabilitySpec;
}

function makeEdge(kind: SystemGraphEdge['kind'], from: string, to: string): SystemGraphEdge {
  return { key: `${kind}:${from}->${to}`, kind, from, to };
}

async function readLivingCapabilities(
  projectRoot: string,
  config: OsqConfig,
): Promise<LivingCapability[]> {
  const folders = await listCapabilityFolders(projectRoot, config);
  const living: LivingCapability[] = [];
  for (const folder of folders) {
    const content = await readCapabilitySpec(folder.folderPath);
    if (content === null) continue;
    const sidecar = await readLivingSidecar(projectRoot, config.paths.openspecRoot, folder.id);
    living.push({
      name: folder.id,
      group: sidecar?.group ?? null,
      spec: parseCapabilitySpec(content),
    });
  }
  return living;
}

function capabilityNodes(
  living: readonly LivingCapability[],
  allocateId: SystemGraphIdAllocator,
): { nodes: SystemGraphNode[]; edges: SystemGraphEdge[]; ids: Map<string, string> } {
  const nodes: SystemGraphNode[] = [];
  const edges: SystemGraphEdge[] = [];
  const ids = new Map<string, string>();

  const groups = [
    ...new Set(
      living.map((entry) => entry.group).filter((group): group is string => group !== null),
    ),
  ];
  for (const group of groups.sort()) {
    nodes.push({ kind: 'group', id: allocateId(`group:${group}`), name: group });
  }

  for (const entry of living) {
    const capabilityId = allocateId(`capability:${entry.name}`);
    ids.set(entry.name, capabilityId);
    nodes.push({
      kind: 'capability',
      id: capabilityId,
      name: entry.name,
      group: entry.group,
      purpose: entry.spec.purpose,
      traceability: false,
      gaps: null,
    });
    if (entry.group !== null) {
      edges.push(makeEdge('contains', `group:${entry.group}`, capabilityId));
    }
    for (const requirement of entry.spec.requirements) {
      const requirementId = allocateId(`requirement:${entry.name}/${requirement.name}`);
      nodes.push({
        kind: 'requirement',
        id: requirementId,
        capability: entry.name,
        name: requirement.name,
        text: requirement.body,
      });
      edges.push(makeEdge('contains', capabilityId, requirementId));
      for (const scenario of requirement.scenarios) {
        const scenarioId = allocateId(
          `scenario:${entry.name}/${requirement.name}/${scenario.name}`,
        );
        nodes.push({
          kind: 'scenario',
          id: scenarioId,
          capability: entry.name,
          requirement: requirement.name,
          name: scenario.name,
          when: scenario.when,
          outcomes: scenario.outcomes,
          gap: null,
        });
        edges.push(makeEdge('contains', requirementId, scenarioId));
      }
    }
  }

  return { nodes, edges, ids };
}

function adrNodes(
  adrs: readonly Adr[],
  capabilityIds: ReadonlyMap<string, string>,
  allocateId: SystemGraphIdAllocator,
): { nodes: SystemGraphNode[]; edges: SystemGraphEdge[] } {
  const nodes: SystemGraphNode[] = [];
  const edges: SystemGraphEdge[] = [];
  for (const adr of adrs) {
    const adrId = allocateId(`adr:${adr.number}`);
    nodes.push({
      kind: 'adr',
      id: adrId,
      number: adr.number,
      title: adr.title,
      status: adr.status,
      appliesTo: adr.appliesTo,
      rule: adr.rule,
      path: adr.path,
    });
    if (adr.status !== 'accepted' || !Array.isArray(adr.appliesTo)) continue;
    for (const capability of adr.appliesTo) {
      const capabilityId = capabilityIds.get(capability);
      if (capabilityId !== undefined) edges.push(makeEdge('applies_to', adrId, capabilityId));
    }
  }
  return { nodes, edges };
}

/** Build the group, capability, requirement, scenario, and ADR nodes and edges. */
export async function buildSystemGraphSpecs(
  projectRoot: string,
  config: OsqConfig,
  allocateId: SystemGraphIdAllocator,
): Promise<SystemGraphPart> {
  const living = await readLivingCapabilities(projectRoot, config);
  const capabilities = capabilityNodes(living, allocateId);
  const decisions = await readDecisions(projectRoot, config);
  const adrs = adrNodes(decisions.adrs, capabilities.ids, allocateId);
  return {
    nodes: [...capabilities.nodes, ...adrs.nodes],
    edges: [...capabilities.edges, ...adrs.edges],
  };
}
