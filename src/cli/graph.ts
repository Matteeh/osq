import type { Command } from 'commander';
import type { SystemEdgeKind, SystemGraphNode } from '../core/web/system-graph-types.js';
import { getSystemGraph } from '../core/web/system-graph.js';
import { serializeWebJson } from '../core/web/web-server.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';

/** Node kinds in the order the document lists them. */
const NODE_KINDS: readonly SystemGraphNode['kind'][] = [
  'group',
  'capability',
  'requirement',
  'scenario',
  'adr',
  'change',
  'test',
  'function',
  'file',
];

/** Edge kinds in the order the document lists them. */
const EDGE_KINDS: readonly SystemEdgeKind[] = [
  'contains',
  'applies_to',
  'reads',
  'writes',
  'imports',
  'owns',
  'proves',
  'covers',
  'serves',
  'follows',
];

export interface GraphCommandOptions extends CommandInputs {
  json?: boolean;
}

/** Render `Nodes: <kind> <count>, ...` for the kinds with a non-zero count. */
function summaryLine(label: string, order: readonly string[], counts: Map<string, number>): string {
  const parts = order
    .filter((kind) => (counts.get(kind) ?? 0) > 0)
    .map((kind) => `${kind} ${counts.get(kind)}`);
  return `${label}: ${parts.join(', ')}\n`;
}

function countNodes(graph: Awaited<ReturnType<typeof getSystemGraph>>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of graph.nodes) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
  return counts;
}

function countEdges(graph: Awaited<ReturnType<typeof getSystemGraph>>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const edge of graph.edges) counts.set(edge.kind, (counts.get(edge.kind) ?? 0) + 1);
  return counts;
}

/** The `untested`, `unclaimed`, and `unowned` gap counts of one graph. */
function gapCounts(graph: Awaited<ReturnType<typeof getSystemGraph>>): string {
  let untested = 0;
  let unclaimed = 0;
  let unowned = 0;
  for (const node of graph.nodes) {
    if (node.kind === 'scenario' && node.gap === 'untested') untested += 1;
    if (node.kind === 'function' && node.gap === 'unclaimed') unclaimed += 1;
    if (node.kind === 'file' && node.gap === 'unowned') unowned += 1;
  }
  return `Gaps: untested ${untested}, unclaimed ${unclaimed}, unowned ${unowned}\n`;
}

/**
 * Print the system graph as `serializeWebJson` with a trailing newline, or as
 * three summary lines. A failure throws a `CommandError` whose message is the
 * line it would have printed to stderr. Writes no file.
 */
export async function graphCommand(options: GraphCommandOptions = {}): Promise<void> {
  const inputs = resolveInputs(options);

  try {
    const config = await inputs.config();
    const graph = await getSystemGraph(inputs.cwd, config);
    if (options.json) {
      inputs.stdout(`${serializeWebJson(graph)}\n`);
      return;
    }
    inputs.stdout(summaryLine('Nodes', NODE_KINDS, countNodes(graph)));
    inputs.stdout(summaryLine('Edges', EDGE_KINDS, countEdges(graph)));
    inputs.stdout(gapCounts(graph));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CommandError(message);
  }
}

/** Register `osq graph` on the root program. */
export function registerGraphCommand(program: Command): void {
  program
    .command('graph')
    .description('print the system graph as a summary or JSON')
    .option('--json', 'print the system graph as JSON')
    .action(async (options: { json?: boolean }) => {
      await graphCommand({ json: options.json });
    });
}
