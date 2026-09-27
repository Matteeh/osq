import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { readCreates } from '../src/core/spec/capability-relations.js';
import { nearestCapability } from '../src/core/spec/digest-capability.js';
import type { LintFinding } from '../src/core/spec/lint-findings.js';
import { lintChangeFolder } from '../src/core/spec/linter.js';
import { installFakeValidator } from './helpers.js';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OPENSPEC_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'openspec');

const PRICING_SPEC = `# pricing Specification

## Purpose

Pricing capability used by the capability relation tests.

## Requirements

### Requirement: Volume pricing
The system SHALL price every unit by quantity.

#### Scenario: Works
- **WHEN** a quote is calculated
- **THEN** the unit price follows the tier
`;

const GADGETS_DELTA = `# Spec Delta: gadgets

## Purpose

A brand new capability for gadget behavior.

## ADDED Requirements

### Requirement: Gadget counting
The system SHALL count gadgets.

#### Scenario: Works
- **WHEN** counted
- **THEN** it works
`;

function addedDelta(capability: string): string {
  return `# Spec Delta: ${capability}

## Purpose

A brand new capability for ${capability} behavior.

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

function fakeConfig(): OsqConfig {
  return DEFAULT_CONFIG;
}

function realValidatorConfig(): OsqConfig {
  return { ...DEFAULT_CONFIG, openspec: { bin: OPENSPEC_BIN } } as OsqConfig;
}

async function setupProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-cap-relations-'));
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
  readonly reads?: readonly string[];
  /** A list declares `creates`; a string writes a malformed raw value. */
  readonly creates?: string | readonly string[];
  readonly delta?: { readonly capability: string; readonly content: string };
}

function proposalMarkdown(options: ChangeOptions): string {
  const reads = options.reads ?? [];
  const readsLines =
    reads.length === 0 ? ['  reads: []'] : ['  reads:', ...reads.map((read) => `    - ${read}`)];
  const createsLines =
    options.creates === undefined
      ? []
      : typeof options.creates === 'string'
        ? [`creates: ${options.creates}`]
        : ['creates:', ...options.creates.map((name) => `  - ${name}`)];

  return [
    '---',
    'title: Capability relations',
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    ...readsLines,
    ...createsLines,
    '---',
    '## Goal',
    '',
    'Exercise the capability relation lint.',
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
  const spec = await createNewSpec(root, 'Capability Relations');
  const folder = spec.folderPath;
  const taskPath = path.join(folder, 'tasks', '1.md');
  const task = await fs.readFile(taskPath, 'utf8').catch(() => null);
  if (task !== null) {
    await fs.writeFile(taskPath, task.replace(/^verify:.*$/m, 'verify: node verify.cjs'), 'utf8');
  }
  await fs.writeFile(path.join(folder, 'proposal.md'), proposalMarkdown(options), 'utf8');
  if (options.delta) {
    const dir = path.join(folder, 'specs', options.delta.capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), options.delta.content, 'utf8');
  }
  return folder;
}

function messages(findings: readonly LintFinding[]): string[] {
  return findings.map((finding) => finding.message);
}

function hasMessage(findings: readonly LintFinding[], fragment: string): boolean {
  return findings.some((finding) => finding.message.includes(fragment));
}

describe('readCreates', () => {
  it('returns an empty list when creates is absent', () => {
    assert.deepEqual(readCreates({}), { names: [], malformed: false });
  });

  it('returns the trimmed names', () => {
    assert.deepEqual(readCreates({ creates: [' gadgets ', 'sprockets'] }), {
      names: ['gadgets', 'sprockets'],
      malformed: false,
    });
  });

  it('marks a non-list value malformed', () => {
    assert.deepEqual(readCreates({ creates: 'gadgets' }), { names: [], malformed: true });
    assert.deepEqual(readCreates({ creates: [1, 2] }), { names: [], malformed: true });
  });
});

describe('nearestCapability', () => {
  it('returns the name with the smallest edit distance', () => {
    assert.equal(nearestCapability('pricng', ['pricing', 'metrics-and-reporting']), 'pricing');
  });

  it('breaks a tie by name order', () => {
    assert.equal(nearestCapability('cat', ['bat', 'hat']), 'bat');
  });

  it('returns null without living names', () => {
    assert.equal(nearestCapability('pricing', []), null);
  });
});

describe('capability creation declaration', () => {
  it('accepts a declared creation with an adding delta', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const folder = await createChange(root, {
      reads: ['pricing'],
      creates: ['gadgets'],
      delta: { capability: 'gadgets', content: GADGETS_DELTA },
    });

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(
      hasMessage(result.findings, 'creates'),
      false,
      messages(result.findings).join('\n'),
    );
  });

  it('rejects a create that already has a living spec', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const folder = await createChange(root, { reads: ['pricing'], creates: ['pricing'] });

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.equal(result.valid, false);
    assert.ok(result.errors.includes('creates names pricing, which already has a living spec'));
  });

  it('rejects a create with no delta adding a requirement', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const folder = await createChange(root, { reads: ['pricing'], creates: ['gadgets'] });

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.includes(
        'creates names gadgets, but no delta under specs/gadgets/spec.md adds a requirement',
      ),
      result.errors.join('\n'),
    );
  });

  it('rejects a malformed creates value', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const folder = await createChange(root, { reads: ['pricing'], creates: 'gadgets' });

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.equal(result.valid, false);
    assert.ok(result.errors.includes('creates must be a list of capability names'));
  });

  it('lets the pinned validator accept a proposal carrying creates', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const folder = await createChange(root, {
      creates: ['gadgets'],
      delta: { capability: 'gadgets', content: GADGETS_DELTA },
    });

    const result = await lintChangeFolder(root, folder, realValidatorConfig());

    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(
      result.findings.some((finding) => /creates/i.test(finding.message)),
      false,
      JSON.stringify(result.findings),
    );
  });
});

describe('capability relations', () => {
  it('rejects a change that relates to no capability', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const folder = await createChange(root, { reads: [] });

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.includes(
        'proposal.md relates to no capability; write a delta under specs/<capability>/spec.md or name a capability in features.reads',
      ),
      result.errors.join('\n'),
    );
  });

  it('accepts a change that only reads a living capability', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const folder = await createChange(root, { reads: ['pricing'] });

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.equal(hasMessage(result.findings, 'relates to no capability'), false);
    assert.equal(hasMessage(result.findings, 'unknown capability'), false);
  });

  it('rejects a read of an unknown capability with the nearest name', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const folder = await createChange(root, { reads: ['pricng'] });

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.includes(
        'features.reads names unknown capability pricng; did you mean pricing?',
      ),
      result.errors.join('\n'),
    );
  });

  it('accepts a read of a capability the change creates', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const folder = await createChange(root, {
      reads: ['gadgets'],
      creates: ['gadgets'],
      delta: { capability: 'gadgets', content: GADGETS_DELTA },
    });

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.equal(hasMessage(result.findings, 'unknown capability'), false);
    assert.equal(result.valid, true, result.errors.join('\n'));
  });

  it('rejects a silent creation with the nearest name', async () => {
    const root = await setupProject();
    await writeLivingSpec(root, 'pricing', PRICING_SPEC);
    const folder = await createChange(root, {
      reads: [],
      delta: { capability: 'pricng', content: addedDelta('pricng') },
    });

    const result = await lintChangeFolder(root, folder, fakeConfig());

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.includes(
        'specs/pricng/spec.md creates capability pricng, which creates does not list; did you mean pricing?',
      ),
      result.errors.join('\n'),
    );
  });

  it('reports none of the relation findings without a living spec', async () => {
    const root = await setupProject();
    const noDelta = await createChange(root, { reads: ['anything'] });
    const newCapability = await createChange(root, {
      reads: [],
      delta: { capability: 'newcap', content: addedDelta('newcap') },
    });

    const first = await lintChangeFolder(root, noDelta, fakeConfig());
    const second = await lintChangeFolder(root, newCapability, fakeConfig());

    for (const finding of [...first.findings, ...second.findings]) {
      assert.equal(
        /relates to no capability|unknown capability|creates capability/.test(finding.message),
        false,
        finding.message,
      );
    }
  });
});
