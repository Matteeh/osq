import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { resemblingCapability } from '../src/core/spec/digest-capability.js';
import { buildApprovalDigest, formatApprovalDigest } from '../src/core/spec/digest.js';

interface TaskFixture {
  readonly number: string;
  readonly title: string;
  readonly verify: string;
  readonly scope: readonly string[];
}

interface ChangeFixture {
  readonly folder: string;
  readonly goal: string;
  readonly tasks: readonly TaskFixture[];
  readonly specs?: ReadonlyArray<{ capability: string; content: string }>;
  readonly livingSpecs?: readonly string[];
}

const RUNNER_VERIFY = 'node --import tsx --test tests/placeholder.test.ts';

function taskContent(task: TaskFixture): string {
  const scopeLines = task.scope.map((entry) => `  - ${entry}`).join('\n');
  return `---\ntitle: ${task.title}\nverify: ${task.verify}\nscope:\n${scopeLines}\nentry: []\nskills: []\n---\n## Acceptance\n- [ ] one line\n`;
}

function proposalContent(change: ChangeFixture): string {
  return `---\ntitle: Fixture\nverify: pnpm verify\n---\n## Goal\n\n${change.goal}\n\n## Human steps\n\n\n`;
}

function livingSpec(name: string): string {
  return `# ${name} Specification\n\n## Purpose\n\nFixture purpose.\n\n## Requirements\n`;
}

function purposeDelta(purpose: string): string {
  return `# Spec Delta: Fixture

## Purpose
${purpose}

## ADDED Requirements

### Requirement: Fixture requirement
The system SHALL do a thing.

#### Scenario: A scenario
- **WHEN** x happens
- **THEN** y holds
`;
}

const addedDelta = `# Spec Delta: Fixture

## ADDED Requirements

### Requirement: Fixture requirement
The system SHALL do a thing.

#### Scenario: A scenario
- **WHEN** x happens
- **THEN** y holds
`;

describe('approval digest capability creation', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-approval-capability-'));
    await fs.mkdir(path.join(projectRoot, 'openspec', 'changes'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  async function write(relative: string, content: string): Promise<void> {
    const full = path.join(projectRoot, relative);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf8');
  }

  async function makeChange(change: ChangeFixture): Promise<string> {
    const folderPath = path.join(projectRoot, 'openspec', 'changes', change.folder);
    await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalContent(change), 'utf8');
    for (const task of change.tasks) {
      await fs.writeFile(
        path.join(folderPath, 'tasks', `${task.number}.md`),
        taskContent(task),
        'utf8',
      );
    }
    for (const spec of change.specs ?? []) {
      await write(
        path.join('openspec', 'changes', change.folder, 'specs', spec.capability, 'spec.md'),
        spec.content,
      );
    }
    for (const name of change.livingSpecs ?? []) {
      await write(path.join('openspec', 'specs', name, 'spec.md'), livingSpec(name));
    }
    return folderPath;
  }

  function oneTask(): TaskFixture[] {
    return [{ number: '1', title: 'Do the work', verify: RUNNER_VERIFY, scope: ['src/a.ts'] }];
  }

  it('resembles names by separators, word subset, and edit distance', () => {
    assert.equal(resemblingCapability('watcher_harness', ['watcher-harness']), 'watcher-harness');
    assert.equal(
      resemblingCapability('watcher-harness', ['watcher-and-harness']),
      'watcher-and-harness',
    );
    assert.equal(
      resemblingCapability('watcher-and-harness', ['watcher-harness']),
      'watcher-harness',
    );
    assert.equal(
      resemblingCapability('watcher-and-harnes', ['watcher-and-harness']),
      'watcher-and-harness',
    );
  });

  it('returns null for short dissimilar names', () => {
    assert.equal(resemblingCapability('cli', ['api']), null);
    assert.equal(resemblingCapability('cli', []), null);
  });

  it('returns the first resembling living name in name order', () => {
    assert.equal(
      resemblingCapability('watcher-harness', ['watcher-harness', 'watcher-and-harness']),
      'watcher-and-harness',
    );
  });

  it('marks a delta with Purpose for a new dissimilar name as created and flags nothing', async () => {
    const folder = await makeChange({
      folder: '020-created',
      goal: 'Create a capability on purpose.',
      tasks: oneTask(),
      specs: [{ capability: 'gadgets', content: purposeDelta('Gadgets are new.') }],
      livingSpecs: ['api'],
    });

    const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);

    assert.equal(digest.capabilities[0].creates, true);
    assert.deepEqual(digest.flags, []);
    assert.ok(formatApprovalDigest(digest).includes('  gadgets (new capability):'));
  });

  it('flags a delta without Purpose for a missing capability', async () => {
    const folder = await makeChange({
      folder: '021-no-purpose',
      goal: 'Forget the purpose.',
      tasks: oneTask(),
      specs: [{ capability: 'brand-new-capability', content: addedDelta }],
    });

    const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);
    const flags = digest.flags.filter((flag) => flag.id === 'unknown_capability');

    assert.equal(flags.length, 1);
    assert.equal(flags[0].label, 'unknown capability brand-new-capability without a Purpose');
    assert.equal(flags[0].excerpt, 'no living spec at openspec/specs/brand-new-capability/spec.md');
    assert.ok(!formatApprovalDigest(digest).includes('(new capability)'));
  });

  it('flags a delta with Purpose whose name resembles a living capability', async () => {
    const folder = await makeChange({
      folder: '022-resembles',
      goal: 'Resemble a living capability.',
      tasks: oneTask(),
      specs: [{ capability: 'watcher-harness', content: purposeDelta('Almost the same name.') }],
      livingSpecs: ['watcher-and-harness'],
    });

    const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);
    const flags = digest.flags.filter((flag) => flag.id === 'unknown_capability');

    assert.equal(flags.length, 1);
    assert.equal(
      flags[0].label,
      'unknown capability watcher-harness resembles watcher-and-harness',
    );
    assert.equal(flags[0].excerpt, 'no living spec at openspec/specs/watcher-harness/spec.md');
  });

  it('raises no flag for cli beside a living api', async () => {
    const folder = await makeChange({
      folder: '023-cli',
      goal: 'Create a short capability.',
      tasks: oneTask(),
      specs: [{ capability: 'cli', content: purposeDelta('A command line capability.') }],
      livingSpecs: ['api'],
    });

    const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);

    assert.equal(digest.capabilities[0].creates, true);
    assert.deepEqual(
      digest.flags.filter((flag) => flag.id === 'unknown_capability'),
      [],
    );
    assert.ok(formatApprovalDigest(digest).includes('  cli (new capability):'));
  });
});
