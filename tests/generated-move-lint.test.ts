import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import type { LintFinding } from '../src/core/spec/lint-findings.js';
import { lintChangeFolder } from '../src/core/spec/linter.js';
import { installFakeValidator } from './helpers.js';

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

const CODE_OWNERSHIP_BLOCK = `### Requirement: Code ownership
<!-- source: src/gadgets/** -->
The gadgets capability SHALL own \`src/gadgets/**\`.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for gadgets
- **THEN** system maps \`src/gadgets/**\` to gadgets`;

const COLOUR_BLOCK = `### Requirement: Colour
The system SHALL colour gadgets.

#### Scenario: Colouring
- **WHEN** gadgets are coloured
- **THEN** the colour is returned`;

const GADGETS_SPEC = `# gadgets Specification

## Purpose

Gadget capability used by the generated move lint tests.

## Requirements

${COUNT_BLOCK}

${PRICE_BLOCK}

${CODE_OWNERSHIP_BLOCK}
`;

function removedBlock(name: string): string {
  return `### Requirement: ${name}
**Reason**: Moved to widgets by a generated capability rename.
**Migration**: widgets carries the same requirement, byte for byte.`;
}

/** The generator's REMOVED delta for a rename that empties `gadgets`. */
function gadgetsRemovedDelta(): string {
  return `# Spec Delta: gadgets

## REMOVED Requirements

${removedBlock('Count')}

${removedBlock('Price')}

${removedBlock('Code ownership')}
`;
}

interface WidgetsDeltaOptions {
  /** Replace the ADDED `Count` block to simulate an edited move. */
  readonly count?: string;
  readonly price?: boolean;
  readonly colour?: boolean;
}

/** The generator's ADDED delta for the new `widgets` target. */
function widgetsDelta(options: WidgetsDeltaOptions = {}): string {
  const blocks = [options.count ?? COUNT_BLOCK];
  if (options.price !== false) {
    blocks.push(PRICE_BLOCK);
  }
  if (options.colour) {
    blocks.push(COLOUR_BLOCK);
  }
  blocks.push(CODE_OWNERSHIP_BLOCK);
  return `# Spec Delta: widgets

## Purpose

A widget capability.

## ADDED Requirements

${blocks.join('\n\n')}
`;
}

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    await fs.rm(roots.pop() ?? '', { recursive: true, force: true });
  }
});

function fakeConfig(): OsqConfig {
  return DEFAULT_CONFIG;
}

async function setupProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-generated-move-'));
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

interface ChangeOptions {
  /** The raw frontmatter value of `generated`. */
  readonly generated?: string;
  readonly creates?: readonly string[];
}

function proposalMarkdown(options: ChangeOptions): string {
  const createsLines =
    options.creates === undefined
      ? []
      : ['creates:', ...options.creates.map((name) => `  - ${name}`)];
  const generatedLines = options.generated === undefined ? [] : [`generated: ${options.generated}`];
  return [
    '---',
    'title: Generated move lint',
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    ...createsLines,
    ...generatedLines,
    '---',
    '## Goal',
    '',
    'Exercise the generated-move lint.',
    '',
    '## Surface',
    '',
    'None.',
    '',
    '## Decisions',
    '',
    'None',
    '',
    '## Delta',
    '',
    'Delta specs live beside the proposal.',
    '',
  ].join('\n');
}

async function createChange(
  root: string,
  options: ChangeOptions & {
    readonly fromDelta?: string;
    readonly widgetsDelta?: string;
  } = {},
): Promise<string> {
  const spec = await createNewSpec(root, 'Generated Move Lint');
  const folder = spec.folderPath;
  const taskPath = path.join(folder, 'tasks', '1.md');
  const task = await fs.readFile(taskPath, 'utf8').catch(() => null);
  if (task !== null) {
    await fs.writeFile(taskPath, task.replace(/^verify:.*$/m, 'verify: node verify.cjs'), 'utf8');
  }
  await fs.writeFile(path.join(folder, 'proposal.md'), proposalMarkdown(options), 'utf8');
  if (options.fromDelta !== undefined) {
    const dir = path.join(folder, 'specs', 'gadgets');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), options.fromDelta, 'utf8');
  }
  if (options.widgetsDelta !== undefined) {
    const dir = path.join(folder, 'specs', 'widgets');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), options.widgetsDelta, 'utf8');
  }
  return folder;
}

/** Only findings whose message comes from the generated-move check. */
function generatedMessages(findings: readonly LintFinding[]): string[] {
  return findings
    .map((finding) => finding.message)
    .filter((message) => / ADDED "| REMOVED "|^generated must |^generated names /.test(message));
}

const RENAME_GENERATED = '{ kind: rename, from: gadgets, to: [widgets] }';

async function setupRename(
  options: WidgetsDeltaOptions & {
    readonly generated?: string;
    readonly creates?: readonly string[];
  } = {},
): Promise<{ root: string; folder: string }> {
  const root = await setupProject();
  await writeLivingSpec(root, 'gadgets', GADGETS_SPEC);
  const folder = await createChange(root, {
    generated: options.generated ?? RENAME_GENERATED,
    creates: options.creates ?? ['widgets'],
    fromDelta: gadgetsRemovedDelta(),
    widgetsDelta: widgetsDelta(options),
  });
  return { root, folder };
}

describe('generated move lint', () => {
  it('reports no finding for an untouched generated rename', async () => {
    const { root, folder } = await setupRename();

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.deepEqual(generatedMessages(result.findings), []);
  });

  it('fails when an ADDED requirement differs from the living one', async () => {
    const edited = COUNT_BLOCK.replace(
      'The system SHALL count gadgets.',
      'The system SHALL tally gadgets.',
    );
    const { root, folder } = await setupRename({ count: edited });

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.deepEqual(generatedMessages(result.findings), [
      'widgets ADDED "Count" differs from the requirement REMOVED from gadgets',
    ]);
  });

  it('fails when an ADDED requirement is not REMOVED from the old capability', async () => {
    const { root, folder } = await setupRename({ colour: true });

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.deepEqual(generatedMessages(result.findings), [
      'widgets ADDED "Colour", which the generated rename does not REMOVE from gadgets',
    ]);
  });

  it('fails when a REMOVED requirement lands nowhere', async () => {
    const { root, folder } = await setupRename({ price: false });

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.deepEqual(generatedMessages(result.findings), [
      'gadgets REMOVED "Price", which no capability in to ADDS',
    ]);
  });

  it('fails when generated is malformed', async () => {
    const { root, folder } = await setupRename({ generated: 'rename' });

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.deepEqual(generatedMessages(result.findings), [
      'generated must name kind rename or split, from, and a list to',
    ]);
  });

  it('fails when the from capability has no living spec', async () => {
    const root = await setupProject();
    const folder = await createChange(root, {
      generated: '{ kind: rename, from: ghost, to: [widgets] }',
      creates: ['widgets'],
      widgetsDelta: widgetsDelta(),
    });

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.deepEqual(generatedMessages(result.findings), [
      'generated names ghost, which has no living spec',
    ]);
  });

  it('reports nothing when the proposal carries no generated field', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'gadgets', GADGETS_SPEC);
    const folder = await createChange(root, {
      creates: ['widgets'],
      fromDelta: gadgetsRemovedDelta(),
      widgetsDelta: widgetsDelta(),
    });

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.deepEqual(generatedMessages(result.findings), []);
  });
});
