import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { reportCommand } from '../src/cli/report.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { formatMetricsReport, getMetricsReport } from '../src/core/report/report.js';
import { formatSpecDetails, getSpecDetailsFromFolder } from '../src/core/status/show.js';

const tmpDirs: string[] = [];
const ts = '2026-09-18T00:00:00.000Z';

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** The default project config with a traceability block. */
function traceConfig(capabilities: 'all' | readonly string[]): OsqConfig {
  return {
    ...DEFAULT_CONFIG,
    limits: { ...DEFAULT_CONFIG.limits },
    traceability: { capabilities, mode: 'warn' },
  };
}

const LIVING_SPEC = `# pricing Specification

## Purpose

The pricing capability prices quotes by volume tier with plenty of words.

## Requirements

### Requirement: Code ownership
<!-- source: src/pricing/** -->
The pricing capability SHALL own the pricing files.

### Requirement: Volume pricing
The engine SHALL price every unit in a quote at the tier its quantity falls in.

#### Scenario: Volume discount tiers
- **WHEN** a quote is calculated for a quantity
- **THEN** the unit price follows the tier table

### Requirement: Percentage codes
The engine SHALL take a percentage code off the tiered subtotal.

#### Scenario: A percentage code comes off the tiered subtotal
- **WHEN** a quote for 200 units uses the code SAVE10
- **THEN** the subtotal is 1800.00
`;

const QUOTE_TS = `export function tierPrice(quantity: number): number {
  if (quantity >= 500) return 800;
  if (quantity >= 100) return 900;
  return 1000;
}

/**
 * @scenario pricing: Volume discount tiers
 */
export function quote(quantity: number): number {
  return quantity * tierPrice(quantity);
}
`;

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-trace-report-'));
  tmpDirs.push(root);
  await fs.mkdir(path.join(root, 'openspec', 'changes'), { recursive: true });
  return root;
}

async function writeFile(root: string, relative: string, content: string): Promise<void> {
  const full = path.join(root, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

/** A pricing project whose scenario test names exactly the given scenarios. */
async function writePricingProject(root: string, scenarios: readonly string[]): Promise<void> {
  await writeFile(root, 'openspec/specs/pricing/spec.md', LIVING_SPEC);
  await writeFile(root, 'src/pricing/quote.ts', QUOTE_TS);
  const calls = scenarios
    .map((name) => `scenario('pricing', '${name}', { covers: quote }, () => {});`)
    .join('\n');
  await writeFile(
    root,
    'tests/pricing-quote.test.ts',
    `import { scenario } from '@matteeh/osq/testing';\nimport { quote } from '../src/pricing/quote.js';\n${calls}\n`,
  );
}

describe('report traceability gaps', () => {
  it('lists an untested scenario and an unclaimed function when pricing is opted in', async () => {
    const root = await tempRoot();
    await writePricingProject(root, ['A percentage code comes off the tiered subtotal']);
    const config = traceConfig(['pricing']);

    const report = await getMetricsReport(root, config);
    assert.deepEqual(report.traceability, [
      {
        capability: 'pricing',
        untestedScenarios: ['Volume discount tiers'],
        unclaimedFunctions: [{ file: 'src/pricing/quote.ts', name: 'tierPrice' }],
      },
    ]);

    const text = formatMetricsReport(report, config);
    assert.ok(text.includes('Traceability:'), text);
    assert.ok(text.includes('  pricing: 1 untested scenarios, 1 unclaimed functions'), text);
    assert.ok(text.includes('    untested: Volume discount tiers'), text);
    assert.ok(text.includes('    unclaimed: src/pricing/quote.ts#tierPrice'), text);

    const commandText = await reportCommand({ cwd: root, config, stdout: () => {} });
    assert.ok(commandText.includes('Traceability:'), commandText);
    assert.ok(commandText.includes('    unclaimed: src/pricing/quote.ts#tierPrice'), commandText);

    const raw = await reportCommand({ cwd: root, config, json: true, stdout: () => {} });
    const parsed = JSON.parse(raw) as { traceability: unknown };
    assert.deepEqual(parsed.traceability, [
      {
        capability: 'pricing',
        unclaimedFunctions: [{ file: 'src/pricing/quote.ts', name: 'tierPrice' }],
        untestedScenarios: ['Volume discount tiers'],
      },
    ]);
  });

  it('leaves the report unchanged when no capability is opted in', async () => {
    const root = await tempRoot();
    await writePricingProject(root, ['A percentage code comes off the tiered subtotal']);
    const config = traceConfig([]);

    const report = await getMetricsReport(root, config);
    assert.equal(report.traceability, undefined);
    assert.equal(formatMetricsReport(report, config).includes('Traceability:'), false);

    const raw = await reportCommand({ cwd: root, config, json: true, stdout: () => {} });
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assert.equal('traceability' in parsed, false);

    const text = await reportCommand({ cwd: root, config, stdout: () => {} });
    assert.equal(text.includes('Traceability:'), false, text);
  });
});

describe('show scenarios', () => {
  it('prints both scenario pairs under a task whose scope holds the test', async () => {
    const root = await tempRoot();
    await writePricingProject(root, [
      'Volume discount tiers',
      'A percentage code comes off the tiered subtotal',
    ]);
    const changeDir = path.join(root, 'openspec', 'changes', '001-pricing');
    await writeFile(
      root,
      'openspec/changes/001-pricing/proposal.md',
      '---\ntitle: Pricing change\nverify: node verify.cjs\n---\n## Goal\n\nChange.\n',
    );
    await writeFile(
      root,
      'openspec/changes/001-pricing/tasks/1.md',
      '---\ntitle: Task 1\nverify: node verify.cjs\nscope: [tests/pricing-quote.test.ts]\nentry: []\nskills: []\n---\n## Acceptance\n- [ ] passes\n',
    );
    await writeFile(
      root,
      'openspec/changes/001-pricing/.run/events/1.jsonl',
      `${JSON.stringify({
        type: 'dependencies_added',
        timestamp: ts,
        data: { added: [{ file: 'package.json', name: 'zod' }] },
      })}\n`,
    );

    const details = await getSpecDetailsFromFolder(
      root,
      changeDir,
      'active',
      traceConfig(['pricing']),
    );
    const lines = formatSpecDetails(details).split('\n');

    const dependenciesIndex = lines.findIndex((line) => line.includes('Dependencies added:'));
    const scenariosIndex = lines.findIndex((line) => line.includes('Scenarios:'));
    assert.ok(dependenciesIndex >= 0, lines.join('\n'));
    assert.ok(scenariosIndex > dependenciesIndex, lines.join('\n'));
    assert.equal(
      lines[scenariosIndex],
      '      Scenarios: pricing: A percentage code comes off the tiered subtotal; pricing: Volume discount tiers',
    );

    assert.deepEqual(details.tasks[0]?.scenarios, [
      { capability: 'pricing', name: 'A percentage code comes off the tiered subtotal' },
      { capability: 'pricing', name: 'Volume discount tiers' },
    ]);
  });

  it('prints no scenario line for a task without a scenario test in scope', async () => {
    const root = await tempRoot();
    await writePricingProject(root, ['Volume discount tiers']);
    const changeDir = path.join(root, 'openspec', 'changes', '002-plain');
    await writeFile(
      root,
      'openspec/changes/002-plain/proposal.md',
      '---\ntitle: Plain\nverify: node verify.cjs\n---\n## Goal\n\nChange.\n',
    );
    await writeFile(
      root,
      'openspec/changes/002-plain/tasks/1.md',
      '---\ntitle: Task 1\nverify: node verify.cjs\nscope: [src/pricing/quote.ts]\nentry: []\nskills: []\n---\n## Acceptance\n- [ ] passes\n',
    );

    const details = await getSpecDetailsFromFolder(
      root,
      changeDir,
      'active',
      traceConfig(['pricing']),
    );
    assert.equal(formatSpecDetails(details).includes('Scenarios:'), false);
    assert.equal('scenarios' in (details.tasks[0] as object), false);
  });
});
