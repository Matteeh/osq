import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { capabilityRenameCommand, capabilitySplitCommand } from '../src/cli/capability.js';
import { createProgram } from '../src/cli/index.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { mergeLivingSpec } from '../src/core/spec/apply-deltas.js';
import { parseDelta } from '../src/core/spec/delta.js';
import { lintChangeFolder } from '../src/core/spec/linter.js';
import { applyArchiveSpecs } from '../src/watcher/archive-specs.js';
import { installFakeValidator } from './helpers.js';

const GADGETS_PURPOSE = 'Gadget capability used by the capability command tests.';
const PRICING_PURPOSE = 'Pricing capability used by the capability command tests.';

const COUNT_BLOCK = `### Requirement: Count
The system SHALL count gadgets.

#### Scenario: Counting
- **WHEN** gadgets are counted
- **THEN** the count is returned`;

const PRICE_BLOCK = `### Requirement: Price
The system SHALL price gadgets.

#### Scenario: Pricing
- **WHEN** a price is requested
- **THEN** the price is returned`;

const STOCK_BLOCK = `### Requirement: Stock
The system SHALL track stock.

#### Scenario: Tracking
- **WHEN** stock is tracked
- **THEN** the level is returned`;

const GADGETS_OWNERSHIP_BLOCK = `### Requirement: Code ownership
<!-- source: src/gadgets/** -->
The gadgets capability SHALL own \`src/gadgets/**\`.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for gadgets
- **THEN** system maps \`src/gadgets/**\` to gadgets`;

const GADGETS_SPEC = `# gadgets Specification

## Purpose

${GADGETS_PURPOSE}

## Requirements

${COUNT_BLOCK}

${GADGETS_OWNERSHIP_BLOCK}

${PRICE_BLOCK}
`;

const GADGETS_SPLIT_SPEC = `# gadgets Specification

## Purpose

${GADGETS_PURPOSE}

## Requirements

${COUNT_BLOCK}

${PRICE_BLOCK}

${STOCK_BLOCK}

${GADGETS_OWNERSHIP_BLOCK}
`;

const PRICING_SPEC = `# pricing Specification

## Purpose

${PRICING_PURPOSE}

## Requirements

### Requirement: Volume pricing
The system SHALL price every unit by quantity.

#### Scenario: Works
- **WHEN** a quote is calculated
- **THEN** the unit price follows the tier
`;

const GADGETS_SIDECAR = 'group: inventory\n';

/** The delta that first created `gadgets`, replayed from no base. */
const GADGETS_CREATED_DELTA = [
  '# Spec Delta: gadgets',
  '',
  '## Purpose',
  '',
  GADGETS_PURPOSE,
  '',
  '## ADDED Requirements',
  '',
  COUNT_BLOCK,
  '',
  GADGETS_OWNERSHIP_BLOCK,
  '',
  PRICE_BLOCK,
  '',
].join('\n');

const SPLIT_MAP = [
  'counting:',
  '  purpose: Count them.',
  '  source:',
  '    - src/counting/**',
  '  group: tally',
  '  requirements:',
  '    - Count',
  'pricing:',
  '  requirements:',
  '    - Price',
  '',
].join('\n');

/** The three messages the generated-move lint emits for a rename. */
const MOVE_MESSAGE =
  /differs from the requirement REMOVED from gadgets|does not REMOVE from gadgets|which no capability in to ADDS/;

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    await fs.rm(roots.pop() ?? '', { recursive: true, force: true });
  }
});

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

async function fileText(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8');
}

async function setupProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-capability-command-'));
  roots.push(root);
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  return root;
}

async function writeLivingSpec(root: string, capability: string, content: string): Promise<void> {
  const dir = path.join(root, 'openspec', 'specs', capability);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'spec.md'), content, 'utf8');
}

async function writeLivingSidecar(
  root: string,
  capability: string,
  content: string,
): Promise<void> {
  const dir = path.join(root, 'openspec', 'specs', capability);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'osq.yml'), content, 'utf8');
}

/** A change folder numbered 002, the way capability relations write folders. */
async function createChange(root: string): Promise<{ folder: string; folderName: string }> {
  await createNewSpec(root, 'Placeholder');
  const spec = await createNewSpec(root, 'Capability Move');
  return { folder: spec.folderPath, folderName: spec.folderName };
}

/** Captured writers every command function receives. */
function writers(): {
  readonly stdout: () => string;
  readonly stderr: () => string;
  readonly options: { stdout: (text: string) => void; stderr: (text: string) => void };
} {
  let out = '';
  let err = '';
  return {
    stdout: () => out,
    stderr: () => err,
    options: {
      stdout: (text) => {
        out += text;
      },
      stderr: (text) => {
        err += text;
      },
    },
  };
}

/** The first tokens of one help group's rows. */
function groupTokens(help: string, heading: string): string[] {
  const lines = help.split('\n');
  const start = lines.findIndex((line) => line === heading);
  assert.notEqual(start, -1, `missing heading: ${heading}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.endsWith(' commands:') || line === 'Options:');
  return (end === -1 ? rest : rest.slice(0, end))
    .filter((line) => /^ {2}\S/.test(line))
    .map((line) => line.trimStart().match(/^\S+/)?.[0] ?? '')
    .filter((token) => token.length > 0);
}

describe('capability command', () => {
  it('renames through the command and names the files outside the specs', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'gadgets', GADGETS_SPEC);
    await writeLivingSidecar(root, 'gadgets', GADGETS_SIDECAR);
    const { folder } = await createChange(root);
    const w = writers();

    await capabilityRenameCommand('gadgets', 'widgets', {
      cwd: root,
      change: '002',
      ...w.options,
    });

    assert.equal(
      w.stdout(),
      [
        'wrote specs/gadgets/spec.md',
        'wrote specs/widgets/osq.yml',
        'wrote specs/widgets/spec.md',
        '0 file(s) outside the specs name gadgets; proposal.md lists them',
        '',
      ].join('\n'),
    );
    assert.equal(w.stderr(), '');
    assert.equal(await exists(path.join(folder, 'specs', 'widgets', 'spec.md')), true);
  });

  it('splits through the command', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'gadgets', GADGETS_SPLIT_SPEC);
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const { folder } = await createChange(root);
    await fs.writeFile(path.join(root, 'map.yml'), SPLIT_MAP, 'utf8');
    const w = writers();

    await capabilitySplitCommand('gadgets', 'map.yml', {
      cwd: root,
      change: '002',
      ...w.options,
    });

    assert.ok(w.stdout().startsWith('wrote specs/gadgets/spec.md\n'), w.stdout());
    assert.equal(
      await fileText(path.join(folder, 'specs', 'counting', 'osq.yml')),
      'group: tally\n',
    );
    assert.equal(await exists(path.join(folder, 'specs', 'counting', 'spec.md')), true);
    assert.equal(await exists(path.join(folder, 'specs', 'pricing', 'spec.md')), true);
    assert.equal(await exists(path.join(folder, 'specs', 'gadgets', 'spec.md')), true);
  });

  it('reports a missing map file and writes nothing', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'gadgets', GADGETS_SPEC);
    const { folder } = await createChange(root);
    const w = writers();

    await assert.rejects(
      () =>
        capabilitySplitCommand('gadgets', 'missing.yml', {
          cwd: root,
          change: '002',
          ...w.options,
        }),
      (error: Error) => {
        assert.ok(error.message.startsWith('Error: '), error.message);
        return true;
      },
    );
    assert.equal(w.stdout(), '');
    assert.equal(await exists(path.join(folder, 'specs')), false);
  });

  it('lists capability last in the Plumbing help group', () => {
    const help = createProgram('0.0.0').helpInformation();
    assert.deepEqual(groupTokens(help, 'Plumbing commands:'), [
      'new',
      'lint',
      'queue',
      'sync',
      'message',
      'migrate',
      'capability',
    ]);
  });

  it('replays a generated rename to the archived specs', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'gadgets', GADGETS_SPEC);
    await writeLivingSidecar(root, 'gadgets', GADGETS_SIDECAR);
    const { folder } = await createChange(root);
    const w = writers();

    await capabilityRenameCommand('gadgets', 'widgets', {
      cwd: root,
      change: '002',
      ...w.options,
    });

    const lint = await lintChangeFolder(root, folder, DEFAULT_CONFIG);
    const generated = lint.findings.filter((finding) => MOVE_MESSAGE.test(finding.message));
    assert.deepEqual(generated, [], JSON.stringify(generated, null, 2));

    await applyArchiveSpecs(root, folder, DEFAULT_CONFIG);
    assert.equal(await exists(path.join(root, 'openspec', 'specs', 'gadgets')), false);

    const gadgetsDelta = await fileText(path.join(folder, 'specs', 'gadgets', 'spec.md'));
    const widgetsDelta = await fileText(path.join(folder, 'specs', 'widgets', 'spec.md'));

    let gadgets: string | null = null;
    gadgets = mergeLivingSpec(gadgets, 'gadgets', parseDelta(GADGETS_CREATED_DELTA));
    gadgets = mergeLivingSpec(gadgets, 'gadgets', parseDelta(gadgetsDelta));
    assert.equal(gadgets, null);

    const widgets = mergeLivingSpec(null, 'widgets', parseDelta(widgetsDelta));
    assert.equal(
      widgets,
      await fileText(path.join(root, 'openspec', 'specs', 'widgets', 'spec.md')),
    );
  });
});
