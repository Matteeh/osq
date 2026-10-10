import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import YAML from 'yaml';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { readMoveMap } from '../src/core/spec/capability-move-map.js';
import { ownershipList } from '../src/core/spec/capability-move-text.js';
import { generateCapabilityMove } from '../src/core/spec/capability-move.js';
import { mergeDelta, parseCapabilitySpec, parseDelta } from '../src/core/spec/delta.js';
import { installFakeValidator } from './helpers.js';

const GADGETS_PURPOSE = 'Gadget capability used by the capability move tests.';
const PRICING_PURPOSE = 'Pricing capability used by the capability move tests.';

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

const WIDGETS_OWNERSHIP_BLOCK = `### Requirement: Code ownership
<!-- source: src/gadgets/** -->
The widgets capability SHALL own \`src/gadgets/**\`.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for widgets
- **THEN** system maps \`src/gadgets/**\` to widgets`;

const COUNTING_OWNERSHIP_BLOCK = `### Requirement: Code ownership
<!-- source: src/counting/** -->
The counting capability SHALL own \`src/counting/**\`.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for counting
- **THEN** system maps \`src/counting/**\` to counting`;

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

const GADGETS_SIDECAR = `group: inventory
tags:
  - stock
`;

function removedBlock(name: string, target: string, kind: 'rename' | 'split'): string {
  return [
    `### Requirement: ${name}`,
    `**Reason**: Moved to ${target} by a generated capability ${kind}.`,
    `**Migration**: ${target} carries the same requirement, byte for byte.`,
  ].join('\n');
}

function ownershipRemoval(old: string, kind: 'rename' | 'split'): string {
  return [
    '### Requirement: Code ownership',
    `**Reason**: ${old} has no requirement left after this generated ${kind}.`,
    '**Migration**: Each capability that takes its requirements declares its own Code ownership.',
  ].join('\n');
}

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    await fs.rm(roots.pop() ?? '', { recursive: true, force: true });
  }
});

function config(): OsqConfig {
  return DEFAULT_CONFIG;
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

async function setupProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-capability-move-'));
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

/** A change folder numbered 002, the way capability-relations writes folders. */
async function createChange(
  root: string,
  options: { readonly dependsOn?: readonly string[] } = {},
): Promise<{ folder: string; folderName: string }> {
  await createNewSpec(root, 'Placeholder');
  const spec = await createNewSpec(
    root,
    'Capability Move',
    options.dependsOn === undefined ? {} : { dependsOn: options.dependsOn },
  );
  return { folder: spec.folderPath, folderName: spec.folderName };
}

async function refusalOf(run: () => unknown | Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected a refusal');
}

async function fileText(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8');
}

async function rename(
  root: string,
  folder: string,
  to: string,
): Promise<{ written: readonly string[]; naming: readonly string[] }> {
  return generateCapabilityMove(root, config(), path.basename(folder), {
    kind: 'rename',
    from: 'gadgets',
    to,
  });
}

async function split(
  root: string,
  folder: string,
  mapText: string,
): Promise<{ written: readonly string[]; naming: readonly string[] }> {
  const targets = readMoveMap(mapText);
  return generateCapabilityMove(root, config(), path.basename(folder), {
    kind: 'split',
    from: 'gadgets',
    targets,
  });
}

describe('generated capability move', () => {
  it('rename moves every requirement and writes in order', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'gadgets', GADGETS_SPEC);
    await writeLivingSidecar(root, 'gadgets', GADGETS_SIDECAR);
    const { folder } = await createChange(root);

    const result = await rename(root, folder, 'widgets');

    assert.equal(
      await fileText(path.join(folder, 'specs', 'gadgets', 'spec.md')),
      `# Spec Delta: gadgets\n\n## REMOVED Requirements\n\n${removedBlock('Count', 'widgets', 'rename')}\n\n${removedBlock('Price', 'widgets', 'rename')}\n\n${ownershipRemoval('gadgets', 'rename')}\n`,
    );
    assert.equal(
      await fileText(path.join(folder, 'specs', 'widgets', 'spec.md')),
      `# Spec Delta: widgets\n\n## Purpose\n\n${GADGETS_PURPOSE}\n\n## ADDED Requirements\n\n${COUNT_BLOCK}\n\n${PRICE_BLOCK}\n\n${WIDGETS_OWNERSHIP_BLOCK}\n`,
    );
    assert.deepEqual(result.written, [
      'specs/gadgets/spec.md',
      'specs/widgets/osq.yml',
      'specs/widgets/spec.md',
    ]);
  });

  it('moved text is byte for byte', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'gadgets', GADGETS_SPEC);
    await writeLivingSidecar(root, 'gadgets', GADGETS_SIDECAR);
    const { folder } = await createChange(root);
    await rename(root, folder, 'widgets');

    const widgetsDelta = parseDelta(
      await fileText(path.join(folder, 'specs', 'widgets', 'spec.md')),
    );
    const merged = parseCapabilitySpec(mergeDelta(null, 'widgets', widgetsDelta));
    const living = parseCapabilitySpec(GADGETS_SPEC);

    for (const name of ['Count', 'Price']) {
      const moved = merged.requirements.find((requirement) => requirement.name === name);
      const source = living.requirements.find((requirement) => requirement.name === name);
      assert.equal(moved?.raw, source?.raw, name);
    }
  });

  it('renders the ownership list table', () => {
    assert.equal(ownershipList(['src/a/**']), '`src/a/**`');
    assert.equal(
      ownershipList(['src/a/**', 'tests/a*.test.ts']),
      '`src/a/**` and `tests/a*.test.ts`',
    );
    assert.equal(
      ownershipList(['src/a/**', 'tests/a*.test.ts', 'fixture/a/**']),
      '`src/a/**`, `tests/a*.test.ts`, and `fixture/a/**`',
    );
  });

  it('rename keeps the sidecar byte for byte', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'gadgets', GADGETS_SPEC);
    await writeLivingSidecar(root, 'gadgets', GADGETS_SIDECAR);
    const { folder } = await createChange(root);

    await rename(root, folder, 'widgets');

    assert.equal(await fileText(path.join(folder, 'specs', 'widgets', 'osq.yml')), GADGETS_SIDECAR);
  });

  it('refuses an approved change and writes nothing', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'gadgets', GADGETS_SPEC);
    const { folder, folderName } = await createChange(root);
    await fs.mkdir(path.join(folder, '.run'), { recursive: true });
    await fs.writeFile(path.join(folder, '.run', 'approved'), 'sha256:x\n', 'utf8');

    const message = await refusalOf(() => rename(root, folder, 'widgets'));

    assert.equal(
      message,
      `change ${folderName} is approved; generate the move into an unapproved change`,
    );
    assert.equal(await exists(path.join(folder, 'specs')), false);
  });

  it('refuses a rename onto a living capability', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'gadgets', GADGETS_SPEC);
    await writeLivingSpec(root, 'widgets', GADGETS_SPEC);
    const { folder } = await createChange(root);

    assert.equal(
      await refusalOf(() => rename(root, folder, 'widgets')),
      'capability widgets already has a living spec',
    );
    assert.equal(await exists(path.join(folder, 'specs')), false);
  });

  it('running it again replaces the earlier output', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'gadgets', GADGETS_SPEC);
    await writeLivingSidecar(root, 'gadgets', GADGETS_SIDECAR);
    const { folder } = await createChange(root);

    await rename(root, folder, 'widgets');
    await rename(root, folder, 'gizmos');

    assert.equal(await exists(path.join(folder, 'specs', 'gadgets')), true);
    assert.equal(await exists(path.join(folder, 'specs', 'gizmos')), true);
    assert.equal(await exists(path.join(folder, 'specs', 'widgets')), false);
  });

  it('splits into a new and a living capability', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'gadgets', GADGETS_SPLIT_SPEC);
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const { folder } = await createChange(root);
    const map = [
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

    await split(root, folder, map);

    assert.equal(
      await fileText(path.join(folder, 'specs', 'gadgets', 'spec.md')),
      `# Spec Delta: gadgets\n\n## REMOVED Requirements\n\n${removedBlock('Count', 'counting', 'split')}\n\n${removedBlock('Price', 'pricing', 'split')}\n`,
    );
    assert.equal(
      await fileText(path.join(folder, 'specs', 'counting', 'spec.md')),
      `# Spec Delta: counting\n\n## Purpose\n\nCount them.\n\n## ADDED Requirements\n\n${COUNT_BLOCK}\n\n${COUNTING_OWNERSHIP_BLOCK}\n`,
    );
    assert.equal(
      await fileText(path.join(folder, 'specs', 'counting', 'osq.yml')),
      'group: tally\n',
    );
    assert.equal(
      await fileText(path.join(folder, 'specs', 'pricing', 'spec.md')),
      `# Spec Delta: pricing\n\n## ADDED Requirements\n\n${PRICE_BLOCK}\n`,
    );
    assert.equal(await exists(path.join(folder, 'specs', 'pricing', 'osq.yml')), false);
  });

  it('splits and empties the old capability', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'gadgets', GADGETS_SPLIT_SPEC);
    const { folder } = await createChange(root);
    const map = [
      'counting:',
      '  purpose: Count them.',
      '  source:',
      '    - src/counting/**',
      '  requirements:',
      '    - Count',
      '    - Price',
      '    - Stock',
      '',
    ].join('\n');

    await split(root, folder, map);

    const oldDelta = await fileText(path.join(folder, 'specs', 'gadgets', 'spec.md'));
    assert.ok(oldDelta.endsWith(`${ownershipRemoval('gadgets', 'split')}\n`), oldDelta);
    assert.ok(oldDelta.includes(removedBlock('Stock', 'counting', 'split')));
  });
});

describe('generated move map', () => {
  it('returns targets in map order', () => {
    const targets = readMoveMap('b:\n  requirements: [Count]\na:\n  requirements: [Price]\n');
    assert.deepEqual(
      targets.map((target) => target.name),
      ['b', 'a'],
    );
  });

  it('refuses each bad map', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'gadgets', GADGETS_SPLIT_SPEC);
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const { folder } = await createChange(root);

    const rows: ReadonlyArray<{ map: string; message: string; textOnly: boolean }> = [
      {
        map: '{}',
        message: 'the map must name at least one capability',
        textOnly: true,
      },
      {
        map: 'counting: { purpose: P, source: [s], requirements: [] }',
        message: 'map entry counting lists no requirement',
        textOnly: true,
      },
      {
        map: 'counting: { purpose: P, source: [s], requirements: [Count, Count] }',
        message: 'requirement "Count" is mapped twice',
        textOnly: true,
      },
      {
        map: 'counting: { purpose: P, source: [s], requirements: [Code ownership] }',
        message: 'Code ownership is generated; leave it out of the map',
        textOnly: true,
      },
      {
        map: 'counting: { purpose: P, source: [s], requirements: [Ghost] }',
        message: 'gadgets has no requirement "Ghost"',
        textOnly: false,
      },
      {
        map: 'gadgets: { requirements: [Count] }',
        message: 'the map cannot name gadgets',
        textOnly: false,
      },
      {
        map: 'counting: { source: [s], requirements: [Count] }',
        message: 'map entry counting needs purpose and source',
        textOnly: false,
      },
      {
        map: 'pricing: { group: g, requirements: [Count] }',
        message: 'map entry pricing already has a living spec; leave out purpose, group and source',
        textOnly: false,
      },
    ];

    for (const row of rows) {
      const message = row.textOnly
        ? await refusalOf(() => readMoveMap(row.map))
        : await refusalOf(() => split(root, folder, row.map));
      assert.equal(message, row.message, row.map);
      assert.equal(await exists(path.join(folder, 'specs')), false, row.map);
    }
  });
});

describe('generated move proposal', () => {
  it('writes generated, creates and the trailing section', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'gadgets', GADGETS_SPEC);
    await writeLivingSidecar(root, 'gadgets', GADGETS_SIDECAR);
    const { folder } = await createChange(root, { dependsOn: ['001'] });

    await rename(root, folder, 'widgets');

    const proposal = await fileText(path.join(folder, 'proposal.md'));
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(proposal);
    assert.ok(match, proposal);
    const frontmatter = match[1];
    const body = match[2];
    assert.ok(frontmatter.includes('depends_on: ["001"]'), frontmatter);
    const data = YAML.parse(frontmatter) as Record<string, unknown>;
    assert.deepEqual(data.depends_on, ['001']);
    assert.deepEqual(data.generated, { kind: 'rename', from: 'gadgets', to: ['widgets'] });
    assert.deepEqual(data.creates, [{ name: 'widgets', group: 'inventory' }]);
    assert.ok(
      body
        .trimEnd()
        .endsWith(
          [
            '## Generated',
            '',
            '`osq capability rename` wrote these files; run it again instead of editing them:',
            '',
            '- `specs/gadgets/spec.md`',
            '- `specs/widgets/osq.yml`',
            '- `specs/widgets/spec.md`',
            '',
            "Files outside the specs that name gadgets, for this change's tasks:",
            '',
            'None',
          ].join('\n'),
        ),
      body,
    );
  });

  it('lists the files that name the capability and changes none of them', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'gadgets', GADGETS_SPEC);
    await writeLivingSidecar(root, 'gadgets', GADGETS_SIDECAR);
    const { folder } = await createChange(root);
    await fs.mkdir(path.join(root, 'tests'), { recursive: true });
    await fs.writeFile(path.join(root, 'tests', 'gadgets.test.ts'), '// gadgets here\n', 'utf8');
    await fs.writeFile(path.join(root, 'README.md'), 'gadgets-extra only\n', 'utf8');
    await fs.mkdir(path.join(root, 'dist'), { recursive: true });
    await fs.writeFile(path.join(root, 'dist', 'x.js'), 'gadgets\n', 'utf8');
    await fs.mkdir(path.join(root, 'node_modules', 'm'), { recursive: true });
    await fs.writeFile(path.join(root, 'node_modules', 'm', 'x.js'), 'gadgets\n', 'utf8');
    await fs.writeFile(
      path.join(root, 'osq.config.ts'),
      "export default { gadgets: 'gadgets' };\n",
      'utf8',
    );

    const watched = [
      'osq.config.ts',
      'tests/gadgets.test.ts',
      'README.md',
      'dist/x.js',
      'node_modules/m/x.js',
    ];
    const before = await Promise.all(watched.map((rel) => fileText(path.join(root, rel))));

    const result = await rename(root, folder, 'widgets');

    assert.deepEqual(result.naming, ['osq.config.ts', 'tests/gadgets.test.ts']);
    for (const [index, rel] of watched.entries()) {
      assert.equal(await fileText(path.join(root, rel)), before[index], rel);
    }
    const proposal = await fileText(path.join(folder, 'proposal.md'));
    assert.ok(proposal.includes('- `osq.config.ts`'), proposal);
    assert.ok(proposal.includes('- `tests/gadgets.test.ts`'), proposal);
  });
});
