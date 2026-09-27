import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { getMetricsReport } from '../src/core/report/report.js';
import type {
  SystemGraph,
  SystemGraphEdge,
  SystemGraphNode,
} from '../src/core/web/system-graph-types.js';
import { getSystemGraph } from '../src/core/web/system-graph.js';
import { serializeWebJson } from '../src/core/web/web-server.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PRICING = path.join(ROOT, 'fixture', 'trace', 'pricing');
const QUOTE = 'function:src/pricing/quote.ts#quote';
const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});
function traceConfig(capabilities: 'all' | readonly string[]): OsqConfig {
  return {
    ...DEFAULT_CONFIG,
    limits: { ...DEFAULT_CONFIG.limits },
    traceability: { capabilities, mode: 'warn' },
  };
}
async function write(root: string, relative: string, content: string): Promise<void> {
  const full = path.join(root, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}
/** Copy the pricing fixture and give `pricing` ownership of `src/pricing/**`. */
async function pricingProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-system-graph-trace-'));
  tmpDirs.push(root);
  await fs.cp(PRICING, root, { recursive: true });
  const specPath = path.join(root, 'openspec', 'specs', 'pricing', 'spec.md');
  const content = await fs.readFile(specPath, 'utf8');
  await write(
    root,
    'openspec/specs/pricing/spec.md',
    `${content}\n### Requirement: Code ownership\n<!-- source: src/pricing/** -->\npricing owns the files.\n`,
  );
  return root;
}

/** A pricing project with one untested scenario and one unclaimed function. */
async function gapProject(): Promise<string> {
  const root = await pricingProject();
  await write(
    root,
    'tests/pricing-quote.test.ts',
    "import { scenario } from '@matteeh/osq/testing';\nimport { quote } from '../src/pricing/quote.js';\nscenario('pricing', 'Volume discount tiers', { covers: quote }, () => {});\n",
  );
  const quotePath = path.join(root, 'src', 'pricing', 'quote.ts');
  const source = await fs.readFile(quotePath, 'utf8');
  await write(
    root,
    'src/pricing/quote.ts',
    `${source}\nexport function listCodes(): string[] {\n  return Object.keys(CODES);\n}\n`,
  );
  return root;
}
function nodeOfKind<K extends SystemGraphNode['kind']>(
  graph: SystemGraph,
  id: string,
  kind: K,
): Extract<SystemGraphNode, { kind: K }> {
  const found = graph.nodes.find((entry) => entry.id === id);
  assert.ok(found, `missing node ${id}`);
  assert.equal(found.kind, kind);
  return found as Extract<SystemGraphNode, { kind: K }>;
}
function edge(graph: SystemGraph, key: string): SystemGraphEdge {
  const found = graph.edges.find((entry) => entry.key === key);
  assert.ok(found, `missing edge ${key}`);
  return found;
}
describe('system graph traceability', () => {
  it('holds the pricing sample test, function, and links', async () => {
    const root = await pricingProject();
    const graph = await getSystemGraph(root, traceConfig(['pricing']));
    const quote = nodeOfKind(graph, QUOTE, 'function');
    assert.equal(quote.gap, null);
    assert.deepEqual(quote.scenarios, [
      'pricing: Volume discount tiers',
      'pricing: A percentage code comes off the tiered subtotal',
    ]);
    assert.deepEqual(quote.adrs, ['001']);
    nodeOfKind(graph, 'test:tests/pricing-quote.test.ts', 'test');
    edge(graph, `owns:capability:pricing->${QUOTE}`);
    edge(graph, `serves:${QUOTE}->scenario:pricing/Volume pricing/Volume discount tiers`);
    edge(
      graph,
      `serves:${QUOTE}->scenario:pricing/Percentage codes/A percentage code comes off the tiered subtotal`,
    );
    edge(
      graph,
      'proves:test:tests/pricing-quote.test.ts->scenario:pricing/Volume pricing/Volume discount tiers',
    );
    edge(graph, `covers:test:tests/pricing-quote.test.ts->${QUOTE}`);
    edge(graph, `follows:${QUOTE}->adr:001`);
    assert.equal(nodeOfKind(graph, 'capability:pricing', 'capability').traceability, true);
  });
  it('holds a surviving mutant from an archived change on its function', async () => {
    const root = await pricingProject();
    const survivor = {
      file: 'src/pricing/quote.ts',
      line: 36,
      column: 19,
      mutator: 'ConditionalExpression',
      replacement: 'false',
    };
    const event = {
      type: 'mutation_ran',
      timestamp: '2026-09-18T00:00:00.000Z',
      data: {
        file: 'src/pricing/quote.ts',
        function: 'quote',
        scenarios: ['pricing: Volume discount tiers', 'billing: Billing thing'],
        outcome: 'measured',
        killed: 0,
        survived: 1,
        survivors: [survivor],
      },
    };
    await write(
      root,
      'openspec/changes/archive/050-mutation/.run/events/1.jsonl',
      `${JSON.stringify(event)}\n`,
    );
    const graph = await getSystemGraph(root, traceConfig(['pricing', 'billing']));
    assert.deepEqual(nodeOfKind(graph, QUOTE, 'function').survivors, [
      { ...survivor, function: 'quote' },
    ]);
  });
  it('lists an unknown @adr tag without a follows edge', async () => {
    const root = await pricingProject();
    const quotePath = path.join(root, 'src', 'pricing', 'quote.ts');
    const source = await fs.readFile(quotePath, 'utf8');
    await write(
      root,
      'src/pricing/quote.ts',
      source.replace('* @adr 001', '* @adr 001\n * @adr 009'),
    );
    const graph = await getSystemGraph(root, traceConfig(['pricing']));
    const quote = nodeOfKind(graph, QUOTE, 'function');
    assert.ok(quote.adrs.includes('009'));
    assert.equal(
      graph.edges.some((entry) => entry.kind === 'follows' && entry.to === 'adr:009'),
      false,
    );
  });
  it('adds no test or function nodes when pricing is not opted in', async () => {
    const root = await pricingProject();
    const graph = await getSystemGraph(root, traceConfig([]));
    const capability = nodeOfKind(graph, 'capability:pricing', 'capability');
    assert.equal(capability.traceability, false);
    assert.equal(capability.gaps, null);
    assert.equal(
      graph.nodes.some((entry) => entry.kind === 'test' || entry.kind === 'function'),
      false,
    );
  });
  it('builds two thousand scenarios and proves edges', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-system-graph-big-'));
    tmpDirs.push(root);
    const requirements: string[] = [];
    const calls: string[] = [];
    for (let r = 0; r < 200; r += 1) {
      const scenarios: string[] = [];
      for (let c = 0; c < 10; c += 1) {
        const name = `Scenario ${r}-${c}`;
        scenarios.push(`#### Scenario: ${name}\n- **WHEN** r${r}c${c}\n- **THEN** ok`);
        calls.push(`scenario('pricing', '${name}', { covers: compute }, () => {});`);
      }
      requirements.push(
        `### Requirement: R${r}\nThe engine SHALL work.\n\n${scenarios.join('\n\n')}`,
      );
    }
    await write(
      root,
      'openspec/specs/pricing/spec.md',
      `# pricing Specification\n\n## Purpose\nBig.\n\n## Requirements\n### Requirement: Code ownership\n<!-- source: src/pricing/** -->\npricing owns.\n\n${requirements.join('\n\n')}\n`,
    );
    await write(
      root,
      'src/pricing/engine.ts',
      'export function compute(): number {\n  return 1;\n}\n',
    );
    await write(
      root,
      'tests/all.test.ts',
      `import { scenario } from '@matteeh/osq/testing';\nimport { compute } from '../src/pricing/engine.js';\n${calls.join('\n')}\n`,
    );
    const start = performance.now();
    const graph = await getSystemGraph(root, traceConfig(['pricing']));
    t.diagnostic(`built the 2000-scenario graph in ${Math.round(performance.now() - start)}ms`);
    const scenarios = graph.nodes.filter((entry) => entry.kind === 'scenario');
    assert.equal(scenarios.length, 2000);
    assert.equal(graph.edges.filter((entry) => entry.kind === 'proves').length, 2000);
    assert.equal(
      scenarios.some((entry) => entry.gap !== null),
      false,
    );
    assert.equal(
      serializeWebJson(graph),
      serializeWebJson(await getSystemGraph(root, traceConfig(['pricing']))),
    );
  });
});
describe('system graph traceability gaps', () => {
  it('marks an untested scenario and an unclaimed function', async () => {
    const root = await gapProject();
    const graph = await getSystemGraph(root, traceConfig(['pricing']));
    assert.equal(
      nodeOfKind(
        graph,
        'scenario:pricing/Percentage codes/A percentage code comes off the tiered subtotal',
        'scenario',
      ).gap,
      'untested',
    );
    assert.equal(
      nodeOfKind(graph, 'function:src/pricing/quote.ts#listCodes', 'function').gap,
      'unclaimed',
    );
    assert.deepEqual(nodeOfKind(graph, 'capability:pricing', 'capability').gaps, {
      untested: 1,
      unclaimed: 1,
    });
  });

  it('gives the same gap counts as the report', async () => {
    const root = await gapProject();
    const config = traceConfig(['pricing']);
    const graph = await getSystemGraph(root, config);
    const report = await getMetricsReport(root, config);
    const entry = report.traceability?.find((item) => item.capability === 'pricing');
    assert.ok(entry);
    assert.deepEqual(nodeOfKind(graph, 'capability:pricing', 'capability').gaps, {
      untested: entry.untestedScenarios.length,
      unclaimed: entry.unclaimedFunctions.length,
    });
  });
});
