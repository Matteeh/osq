import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { parseScenario } from '../src/core/spec/delta.js';
import { lintChangeFolder } from '../src/core/spec/linter.js';
import { installFakeValidator } from './helpers.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OPENSPEC_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'openspec');
const VERIFY = 'node verify.cjs';

/**
 * The pricing sample living spec. It is also the text task 5 puts in its
 * fixture, so the parser, osq lint, and the real OpenSpec validator all see the
 * same table.
 */
const PRICING_LIVING_SPEC = `# pricing Specification

## Purpose
Prices quotes by volume tier and percentage code, in integer cents.

## Requirements
### Requirement: Percentage codes
The engine SHALL take a percentage code off the tiered subtotal, not the list
price.

#### Scenario: A percentage code comes off the tiered subtotal
- **WHEN** a quote for 200 units uses the code SAVE10
- **THEN** the subtotal is 1800.00
- **AND** the discount is 180.00
- **AND** the total is 1620.00
`;

/** The pricing sample's "Volume pricing" requirement, table included. */
const PRICING_DELTA = `# Spec Delta: pricing

## ADDED Requirements

### Requirement: Volume pricing
The engine SHALL price every unit in a quote at the tier its quantity falls in.

#### Scenario: Volume discount tiers
- **WHEN** a quote is calculated for a quantity
- **THEN** the unit price follows this table

| quantity | unit price |
|---|---|
| 1 | 10.00 |
| 99 | 10.00 |
| 100 | 9.00 |
| 499 | 9.00 |
| 500 | 8.00 |
`;

/** A project-local config with every lint limit left at its default. */
function lintConfig(): OsqConfig {
  return DEFAULT_CONFIG;
}

/** A disposable scaffolded project with the fake validator reachable locally. */
async function setupProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-scenario-outcomes-'));
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  return root;
}

/** Write a change's single task with the given scope and verify. */
async function writeTask(folderPath: string): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(folderPath, 'tasks', '1.md'),
    `---
title: Task 1
verify: ${VERIFY}
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] passes cleanly
`,
    'utf8',
  );
}

function parseScenarioText(lines: readonly string[]) {
  return parseScenario(lines.join('\n'));
}

describe('scenario outcomes', () => {
  it('reads AND lines and a table as outcomes in order', () => {
    const scenario = parseScenarioText([
      '#### Scenario: AND lines and a table',
      '- **WHEN** a quote is calculated for a quantity',
      '- **THEN** the unit price follows this table',
      '',
      '| quantity | unit price |',
      '|---|---|',
      '| 1 | 10.00 |',
      '| 100 | 9.00 |',
      '',
      '- **AND** the total is not negative',
    ]);

    assert.equal(scenario.outcomes.length, 2);
    assert.equal(scenario.outcomes[0].text, 'the unit price follows this table');
    assert.deepEqual(scenario.outcomes[0].rows, [
      { quantity: '1', 'unit price': '10.00' },
      { quantity: '100', 'unit price': '9.00' },
    ]);
    assert.equal(scenario.outcomes[1].text, 'the total is not negative');
    assert.equal(scenario.outcomes[1].rows, undefined);

    // THEN keeps only the THEN lines, as before.
    assert.deepEqual(scenario.then, ['the unit price follows this table']);
    assert.deepEqual(scenario.when, ['a quote is calculated for a quantity']);
  });

  it('treats an AND under a WHEN as part of the WHEN, not an outcome', () => {
    const scenario = parseScenarioText([
      '#### Scenario: AND under WHEN',
      '- **WHEN** a quote is calculated',
      '- **AND** the quote has a quantity',
      '- **THEN** the total is positive',
    ]);

    assert.deepEqual(scenario.when, ['a quote is calculated']);
    assert.deepEqual(scenario.then, ['the total is positive']);
    assert.deepEqual(scenario.outcomes, [{ text: 'the total is positive' }]);
  });

  it('reads an indented table under a THEN', () => {
    const scenario = parseScenarioText([
      '#### Scenario: Indented table',
      '- **THEN** the unit price follows this table',
      '',
      '    | quantity | unit price |',
      '    |---|---|',
      '    | 1 | 10.00 |',
    ]);

    assert.deepEqual(scenario.outcomes, [
      {
        text: 'the unit price follows this table',
        rows: [{ quantity: '1', 'unit price': '10.00' }],
      },
    ]);
  });

  it('allows blank lines between an outcome and its table', () => {
    const scenario = parseScenarioText([
      '#### Scenario: Blank gap',
      '- **THEN** the unit price follows this table',
      '',
      '',
      '',
      '| quantity | unit price |',
      '|---|---|',
      '| 99 | 10.00 |',
    ]);

    assert.deepEqual(scenario.outcomes[0].rows, [{ quantity: '99', 'unit price': '10.00' }]);
  });

  it('reads a missing cell as the empty string', () => {
    const scenario = parseScenarioText([
      '#### Scenario: Missing cell',
      '- **THEN** the unit price follows this table',
      '',
      '| quantity | unit price |',
      '|---|---|',
      '| 1 |',
      '| 99 | 10.00 |',
    ]);

    assert.deepEqual(scenario.outcomes[0].rows, [
      { quantity: '1', 'unit price': '' },
      { quantity: '99', 'unit price': '10.00' },
    ]);
  });

  it('reads a table directly under an AND line', () => {
    const scenario = parseScenarioText([
      '#### Scenario: AND table',
      '- **WHEN** a quote for 200 units uses the code SAVE10',
      '- **THEN** the subtotal is 1800.00',
      '- **AND** the discount follows this table',
      '',
      '| code | discount |',
      '|---|---|',
      '| SAVE10 | 180.00 |',
    ]);

    assert.deepEqual(scenario.outcomes, [
      { text: 'the subtotal is 1800.00' },
      {
        text: 'the discount follows this table',
        rows: [{ code: 'SAVE10', discount: '180.00' }],
      },
    ]);
  });
});

describe('scenario table lint acceptance', () => {
  let root: string;

  beforeEach(async () => {
    root = await setupProject();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('accepts a change delta that adds a requirement with a table', async () => {
    const livingDir = path.join(root, 'openspec', 'specs', 'pricing');
    await fs.mkdir(livingDir, { recursive: true });
    await fs.writeFile(path.join(livingDir, 'spec.md'), PRICING_LIVING_SPEC, 'utf8');

    const spec = await createNewSpec(root, 'Volume Pricing');
    const proposalPath = path.join(spec.folderPath, 'proposal.md');
    const proposal = await fs.readFile(proposalPath, 'utf8');
    await fs.writeFile(proposalPath, proposal.replace(/^verify:.*$/m, `verify: ${VERIFY}`), 'utf8');

    const deltaDir = path.join(spec.folderPath, 'specs', 'pricing');
    await fs.mkdir(deltaDir, { recursive: true });
    await fs.writeFile(path.join(deltaDir, 'spec.md'), PRICING_DELTA, 'utf8');
    await writeTask(spec.folderPath);

    const result = await lintChangeFolder(root, spec.folderPath, lintConfig());

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(
      result.findings.some((finding) => /table/i.test(finding.message)),
      false,
      JSON.stringify(result.findings),
    );
  });
});

describe('scenario table acceptance by the real validator', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-pricing-spec-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('accepts the sample living spec with its table', async () => {
    const livingDir = path.join(root, 'openspec', 'specs', 'pricing');
    await fs.mkdir(livingDir, { recursive: true });
    await fs.writeFile(path.join(livingDir, 'spec.md'), PRICING_LIVING_SPEC, 'utf8');

    const result = spawnSync(
      OPENSPEC_BIN,
      ['validate', 'pricing', '--type', 'spec', '--strict', '--json', '--no-interactive'],
      {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, OPENSPEC_TELEMETRY: '0' },
      },
    );

    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    const parsed = JSON.parse(result.stdout) as {
      items: Array<{ id: string; valid: boolean; issues: unknown[] }>;
    };
    assert.deepEqual(
      parsed.items.map((item) => ({ id: item.id, valid: item.valid })),
      [{ id: 'pricing', valid: true }],
    );
    assert.deepEqual(parsed.items[0].issues, []);
  });
});
