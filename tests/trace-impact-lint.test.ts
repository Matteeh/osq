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
const SCENARIO = 'Volume discount tiers';

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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-trace-impact-'));
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

const LIVING = `# pricing Specification

## Purpose

The pricing capability exists for this test with plenty of words to pass.

## Requirements

### Requirement: Volume pricing
The engine SHALL price every unit at its tier.

#### Scenario: Volume discount tiers
- **WHEN** a quote is calculated for a quantity
- **THEN** the unit price follows the tier table
`;

const MODIFIED_DELTA = `# Spec Delta: pricing

## MODIFIED Requirements

### Requirement: Volume pricing
The engine SHALL price every unit at its tier.

#### Scenario: Volume discount tiers
- **WHEN** a quote is calculated for a quantity
- **THEN** the unit price is always 9.00
`;

const REMOVED_DELTA = `# Spec Delta: pricing

## REMOVED Requirements

### Requirement: Volume pricing
`;

const SCENARIO_TEST = `import { scenario } from '@matteeh/osq/testing';\nimport { quote } from '../src/pricing/quote.js';\nscenario('pricing', '${SCENARIO}', { covers: quote }, () => {});\n`;

async function writeLivingSpec(root: string, body: string): Promise<void> {
  const dir = path.join(root, 'openspec', 'specs', 'pricing');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'spec.md'), body, 'utf8');
}

interface ChangeHandle {
  readonly folderPath: string;
  readonly folderName: string;
  readonly proposalPath: string;
  readonly taskPath: string;
}

async function createChange(root: string, title: string, delta: string): Promise<ChangeHandle> {
  const spec = await createNewSpec(root, title);
  const proposalPath = path.join(spec.folderPath, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8');
  await fs.writeFile(proposalPath, proposal.replace(/^verify:.*$/m, `verify: ${VERIFY}`), 'utf8');

  const deltaDir = path.join(spec.folderPath, 'specs', 'pricing');
  await fs.mkdir(deltaDir, { recursive: true });
  await fs.writeFile(path.join(deltaDir, 'spec.md'), delta, 'utf8');

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
  testsModify = false,
): Promise<void> {
  const testsLine = testsModify ? '\ntests:\n  modify: true' : '';
  const frontmatter = `title: Task 1\nverify: ${VERIFY}\nscope: [${scope.join(', ')}]\nentry: []\nskills: []${testsLine}`;
  await fs.writeFile(
    change.taskPath,
    `---\n${frontmatter}\n---\n## Acceptance\n- [ ] passes cleanly\n`,
    'utf8',
  );
}

function blastFindings(findings: readonly LintFinding[]): LintFinding[] {
  return findings.filter(
    (finding) =>
      finding.message.includes('changes; tests naming it:') ||
      finding.message.includes('but no task scopes it with tests.modify: true'),
  );
}

function matching(findings: readonly LintFinding[], fragment: string): LintFinding {
  const found = findings.filter((finding) => finding.message.includes(fragment));
  assert.ok(found.length > 0, `no finding matched ${fragment}: ${JSON.stringify(findings)}`);
  return found[0];
}

describe('trace impact lint', () => {
  let root: string;

  beforeEach(async () => {
    root = await setupProject();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('lists the test naming a modified scenario and warns it is not scoped', async () => {
    await writeLivingSpec(root, LIVING);
    await writeFiles(root, {
      'src/pricing/quote.ts': 'export function quote(): number {\n  return 1;\n}\n',
      'tests/pricing-quote.test.ts': SCENARIO_TEST,
    });
    const change = await createChange(root, 'Modified Frozen', MODIFIED_DELTA);
    await writeTask(change, ['src/pricing/quote.ts']);

    const result = await lintChangeFolder(root, change.folderPath, lintConfig(['pricing']));
    const listing = matching(result.findings, 'changes; tests naming it:');
    assert.equal(listing.severity, 'warning');
    assert.equal(
      listing.message,
      `Scenario "${SCENARIO}" in pricing changes; tests naming it: tests/pricing-quote.test.ts`,
    );
    matching(
      result.findings,
      `tests/pricing-quote.test.ts names changed scenario "${SCENARIO}" but no task scopes it with tests.modify: true`,
    );
    assert.equal(blastFindings(result.findings).length, 2, JSON.stringify(result.findings));
  });

  it('raises no modification warning for a test scoped with tests.modify', async () => {
    await writeLivingSpec(root, LIVING);
    await writeFiles(root, {
      'src/pricing/quote.ts': 'export function quote(): number {\n  return 1;\n}\n',
      'tests/pricing-quote.test.ts': SCENARIO_TEST,
    });
    const change = await createChange(root, 'Modified Scoped', MODIFIED_DELTA);
    await writeTask(change, ['src/pricing/quote.ts', 'tests/pricing-quote.test.ts'], true);

    const result = await lintChangeFolder(root, change.folderPath, lintConfig(['pricing']));
    assert.equal(blastFindings(result.findings).length, 1, JSON.stringify(result.findings));
    assert.equal(
      blastFindings(result.findings)[0].message,
      `Scenario "${SCENARIO}" in pricing changes; tests naming it: tests/pricing-quote.test.ts`,
    );
  });

  it('lists a scenario removed from a requirement', async () => {
    await writeLivingSpec(root, LIVING);
    await writeFiles(root, {
      'src/pricing/quote.ts': 'export function quote(): number {\n  return 1;\n}\n',
      'tests/pricing-quote.test.ts': SCENARIO_TEST,
    });
    const change = await createChange(root, 'Removed', REMOVED_DELTA);
    await writeTask(change, ['src/pricing/quote.ts']);

    const result = await lintChangeFolder(root, change.folderPath, lintConfig(['pricing']));
    assert.equal(blastFindings(result.findings).length, 2, JSON.stringify(result.findings));
    assert.equal(
      blastFindings(result.findings)[0].message,
      `Scenario "${SCENARIO}" in pricing changes; tests naming it: tests/pricing-quote.test.ts`,
    );
  });

  it('still lists for a capability that is not opted in', async () => {
    await writeLivingSpec(root, LIVING);
    await writeFiles(root, {
      'src/pricing/quote.ts': 'export function quote(): number {\n  return 1;\n}\n',
      'tests/pricing-quote.test.ts': SCENARIO_TEST,
    });
    const change = await createChange(root, 'Not Opted In', MODIFIED_DELTA);
    await writeTask(change, ['src/pricing/quote.ts']);

    const result = await lintChangeFolder(root, change.folderPath, lintConfig([]));
    const listing = matching(result.findings, 'changes; tests naming it:');
    assert.equal(listing.severity, 'warning');
  });

  it('turns blast findings into errors under require mode for an opted-in capability', async () => {
    await writeLivingSpec(root, LIVING);
    await writeFiles(root, {
      'src/pricing/quote.ts': 'export function quote(): number {\n  return 1;\n}\n',
      'tests/pricing-quote.test.ts': SCENARIO_TEST,
    });
    const change = await createChange(root, 'Require', MODIFIED_DELTA);
    await writeTask(change, ['src/pricing/quote.ts']);

    const result = await lintChangeFolder(
      root,
      change.folderPath,
      lintConfig(['pricing'], 'require'),
    );
    for (const finding of blastFindings(result.findings)) {
      assert.equal(finding.severity, 'error', finding.message);
    }
    assert.equal(result.valid, false);
  });

  it('produces no finding without a scenario test file', async () => {
    await writeLivingSpec(root, LIVING);
    await writeFiles(root, {
      'src/pricing/quote.ts': 'export function quote(): number {\n  return 1;\n}\n',
    });
    const change = await createChange(root, 'No Test File', MODIFIED_DELTA);
    await writeTask(change, ['src/pricing/quote.ts']);

    const result = await lintChangeFolder(root, change.folderPath, lintConfig(['pricing']));
    assert.deepEqual(blastFindings(result.findings), []);
  });

  it('produces nothing with nothing opted in and no scenario test file', async () => {
    await writeLivingSpec(root, LIVING);
    await writeFiles(root, {
      'src/pricing/quote.ts': 'export function quote(): number {\n  return 1;\n}\n',
    });
    const change = await createChange(root, 'Nothing In', MODIFIED_DELTA);
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
    const first = await lintChangeFolder(root, change.folderPath, defaultConfig);
    const second = await lintChangeFolder(root, change.folderPath, lintConfig([]));
    assert.deepEqual(first.findings, second.findings);
  });
});
