import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { readCreates } from '../src/core/spec/capability-relations.js';
import {
  formatSidecar,
  parseSidecar,
  readLivingSidecar,
} from '../src/core/spec/capability-sidecar.js';
import { lintChangeFolder } from '../src/core/spec/linter.js';
import { installFakeValidator } from './helpers.js';

const PRICING_SPEC = `# pricing Specification

## Purpose

Pricing capability used by the capability sidecar tests.

## Requirements

### Requirement: Volume pricing
The system SHALL price every unit by quantity.

#### Scenario: Works
- **WHEN** a quote is calculated
- **THEN** the unit price follows the tier
`;

function addedDelta(capability: string): string {
  return `# Spec Delta: ${capability}

## ADDED Requirements

### Requirement: ${capability} counting
The system SHALL count ${capability}.

#### Scenario: Works
- **WHEN** counted
- **THEN** it works
`;
}

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    await fs.rm(roots.pop() ?? '', { recursive: true, force: true });
  }
});

function fakeConfig(requireGroups = false): OsqConfig {
  return { ...DEFAULT_CONFIG, capabilities: { requireGroups } };
}

async function setupProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-sidecar-'));
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

interface ChangeOptions {
  readonly reads?: readonly string[];
  /** Raw YAML for the `creates` value, e.g. `[gadgets]` or a grouped entry. */
  readonly creates?: string;
  readonly deltas?: ReadonlyArray<{ capability: string; content: string }>;
  readonly replacements?: ReadonlyArray<{ capability: string; content: string }>;
}

function proposalMarkdown(options: ChangeOptions): string {
  const reads = options.reads ?? [];
  const readsLines =
    reads.length === 0 ? ['  reads: []'] : ['  reads:', ...reads.map((read) => `    - ${read}`)];
  const createsLines = options.creates === undefined ? [] : [`creates: ${options.creates}`];

  return [
    '---',
    'title: Capability sidecars',
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    ...readsLines,
    ...createsLines,
    '---',
    '## Goal',
    '',
    'Exercise sidecar lint.',
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

async function createChange(root: string, options: ChangeOptions = {}): Promise<string> {
  const spec = await createNewSpec(root, 'Capability Sidecars');
  const folder = spec.folderPath;
  const taskPath = path.join(folder, 'tasks', '1.md');
  const task = await fs.readFile(taskPath, 'utf8').catch(() => null);
  if (task !== null) {
    await fs.writeFile(taskPath, task.replace(/^verify:.*$/m, 'verify: node verify.cjs'), 'utf8');
  }
  await fs.writeFile(path.join(folder, 'proposal.md'), proposalMarkdown(options), 'utf8');
  for (const delta of options.deltas ?? []) {
    const dir = path.join(folder, 'specs', delta.capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), delta.content, 'utf8');
  }
  for (const replacement of options.replacements ?? []) {
    const dir = path.join(folder, 'specs', replacement.capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'osq.yml'), replacement.content, 'utf8');
  }
  return folder;
}

function includes(findings: readonly string[], fragment: string): boolean {
  return findings.some((finding) => finding.includes(fragment));
}

describe('parseSidecar', () => {
  it('reads a group and tags', () => {
    const { sidecar, problems } = parseSidecar('group: inventory\ntags:\n  - costing\n');
    assert.deepEqual(problems, []);
    assert.deepEqual(sidecar, { group: 'inventory', tags: ['costing'] });
  });

  it('reports a missing group', () => {
    assert.deepEqual(parseSidecar('tags: [a]\n').problems, ['group must be a non-empty string']);
  });

  it('reports malformed tags', () => {
    assert.deepEqual(parseSidecar('group: inventory\ntags: nope\n').problems, [
      'tags must be a list of non-empty strings',
    ]);
  });

  it('reports an unknown key', () => {
    assert.deepEqual(parseSidecar('group: inventory\nowner: me\n').problems, ['unknown key owner']);
  });

  it('reports content that is not a mapping', () => {
    assert.deepEqual(parseSidecar('- a\n- b\n').problems, ['not a YAML mapping']);
  });
});

describe('formatSidecar', () => {
  it('writes a group', () => {
    assert.equal(formatSidecar({ group: 'inventory' }), 'group: inventory\n');
  });

  it('writes tags one per line', () => {
    assert.equal(
      formatSidecar({ group: 'inventory', tags: ['costing', 'forecast'] }),
      'group: inventory\ntags:\n  - costing\n  - forecast\n',
    );
  });
});

describe('readLivingSidecar', () => {
  it('returns null when no sidecar exists', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);

    assert.equal(await readLivingSidecar(root, 'openspec', 'pricing'), null);
  });

  it('returns the parsed sidecar', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    await writeLivingSidecar(root, 'pricing', 'group: inventory\n');

    assert.deepEqual(await readLivingSidecar(root, 'openspec', 'pricing'), { group: 'inventory' });
  });

  it('returns null when the sidecar has a problem', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    await writeLivingSidecar(root, 'pricing', '- a\n- b\n');

    assert.equal(await readLivingSidecar(root, 'openspec', 'pricing'), null);
  });
});

describe('readCreates groups', () => {
  it('returns names and groups for mixed entries', () => {
    const creates = readCreates({
      creates: [' gadgets ', { name: ' sprockets ', group: ' inventory ' }],
    });

    assert.equal(creates.malformed, false);
    assert.deepEqual(creates.names, ['gadgets', 'sprockets']);
    assert.deepEqual(creates.entries, [
      { name: 'gadgets', group: null },
      { name: 'sprockets', group: 'inventory' },
    ]);
  });

  it('marks an entry without a group malformed', () => {
    const creates = readCreates({ creates: [{ name: 'gadgets' }] });

    assert.equal(creates.malformed, true);
    assert.deepEqual(creates.names, []);
  });

  it('marks a mapping with a non-string group malformed', () => {
    assert.equal(readCreates({ creates: [{ name: 'gadgets', group: 1 }] }).malformed, true);
  });
});

describe('capability sidecar lint', () => {
  it('reports an unknown key in a replacement sidecar', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const folder = await createChange(root, {
      reads: ['pricing'],
      replacements: [{ capability: 'pricing', content: 'group: inventory\nowner: me\n' }],
    });

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.includes('specs/pricing/osq.yml: unknown key owner'),
      result.errors.join('\n'),
    );
  });

  it('reports a replacement sidecar with no group', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const folder = await createChange(root, {
      reads: ['pricing'],
      replacements: [{ capability: 'pricing', content: 'tags: [a]\n' }],
    });

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.includes('specs/pricing/osq.yml: group must be a non-empty string'),
      result.errors.join('\n'),
    );
  });

  it('reports a replacement for a capability that does not exist', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const folder = await createChange(root, {
      reads: ['pricing'],
      replacements: [{ capability: 'ghost', content: 'group: inventory\n' }],
    });

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.includes(
        'specs/ghost/osq.yml replaces the sidecar of ghost, which has no living spec and is not created by this change',
      ),
      result.errors.join('\n'),
    );
  });

  it('reports a broken living sidecar as a repository finding', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    await writeLivingSidecar(root, 'pricing', '- a\n- b\n');
    const folder = await createChange(root, { reads: ['pricing'] });

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.ok(
      result.repository.some(
        (finding) => finding.message === 'openspec/specs/pricing/osq.yml: not a YAML mapping',
      ),
      JSON.stringify(result.repository),
    );
    assert.equal(includes(result.errors, 'osq.yml'), false);
  });

  it('reports nothing when sidecars are missing', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const folder = await createChange(root, { reads: ['pricing'] });

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.equal(includes(result.errors, 'osq.yml'), false);
    assert.equal(result.repository.length, 0);
  });
});

describe('grouped creation lint', () => {
  it('fails a bare creates name when groups are required', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const folder = await createChange(root, {
      reads: ['gadgets'],
      creates: '[gadgets]',
      deltas: [{ capability: 'gadgets', content: addedDelta('gadgets') }],
    });

    const result = await lintChangeFolder(root, folder, fakeConfig(true));

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.includes(
        'creates names gadgets without a group; write creates: [{ name: gadgets, group: <group> }]',
      ),
      result.errors.join('\n'),
    );
  });

  it('fails an ungrouped creates entry when groups are required', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const folder = await createChange(root, {
      reads: ['gadgets'],
      creates: '[{ name: gadgets, group: ungrouped }]',
      deltas: [{ capability: 'gadgets', content: addedDelta('gadgets') }],
    });

    const result = await lintChangeFolder(root, folder, fakeConfig(true));

    assert.equal(result.valid, false);
    assert.ok(
      includes(result.errors, 'creates names gadgets without a group'),
      result.errors.join('\n'),
    );
  });

  it('accepts a grouped creates entry when groups are required', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const folder = await createChange(root, {
      reads: ['gadgets'],
      creates: '[{ name: gadgets, group: inventory }]',
      deltas: [{ capability: 'gadgets', content: addedDelta('gadgets') }],
    });

    const result = await lintChangeFolder(root, folder, fakeConfig(true));

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(includes(result.errors, 'without a group'), false);
  });

  it('fails a written living capability with no sidecar group', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const folder = await createChange(root, {
      reads: ['pricing'],
      deltas: [{ capability: 'pricing', content: addedDelta('pricing') }],
    });

    const result = await lintChangeFolder(root, folder, fakeConfig(true));

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.includes(
        'pricing has no group; add specs/pricing/osq.yml with a group to this change',
      ),
      result.errors.join('\n'),
    );
  });

  it('accepts a replacement sidecar that supplies the written capability group', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const folder = await createChange(root, {
      reads: ['pricing'],
      deltas: [{ capability: 'pricing', content: addedDelta('pricing') }],
      replacements: [{ capability: 'pricing', content: 'group: inventory\n' }],
    });

    const result = await lintChangeFolder(root, folder, fakeConfig(true));

    assert.equal(includes(result.errors, 'has no group'), false, result.errors.join('\n'));
  });

  it('stays silent when groups are not required', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const folder = await createChange(root, {
      reads: ['gadgets'],
      creates: '[gadgets]',
      deltas: [{ capability: 'gadgets', content: addedDelta('gadgets') }],
    });

    const result = await lintChangeFolder(root, folder, fakeConfig(false));

    assert.equal(includes(result.errors, 'without a group'), false);
  });
});
