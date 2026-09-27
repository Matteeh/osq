import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import type {
  SystemGraph,
  SystemGraphEdge,
  SystemGraphNode,
} from '../src/core/web/system-graph-types.js';
import { getSystemGraph } from '../src/core/web/system-graph.js';
import { serializeWebJson } from '../src/core/web/web-server.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PRICING = path.join(ROOT, 'fixture', 'trace', 'pricing');
const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-system-graph-'));
  tmpDirs.push(root);
  await fs.cp(PRICING, root, { recursive: true });
  return root;
}

async function write(root: string, relative: string, content: string): Promise<void> {
  const full = path.join(root, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

/** Append a Code ownership requirement to a copied living capability spec. */
async function addOwnership(
  root: string,
  capability: string,
  globs: readonly string[],
): Promise<void> {
  const relative = `openspec/specs/${capability}/spec.md`;
  const content = await fs.readFile(path.join(root, relative), 'utf8');
  const block = [
    '',
    '### Requirement: Code ownership',
    `<!-- source: ${globs.join(', ')} -->`,
    `${capability} owns the listed files.`,
    '',
    '#### Scenario: Ownership boundaries',
    '- **WHEN** ownership is resolved',
    '- **THEN** the files map to the capability',
    '',
  ].join('\n');
  await write(root, relative, `${content}${block}`);
}

/** One living capability spec with a behavior requirement and Code ownership. */
function capabilitySpec(name: string, globs: readonly string[]): string {
  return [
    `# ${name} Specification`,
    '',
    '## Purpose',
    `${name} capability purpose.`,
    '',
    '## Requirements',
    '### Requirement: Billing behavior',
    `${name} SHALL behave.`,
    '',
    '### Requirement: Code ownership',
    `<!-- source: ${globs.join(', ')} -->`,
    `${name} owns the listed files.`,
    '',
    '#### Scenario: Ownership boundaries',
    '- **WHEN** ownership is resolved',
    '- **THEN** the files map to the capability',
    '',
  ].join('\n');
}

function node(graph: SystemGraph, id: string): SystemGraphNode {
  const found = graph.nodes.find((entry) => entry.id === id);
  assert.ok(found, `missing node ${id}`);
  return found;
}

function nodeOfKind<K extends SystemGraphNode['kind']>(
  graph: SystemGraph,
  id: string,
  kind: K,
): Extract<SystemGraphNode, { kind: K }> {
  const found = node(graph, id);
  assert.equal(found.kind, kind);
  return found as Extract<SystemGraphNode, { kind: K }>;
}

function edge(graph: SystemGraph, key: string): SystemGraphEdge {
  const found = graph.edges.find((entry) => entry.key === key);
  assert.ok(found, `missing edge ${key}`);
  return found;
}

describe('system graph document', () => {
  it('holds the capability, requirement, and scenario from the living spec', async () => {
    const root = await tempProject();
    const graph = await getSystemGraph(root, DEFAULT_CONFIG);

    const capability = nodeOfKind(graph, 'capability:pricing', 'capability');
    assert.equal(capability.name, 'pricing');
    assert.equal(
      capability.purpose,
      'Prices quotes by volume tier and percentage code, in integer cents.',
    );
    assert.equal(capability.group, null);
    assert.equal(capability.traceability, false);
    assert.equal(capability.gaps, null);

    const requirement = nodeOfKind(graph, 'requirement:pricing/Volume pricing', 'requirement');
    assert.equal(requirement.capability, 'pricing');
    assert.equal(
      requirement.text,
      'The engine SHALL price every unit in a quote at the tier its quantity falls in.\nFollows ADR 001.',
    );

    const scenario = nodeOfKind(
      graph,
      'scenario:pricing/Volume pricing/Volume discount tiers',
      'scenario',
    );
    assert.deepEqual(scenario.when, ['a quote is calculated for a quantity']);
    assert.equal(scenario.gap, null);
    const outcome = scenario.outcomes.find(
      (entry) => entry.text === 'the unit price follows this table',
    );
    assert.ok(outcome);
    assert.deepEqual(outcome.rows?.[0], { quantity: '1', 'unit price': '10.00' });
  });

  it('reports the same output for two builds of the same project', async () => {
    const root = await tempProject();
    const first = await getSystemGraph(root, DEFAULT_CONFIG);
    const second = await getSystemGraph(root, DEFAULT_CONFIG);

    assert.equal(serializeWebJson(first), serializeWebJson(second));
    assert.equal(serializeWebJson(first).includes('position'), false);
  });

  it('gives a colliding scenario id a suffixed id', async () => {
    const root = await tempProject();
    await write(
      root,
      'openspec/specs/pricing/spec.md',
      [
        '# pricing Specification',
        '',
        '## Purpose',
        'Prices.',
        '',
        '## Requirements',
        '### Requirement: Volume pricing',
        'The engine SHALL price.',
        '',
        '#### Scenario: Same',
        '- **WHEN** a',
        '- **THEN** b',
        '',
        '#### Scenario: Same',
        '- **WHEN** c',
        '- **THEN** d',
        '',
      ].join('\n'),
    );

    const graph = await getSystemGraph(root, DEFAULT_CONFIG);
    const requirement = nodeOfKind(graph, 'requirement:pricing/Volume pricing', 'requirement');
    const first = nodeOfKind(graph, 'scenario:pricing/Volume pricing/Same', 'scenario');
    const second = nodeOfKind(graph, 'scenario:pricing/Volume pricing/Same~2', 'scenario');
    assert.deepEqual(first.when, ['a']);
    assert.deepEqual(second.when, ['c']);
    edge(graph, `contains:${requirement.id}->scenario:pricing/Volume pricing/Same`);
    edge(graph, `contains:${requirement.id}->scenario:pricing/Volume pricing/Same~2`);
  });
});

describe('system graph links', () => {
  it('holds the group and ADR edges', async () => {
    const root = await tempProject();
    await write(root, 'openspec/specs/pricing/osq.yml', 'group: sales\n');
    await write(
      root,
      'decisions/002-everywhere.md',
      [
        '---',
        'status: accepted',
        'applies_to: all',
        'rule: Everywhere applies.',
        '---',
        '# 002. Everywhere',
        '',
      ].join('\n'),
    );

    const graph = await getSystemGraph(root, DEFAULT_CONFIG);
    assert.equal(nodeOfKind(graph, 'group:sales', 'group').name, 'sales');
    assert.deepEqual(nodeOfKind(graph, 'adr:001', 'adr').appliesTo, ['pricing']);
    edge(graph, 'contains:group:sales->capability:pricing');
    edge(graph, 'applies_to:adr:001->capability:pricing');

    const second = nodeOfKind(graph, 'adr:002', 'adr');
    assert.equal(second.appliesTo, 'all');
    assert.equal(
      graph.edges.some((entry) => entry.from === 'adr:002' && entry.kind === 'applies_to'),
      false,
    );
  });

  it('holds a change node with its reads and writes edges', async () => {
    const root = await tempProject();
    await write(root, 'openspec/specs/billing/spec.md', capabilitySpec('billing', []));
    await write(
      root,
      'openspec/changes/001-first/proposal.md',
      [
        '---',
        'title: First change',
        'depends_on: []',
        'verify: node verify.cjs',
        'features:',
        '  reads:',
        '    - billing',
        '---',
        '## Goal',
        '',
        'First change goal.',
        '',
      ].join('\n'),
    );
    await write(
      root,
      'openspec/changes/001-first/specs/pricing/spec.md',
      [
        '## ADDED Requirements',
        '',
        '### Requirement: Volume pricing',
        'The engine SHALL price.',
        '',
        '#### Scenario: Volume discount tiers',
        '- **WHEN** a quote is calculated',
        '- **THEN** the unit price follows this table',
        '',
      ].join('\n'),
    );

    const graph = await getSystemGraph(root, DEFAULT_CONFIG);
    const change = nodeOfKind(graph, 'change:001-first', 'change');
    assert.equal(change.folderKey, '001-first');
    assert.equal(change.number, 1);
    assert.equal(change.title, 'First change');
    assert.equal(change.state, 'active');
    assert.equal(change.landed, null);
    edge(graph, 'writes:change:001-first->capability:pricing');
    edge(graph, 'reads:change:001-first->capability:billing');
  });

  it('holds one import edge between two capabilities', async () => {
    const root = await tempProject();
    await addOwnership(root, 'pricing', ['src/pricing/**', 'tests/pricing-quote.test.ts']);
    await write(
      root,
      'openspec/specs/billing/spec.md',
      capabilitySpec('billing', ['src/billing/**', 'tests/billing-invoice.test.ts']),
    );
    await write(
      root,
      'src/billing/invoice.ts',
      "import { quote } from '../pricing/quote.js';\n\nexport const invoice = quote;\n",
    );
    await write(root, 'tests/billing-invoice.test.ts', "import '../src/pricing/quote.js';\n");

    const graph = await getSystemGraph(root, DEFAULT_CONFIG);
    const imports = edge(graph, 'imports:capability:billing->capability:pricing');
    assert.equal(imports.kind, 'imports');
    assert.equal(imports.code, 1);
    assert.equal(imports.test, 1);
    assert.deepEqual(imports.pairs, [
      { from: 'src/billing/invoice.ts', to: 'src/pricing/quote.ts' },
      { from: 'tests/billing-invoice.test.ts', to: 'src/pricing/quote.ts' },
    ]);
    assert.equal(
      graph.edges.some(
        (entry) =>
          entry.kind === 'imports' &&
          entry.from === 'capability:pricing' &&
          entry.to === 'capability:billing',
      ),
      false,
    );
  });

  it('holds no import edge when no file crosses capabilities', async () => {
    const root = await tempProject();
    await addOwnership(root, 'pricing', ['src/pricing/**']);
    await write(
      root,
      'openspec/specs/billing/spec.md',
      capabilitySpec('billing', ['src/billing/**']),
    );
    await write(root, 'src/billing/invoice.ts', 'export const invoice = 1;\n');

    const graph = await getSystemGraph(root, DEFAULT_CONFIG);
    assert.equal(
      graph.edges.some(
        (entry) =>
          entry.kind === 'imports' &&
          entry.from === 'capability:pricing' &&
          entry.to === 'capability:billing',
      ),
      false,
    );
  });
});

describe('system graph gaps', () => {
  it('marks an unowned file and leaves owned files alone', async () => {
    const root = await tempProject();
    await addOwnership(root, 'pricing', ['src/pricing/**', 'tests/pricing-quote.test.ts']);
    await write(root, 'scripts/seed.ts', 'export const seed = 1;\n');

    const graph = await getSystemGraph(root, DEFAULT_CONFIG);
    const seed = nodeOfKind(graph, 'file:scripts/seed.ts', 'file');
    assert.equal(seed.path, 'scripts/seed.ts');
    assert.equal(seed.gap, 'unowned');
    assert.equal(
      graph.nodes.some((entry) => entry.id === 'file:src/pricing/quote.ts'),
      false,
    );
  });
});
