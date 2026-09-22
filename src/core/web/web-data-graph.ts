import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { parseSpecMdFromFolder } from '../spec/parser.js';
import {
  listCapabilityFolders,
  listChangeFolders,
  readCapabilitySpec,
  slugOf,
} from './web-data-folders.js';
import {
  countTasks,
  listDeltaCapabilities,
  readApprovedAt,
  readBriefMetadata,
  readCreatedAt,
  readLandedAt,
  readManifestMetadata,
  readPlannerAttribution,
  readRejection,
} from './web-data-lifecycle.js';
import { observeExecution, observePlanning } from './web-data-observations.js';
import type { WebCapabilityNode, WebChangeNode, WebGraph, WebGraphEdge } from './web-data-types.js';

interface ProposalFields {
  title: string;
  dependsOn: readonly string[];
  reads: readonly string[];
}

async function readProposalFields(folderPath: string): Promise<ProposalFields | null> {
  const spec = await parseSpecMdFromFolder(folderPath);
  if (!spec) return null;
  return { title: spec.title, dependsOn: spec.dependsOn, reads: spec.features.reads };
}

function edgeKey(kind: WebGraphEdge['kind'], from: string, to: string): string {
  return `${kind}:${from}->${to}`;
}

/** One present change for a numeric or key dependency declaration, if unique. */
function resolveDependency(
  dependency: string,
  folders: readonly { folderKey: string; numericId: number | null }[],
): string | null {
  const numeric = /^\d+$/.test(dependency) ? Number.parseInt(dependency, 10) : null;
  const matches = folders.filter(
    (folder) =>
      folder.folderKey === dependency || (numeric !== null && folder.numericId === numeric),
  );
  return matches.length === 1 ? matches[0].folderKey : null;
}

async function capabilityNodes(
  projectRoot: string,
  config: OsqConfig,
): Promise<WebCapabilityNode[]> {
  const folders = await listCapabilityFolders(projectRoot, config);
  const nodes: WebCapabilityNode[] = [];
  for (const folder of folders) {
    const spec = await readCapabilitySpec(folder.folderPath);
    if (spec === null) continue;
    nodes.push({ kind: 'capability', id: folder.id, folderKey: folder.id, spec });
  }
  return nodes;
}

async function changeNodes(projectRoot: string, config: OsqConfig): Promise<WebChangeNode[]> {
  const folders = await listChangeFolders(projectRoot, config);
  const nodes: WebChangeNode[] = [];
  for (const folder of folders) {
    const proposal = await readProposalFields(folder.folderPath);
    const brief = await readBriefMetadata(folder.folderPath);
    const manifest = await readManifestMetadata(folder.folderPath);
    const execution = await observeExecution(folder.folderPath);
    const planning = await observePlanning(folder.folderPath);
    const landed = folder.location === 'archived' ? await readLandedAt(folder.folderPath) : null;
    const rejection =
      folder.location === 'rejected' ? await readRejection(folder.folderPath) : null;

    nodes.push({
      kind: 'change',
      folderKey: folder.folderKey,
      id: folder.numericId,
      slug: slugOf(folder.folderKey),
      title: proposal?.title || folder.folderKey,
      state: folder.location,
      created: await readCreatedAt(brief, manifest),
      approved: await readApprovedAt(manifest),
      landed,
      rejection,
      planner: await readPlannerAttribution(brief, manifest),
      taskCount: await countTasks(folder.folderPath),
      attempts: execution.attempts,
      execution: execution.observation,
      planning,
    });
  }
  return nodes;
}

async function graphEdges(
  folders: readonly { folderKey: string; numericId: number | null; folderPath: string }[],
  capabilityIds: ReadonlySet<string>,
): Promise<WebGraphEdge[]> {
  const edges = new Map<string, WebGraphEdge>();
  const add = (kind: WebGraphEdge['kind'], from: string, to: string): void => {
    const key = edgeKey(kind, from, to);
    if (!edges.has(key)) edges.set(key, { key, kind, from, to });
  };

  for (const folder of folders) {
    const proposal = await readProposalFields(folder.folderPath);
    if (!proposal) continue;
    for (const dependency of [...new Set(proposal.dependsOn)]) {
      const target = resolveDependency(dependency, folders);
      if (target) add('depends_on', folder.folderKey, target);
    }
    for (const capability of [...new Set(proposal.reads)]) {
      if (capabilityIds.has(capability)) add('reads', folder.folderKey, capability);
    }
    for (const capability of await listDeltaCapabilities(folder.folderPath)) {
      add('writes', folder.folderKey, capability);
    }
  }

  return [...edges.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Derives the deterministic capability/change graph from the current project
 * tree on every call. No index is stored and no missing evidence is estimated.
 */
export async function getWebGraph(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<WebGraph> {
  const capabilities = await capabilityNodes(projectRoot, config);
  const changes = await changeNodes(projectRoot, config);
  const capabilityIds = new Set(capabilities.map((node) => node.id));
  const folders = await listChangeFolders(projectRoot, config);
  const edges = await graphEdges(folders, capabilityIds);
  return { capabilities, changes, edges };
}
