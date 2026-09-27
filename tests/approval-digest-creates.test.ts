import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
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
  readonly creates?: readonly string[];
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
  const creates = change.creates === undefined ? '' : `creates: [${change.creates.join(', ')}]\n`;
  return `---\ntitle: Fixture\nverify: pnpm verify\n${creates}---\n## Goal\n\n${change.goal}\n\n## Human steps\n\n\n`;
}

function livingSpec(name: string): string {
  return `# ${name} Specification\n\n## Purpose\n\nFixture purpose.\n\n## Requirements\n`;
}

const addedDelta = `# Spec Delta: Fixture

## ADDED Requirements

### Requirement: Fixture requirement
The system SHALL do a thing.

#### Scenario: A scenario
- **WHEN** x happens
- **THEN** y holds
`;

describe('approval digest creates', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-approval-creates-'));
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

  it('counts a listed capability as created though its name resembles a living one', async () => {
    const folder = await makeChange({
      folder: '030-listed-creates',
      goal: 'Create a capability declared in creates.',
      creates: ['watcher-harness'],
      tasks: oneTask(),
      specs: [{ capability: 'watcher-harness', content: addedDelta }],
      livingSpecs: ['watcher-and-harness'],
    });

    const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);

    assert.equal(digest.capabilities[0].creates, true);
    assert.deepEqual(
      digest.flags.filter((flag) => flag.id === 'unknown_capability'),
      [],
    );
    assert.ok(formatApprovalDigest(digest).includes('  watcher-harness (new capability):'));
  });

  it('counts a listed capability as created without a Purpose section', async () => {
    const folder = await makeChange({
      folder: '031-listed-no-purpose',
      goal: 'Create a capability declared in creates.',
      creates: ['gadgets'],
      tasks: oneTask(),
      specs: [{ capability: 'gadgets', content: addedDelta }],
      livingSpecs: ['api'],
    });

    const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);

    assert.equal(digest.capabilities[0].creates, true);
    assert.deepEqual(digest.flags, []);
    assert.ok(formatApprovalDigest(digest).includes('  gadgets (new capability):'));
  });

  it('leaves the Purpose-and-resemblance rule in place when creates is absent', async () => {
    const folder = await makeChange({
      folder: '032-unlisted',
      goal: 'Forget the purpose.',
      tasks: oneTask(),
      specs: [{ capability: 'brand-new-capability', content: addedDelta }],
    });

    const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);
    const flags = digest.flags.filter((flag) => flag.id === 'unknown_capability');

    assert.equal(digest.capabilities[0].creates, false);
    assert.equal(flags.length, 1);
    assert.equal(flags[0].label, 'unknown capability brand-new-capability without a Purpose');
  });

  it('does not count a listed name that already has a living spec as created', async () => {
    const folder = await makeChange({
      folder: '033-listed-living',
      goal: 'List an existing capability.',
      creates: ['api'],
      tasks: oneTask(),
      specs: [{ capability: 'api', content: addedDelta }],
      livingSpecs: ['api'],
    });

    const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);

    assert.equal(digest.capabilities[0].creates, false);
  });
});
