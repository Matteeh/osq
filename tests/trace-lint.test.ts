import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { buildImportGraph } from '../src/core/spec/import-graph.js';
import type { LintFinding } from '../src/core/spec/lint-findings.js';
import { lintChangeFolder } from '../src/core/spec/linter.js';
import { collectTraceabilityFindings } from '../src/core/spec/traceability-lint.js';
import { installFakeValidator } from './helpers.js';

const VERIFY = 'node verify.cjs';

/** A project-local config with every lint limit left at its default. */
function lintConfig(
  capabilities: 'all' | readonly string[] = [],
  mode: 'warn' | 'require' = 'warn',
): OsqConfig {
  return {
    ...DEFAULT_CONFIG,
    limits: { ...DEFAULT_CONFIG.limits },
    traceability: { capabilities, mode },
  };
}

async function setupProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-trace-lint-'));
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  return root;
}

async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, relative);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf8');
  }
}

const OWNERSHIP = `### Requirement: Code ownership
<!-- source: src/pricing/** -->
The pricing capability SHALL own its files.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for pricing
- **THEN** system maps the declared files to pricing
`;

const VOLUME = `### Requirement: Volume pricing
The engine SHALL price every unit at its tier.

#### Scenario: Volume discount tiers
- **WHEN** a quote is calculated for a quantity
- **THEN** the unit price follows the tier table
`;

async function writeLivingSpec(root: string, capability: string, body: string): Promise<void> {
  const dir = path.join(root, 'openspec', 'specs', capability);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'spec.md'),
    `# ${capability} Specification

## Purpose

The ${capability} capability exists for this test with plenty of words to pass.

## Requirements

${body}
`,
    'utf8',
  );
}

interface ChangeHandle {
  readonly folderPath: string;
  readonly folderName: string;
  readonly proposalPath: string;
  readonly taskPath: string;
}

async function createChange(
  root: string,
  title: string,
  options: { deltas?: Readonly<Record<string, string>> } = {},
): Promise<ChangeHandle> {
  const spec = await createNewSpec(root, title);
  const proposalPath = path.join(spec.folderPath, 'proposal.md');
  let proposal = await fs.readFile(proposalPath, 'utf8');
  proposal = proposal.replace(/^verify:.*$/m, `verify: ${VERIFY}`);
  await fs.writeFile(proposalPath, proposal, 'utf8');

  for (const [capability, content] of Object.entries(options.deltas ?? {})) {
    const dir = path.join(spec.folderPath, 'specs', capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), content, 'utf8');
  }

  return {
    folderPath: spec.folderPath,
    folderName: spec.folderName,
    proposalPath,
    taskPath: path.join(spec.folderPath, 'tasks', '1.md'),
  };
}

async function writeTask(
  change: ChangeHandle,
  scope: readonly string[],
  options: { testsModify?: boolean; scenarios?: readonly string[] } = {},
): Promise<void> {
  const testsLine = options.testsModify ? '\ntests:\n  modify: true' : '';
  const scenariosSection =
    options.scenarios === undefined
      ? ''
      : `\n## Scenarios\n${options.scenarios.map((line) => `- ${line}`).join('\n')}\n`;
  const frontmatter = `title: Task 1\nverify: ${VERIFY}\nscope: [${scope.join(', ')}]\nentry: []\nskills: []${testsLine}`;
  await fs.writeFile(
    change.taskPath,
    `---\n${frontmatter}\n---\n## Acceptance\n- [ ] passes cleanly\n${scenariosSection}`,
    'utf8',
  );
}

function matching(findings: readonly LintFinding[], fragment: string): LintFinding {
  const found = findings.filter((finding) => finding.message.includes(fragment));
  assert.ok(found.length > 0, `no finding matched ${fragment}: ${JSON.stringify(findings)}`);
  return found[0];
}

function assertOnce(findings: readonly LintFinding[], message: string): void {
  const count = findings.filter((finding) => finding.message === message).length;
  assert.equal(count, 1, `expected one "${message}": ${JSON.stringify(findings)}`);
}

/** The traceability-shaped findings, told apart from impact and validator findings. */
const TRACE_MARKERS = [
  ': no test names scenario ',
  ': names a scenario the ',
  ': no test for "',
  ': ADR ',
  ': two scenarios named ',
  ' changes; tests naming it: ',
  ' names changed scenario "',
  ' is not a valid @scenario',
  ' is not "<capability>: <name>"',
  'tag is not attached',
];

function traceFindings(findings: readonly LintFinding[]): LintFinding[] {
  return findings.filter((finding) =>
    TRACE_MARKERS.some((marker) => finding.message.includes(marker)),
  );
}

describe('trace lint', () => {
  let root: string;

  beforeEach(async () => {
    root = await setupProject();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('names a scenario the spec does not have', async () => {
    await writeLivingSpec(root, 'pricing', `${OWNERSHIP}\n${VOLUME}`);
    await writeFiles(root, {
      'src/pricing/quote.ts':
        '/**\n * @scenario pricing: Ghost scenario\n */\nexport function quote(): number {\n  return 1;\n}\n',
    });
    const change = await createChange(root, 'Missing Scenario');
    await writeTask(change, ['src/pricing/quote.ts']);

    const result = await lintChangeFolder(root, change.folderPath, lintConfig(['pricing']));
    const finding = matching(result.findings, 'names a scenario the pricing spec');

    assert.equal(finding.severity, 'warning');
    assert.equal(finding.file, 'src/pricing/quote.ts');
    assertOnce(
      result.findings,
      'quote: names a scenario the pricing spec doesn\'t have: "Ghost scenario"',
    );
  });

  it('reports a tag no covering test names', async () => {
    await writeLivingSpec(root, 'pricing', `${OWNERSHIP}\n${VOLUME}`);
    await writeFiles(root, {
      'src/pricing/quote.ts':
        '/**\n * @scenario pricing: Volume discount tiers\n */\nexport function quote(): number {\n  return 1;\n}\n',
    });
    const change = await createChange(root, 'No Cover');
    await writeTask(change, ['src/pricing/quote.ts']);

    const result = await lintChangeFolder(root, change.folderPath, lintConfig(['pricing']));
    assertOnce(result.findings, 'quote: no test for "Volume discount tiers" covers it');
  });

  it('leaves a tag alone when a scoped test covers the function for the scenario', async () => {
    await writeLivingSpec(root, 'pricing', `${OWNERSHIP}\n${VOLUME}`);
    await writeFiles(root, {
      'src/pricing/quote.ts':
        '/**\n * @scenario pricing: Volume discount tiers\n */\nexport function quote(): number {\n  return 1;\n}\n',
      'tests/pricing-quote.test.ts': `import { scenario } from '@matteeh/osq/testing';\nimport { quote } from '../src/pricing/quote.js';\nscenario('pricing', 'Volume discount tiers', { covers: quote }, () => {});\n`,
    });
    const change = await createChange(root, 'Covered');
    await writeTask(change, ['src/pricing/quote.ts', 'tests/pricing-quote.test.ts'], {
      testsModify: true,
    });

    const result = await lintChangeFolder(root, change.folderPath, lintConfig(['pricing']));
    assert.equal(
      result.findings.some((finding) => finding.message.includes('no test for "')),
      false,
    );
  });

  it('reports a missing and an out-of-scope ADR tag', async () => {
    await writeLivingSpec(root, 'pricing', `${OWNERSHIP}\n${VOLUME}`);
    await writeFiles(root, {
      'decisions/001-money.md':
        '---\nstatus: accepted\napplies_to: [other]\nrule: amounts are cents\n---\n# 001. Money\n',
      'src/pricing/quote.ts':
        '/**\n * @scenario pricing: Volume discount tiers\n * @adr 001\n * @adr 099\n */\nexport function quote(): number {\n  return 1;\n}\n',
    });
    const change = await createChange(root, 'Adr Tags');
    await writeTask(change, ['src/pricing/quote.ts']);

    const result = await lintChangeFolder(root, change.folderPath, lintConfig(['pricing']));
    assertOnce(result.findings, "quote: ADR 099 doesn't exist or isn't accepted");
    assertOnce(result.findings, "quote: ADR 001 doesn't apply to any capability it serves");
  });

  it('checks an @adr-only function against its Code ownership', async () => {
    await writeLivingSpec(root, 'pricing', `${OWNERSHIP}\n${VOLUME}`);
    await writeFiles(root, {
      'decisions/001-money.md':
        '---\nstatus: accepted\napplies_to: [other]\nrule: amounts are cents\n---\n# 001. Money\n',
      'src/pricing/helper.ts':
        '/**\n * @adr 001\n */\nexport function helper(): number {\n  return 1;\n}\n',
      'src/elsewhere/helper.ts':
        '/**\n * @adr 001\n */\nexport function helper(): number {\n  return 1;\n}\n',
    });
    const change = await createChange(root, 'Adr Ownership');
    await writeTask(change, ['src/pricing/helper.ts', 'src/elsewhere/helper.ts']);

    const result = await lintChangeFolder(root, change.folderPath, lintConfig(['pricing']));
    const adrFindings = result.findings.filter((finding) => finding.message.includes('ADR 001'));
    assert.equal(adrFindings.length, 1, JSON.stringify(result.findings));
    assert.equal(
      adrFindings[0].message,
      "helper: ADR 001 doesn't apply to any capability it serves",
    );
    assert.equal(adrFindings[0].file, 'src/pricing/helper.ts');
  });

  it('reports two scenarios with the same name on the delta', async () => {
    await writeLivingSpec(
      root,
      'pricing',
      `${OWNERSHIP}
### Requirement: Alpha
The system SHALL alpha.

#### Scenario: Dup
- **WHEN** one
- **THEN** one

#### Scenario: Dup
- **WHEN** two
- **THEN** two
`,
    );
    const delta = `# Spec Delta: pricing

## ADDED Requirements

### Requirement: Beta
The system SHALL beta.

#### Scenario: New
- **WHEN** invoked
- **THEN** works
`;
    const change = await createChange(root, 'Duplicate', { deltas: { pricing: delta } });
    await writeTask(change, ['src/pricing/quote.ts']);

    const result = await lintChangeFolder(root, change.folderPath, lintConfig(['pricing']));
    const finding = matching(result.findings, 'two scenarios named');
    assert.equal(finding.message, 'pricing: two scenarios named "Dup"');
    assert.equal(finding.file, `openspec/changes/${change.folderName}/specs/pricing/spec.md`);
  });

  it('reports a malformed tag in a scoped file', async () => {
    await writeLivingSpec(root, 'pricing', `${OWNERSHIP}\n${VOLUME}`);
    await writeFiles(root, {
      'src/pricing/quote.ts':
        '/**\n * @scenario pricing\n */\nexport function quote(): number {\n  return 1;\n}\n',
    });
    const change = await createChange(root, 'Unreadable Tag');
    await writeTask(change, ['src/pricing/quote.ts']);

    const result = await lintChangeFolder(root, change.folderPath, lintConfig(['pricing']));
    const finding = matching(result.findings, 'is not "<capability>: <name>"');
    assert.equal(finding.file, 'src/pricing/quote.ts');
  });

  it('reports a non-literal scenario name in a scoped test', async () => {
    await writeLivingSpec(root, 'pricing', `${OWNERSHIP}\n${VOLUME}`);
    await writeFiles(root, {
      'src/pricing/quote.ts': 'export function quote(): number {\n  return 1;\n}\n',
      'tests/pricing-quote.test.ts': `import { scenario } from '@matteeh/osq/testing';\nimport { quote } from '../src/pricing/quote.js';\nconst NAME = 'Volume discount tiers';\nscenario('pricing', NAME, { covers: quote }, () => {});\n`,
    });
    const change = await createChange(root, 'Non Literal');
    await writeTask(change, ['src/pricing/quote.ts', 'tests/pricing-quote.test.ts'], {
      testsModify: true,
    });

    const result = await lintChangeFolder(root, change.folderPath, lintConfig(['pricing']));
    const finding = matching(result.findings, 'scenario call name is not a literal');
    assert.equal(finding.file, 'tests/pricing-quote.test.ts');
  });

  it('treats a planned scenario as tested and as covering its tagged functions', async () => {
    await writeLivingSpec(root, 'pricing', `${OWNERSHIP}\n${VOLUME}`);
    const delta = `# Spec Delta: pricing

## ADDED Requirements

### Requirement: Bulk pricing
The system SHALL price bulk orders.

#### Scenario: Bulk tier
- **WHEN** a bulk quote is calculated
- **THEN** the unit price is lower
`;
    await writeFiles(root, {
      'src/pricing/quote.ts':
        '/**\n * @scenario pricing: Bulk tier\n */\nexport function quote(): number {\n  return 1;\n}\n',
    });
    const change = await createChange(root, 'Planned', { deltas: { pricing: delta } });
    await writeTask(change, ['src/pricing/quote.ts', 'tests/pricing-bulk.test.ts'], {
      scenarios: ['pricing: Bulk tier'],
    });

    const result = await lintChangeFolder(root, change.folderPath, lintConfig(['pricing']));
    assert.equal(
      result.findings.some((finding) => finding.message.includes('Bulk tier')),
      false,
      JSON.stringify(result.findings),
    );
  });

  it('turns link findings into errors under require mode', async () => {
    await writeLivingSpec(root, 'pricing', `${OWNERSHIP}\n${VOLUME}`);
    const delta = `# Spec Delta: pricing

## ADDED Requirements

### Requirement: Bulk pricing
The system SHALL price bulk orders.

#### Scenario: Bulk tier
- **WHEN** a bulk quote is calculated
- **THEN** the unit price is lower
`;
    const change = await createChange(root, 'Require', { deltas: { pricing: delta } });
    await writeTask(change, ['src/pricing/quote.ts']);

    const result = await lintChangeFolder(
      root,
      change.folderPath,
      lintConfig(['pricing'], 'require'),
    );
    const finding = matching(result.findings, 'no test names scenario "Bulk tier"');
    assert.equal(finding.severity, 'error');
    assert.equal(result.valid, false);
  });

  it('reports none of the link findings for a capability that is not opted in', async () => {
    await writeLivingSpec(root, 'pricing', `${OWNERSHIP}\n${VOLUME}`);
    const delta = `# Spec Delta: pricing

## ADDED Requirements

### Requirement: Bulk pricing
The system SHALL price bulk orders.

#### Scenario: Bulk tier
- **WHEN** a bulk quote is calculated
- **THEN** the unit price is lower
`;
    await writeFiles(root, {
      'src/pricing/quote.ts':
        '/**\n * @scenario pricing: Bulk tier\n */\nexport function quote(): number {\n  return 1;\n}\n',
    });
    const change = await createChange(root, 'Not Opted In', { deltas: { pricing: delta } });
    await writeTask(change, ['src/pricing/quote.ts']);

    const result = await lintChangeFolder(root, change.folderPath, lintConfig([]));
    assert.deepEqual(traceFindings(result.findings), []);
  });

  it('copies the pricing fixture and reports a tag no longer covered', async () => {
    await fs.cp(path.join(process.cwd(), 'fixture', 'trace', 'pricing'), root, {
      recursive: true,
    });
    const change = await createChange(root, 'Pricing Fixture');
    await writeTask(change, ['src/pricing/quote.ts', 'tests/pricing-quote.test.ts'], {
      testsModify: true,
    });

    const intact = await lintChangeFolder(root, change.folderPath, lintConfig(['pricing']));
    assert.deepEqual(traceFindings(intact.findings), []);

    await fs.writeFile(
      path.join(root, 'src', 'pricing', 'quote.ts'),
      `export const CODES: Readonly<Record<string, number>> = { SAVE10: 10 };

export interface Quote {
  readonly unitPrice: number;
  readonly subtotal: number;
  readonly discount: number;
  readonly total: number;
}

function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

/** The unit price in cents for a quantity's tier. */
export function tierPrice(quantity: number): number {
  if (quantity >= 500) return 800;
  if (quantity >= 100) return 900;
  return 1000;
}

/**
 * Price one quote, in integer cents.
 *
 * @scenario pricing: Volume discount tiers
 * @scenario pricing: A percentage code comes off the tiered subtotal
 * @adr 001
 */
export function quote(quantity: number, code?: string): Quote {
  const unitPrice = tierPrice(quantity);
  const subtotal = quantity * unitPrice;
  const percent = code === undefined ? 0 : (CODES[code] ?? 0);
  const discount = roundHalfUp((subtotal * percent) / 100);
  return { unitPrice, subtotal, discount, total: subtotal - discount };
}
`,
      'utf8',
    );
    await fs.writeFile(
      path.join(root, 'tests', 'pricing-quote.test.ts'),
      `import assert from 'node:assert/strict';
import { scenario } from '@matteeh/osq/testing';
import { tierPrice } from '../src/pricing/quote.js';

function cents(dollars: string): number {
  return Math.round(Number(dollars) * 100);
}

scenario('pricing', 'Volume discount tiers', { covers: tierPrice }, ({ run, each }) => {
  each('the unit price follows this table', (row) => {
    assert.equal(run(Number(row.quantity)), cents(row['unit price']));
  });
});
`,
      'utf8',
    );

    const changed = await lintChangeFolder(root, change.folderPath, lintConfig(['pricing']));
    assertOnce(changed.findings, 'quote: no test for "Volume discount tiers" covers it');
  });

  it('produces nothing with nothing opted in and no scenario test file', async () => {
    await writeLivingSpec(root, 'pricing', `${OWNERSHIP}\n${VOLUME}`);
    await writeFiles(root, {
      'src/pricing/quote.ts':
        '/**\n * @scenario pricing: Volume discount tiers\n */\nexport function quote(): number {\n  return 1;\n}\n',
    });
    const change = await createChange(root, 'Nothing In');
    await writeTask(change, ['src/pricing/quote.ts']);

    const graph = await buildImportGraph(root, { skip: [DEFAULT_CONFIG.paths.openspecRoot] });
    const direct = await collectTraceabilityFindings({
      projectRoot: root,
      folderPath: change.folderPath,
      config: lintConfig([]),
      proposalPath: `openspec/changes/${change.folderName}/proposal.md`,
      tasks: [
        {
          taskNumber: '1',
          taskPath: `openspec/changes/${change.folderName}/tasks/1.md`,
          resolvedPaths: ['src/pricing/quote.ts'],
          testsModify: false,
        },
      ],
      importGraph: graph,
    });
    assert.deepEqual(direct, []);

    const defaultConfig = { ...DEFAULT_CONFIG, limits: { ...DEFAULT_CONFIG.limits } };
    const explicit = lintConfig([]);
    const first = await lintChangeFolder(root, change.folderPath, defaultConfig);
    const second = await lintChangeFolder(root, change.folderPath, explicit);
    assert.deepEqual(first.findings, second.findings);
  });
});
