import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { buildApprovalDigest } from '../src/core/spec/digest.js';
import { createChange, createProject, readManifest } from './planning-observed-helpers.js';

interface TaskFixture {
  readonly number: string;
  readonly title: string;
  readonly verify: string;
  readonly scope: readonly string[];
  readonly verifyStarts?: 'red' | 'green' | 'any';
}

interface ChangeFixture {
  readonly folder: string;
  readonly goal: string;
  readonly tasks: readonly TaskFixture[];
  readonly specs?: ReadonlyArray<{ capability: string; content: string }>;
}

const EXISTING_TEST = 'tests/existing.test.ts';
const NEW_TEST = 'tests/new.test.ts';

function taskContent(task: TaskFixture): string {
  const scopeLines = task.scope.map((entry) => `  - ${entry}`).join('\n');
  const starts = task.verifyStarts ? `\nverify_starts: ${task.verifyStarts}` : '';
  return `---\ntitle: ${task.title}\nverify: ${task.verify}\nscope:\n${scopeLines}\nentry: []\nskills: []${starts}\n---\n## Acceptance\n- [ ] one line\n`;
}

function proposalContent(): string {
  return '---\ntitle: Fixture\nverify: pnpm verify\n---\n## Goal\n\nExercise the verify start contradiction.\n\n## Human steps\n\n\n';
}

const addedDelta = `# Spec Delta: Fixture

## ADDED Requirements

### Requirement: Fixture requirement
The system SHALL do a thing.

#### Scenario: A scenario
- **WHEN** x happens
- **THEN** y holds
`;

describe('approval digest verify start conflict', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-approval-digest-starts-'));
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
    await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalContent(), 'utf8');
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
    return folderPath;
  }

  it('flags a green or any task whose verify names a test it creates', async () => {
    await write(EXISTING_TEST, '// existing test\n');
    for (const start of ['green', 'any'] as const) {
      const folder = await makeChange({
        folder: `010-${start}`,
        goal: 'Create a new test.',
        tasks: [
          {
            number: '1',
            title: 'Add the new test',
            verify: `node --import tsx --test ${NEW_TEST} ${EXISTING_TEST}`,
            scope: [NEW_TEST],
            verifyStarts: start,
          },
        ],
      });

      const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);
      const conflicts = digest.flags.filter((flag) => flag.id === 'verify_starts_conflict');

      assert.equal(conflicts.length, 1);
      assert.equal(conflicts[0].label, 'verify starts conflict in task 1');
      assert.ok(conflicts[0].excerpt.includes(NEW_TEST));
      assert.ok(conflicts[0].excerpt.includes(`verify_starts: ${start}`));
    }
  });

  it('emits the conflict last, after unknown_capability', async () => {
    await write(EXISTING_TEST, '// existing test\n');
    const folder = await makeChange({
      folder: '011-order',
      goal: 'Order the flags.',
      tasks: [
        {
          number: '1',
          title: 'Add the new test',
          verify: `node --import tsx --test ${NEW_TEST} ${EXISTING_TEST}`,
          scope: [NEW_TEST],
          verifyStarts: 'any',
        },
      ],
      specs: [{ capability: 'brand-new-capability', content: addedDelta }],
    });

    const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);
    assert.deepEqual(
      digest.flags.map((flag) => flag.id),
      ['unknown_capability', 'verify_starts_conflict'],
    );
  });

  it('does not flag a red task that creates its own test', async () => {
    await write(EXISTING_TEST, '// existing test\n');
    const folder = await makeChange({
      folder: '012-red',
      goal: 'Start red.',
      tasks: [
        {
          number: '1',
          title: 'Add the new test',
          verify: `node --import tsx --test ${NEW_TEST}`,
          scope: [NEW_TEST],
          verifyStarts: 'red',
        },
      ],
    });

    const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);
    assert.deepEqual(digest.flags, []);
  });

  it('does not flag a path an earlier task scope covers, whatever it declares', async () => {
    for (const start of ['red', 'green', 'any'] as const) {
      const folder = await makeChange({
        folder: `013-earlier-${start}`,
        goal: 'A later task reuses an earlier task path.',
        tasks: [
          {
            number: '1',
            title: 'Create the path',
            verify: `node --import tsx --test ${EXISTING_TEST}`,
            scope: [NEW_TEST],
            verifyStarts: 'red',
          },
          {
            number: '2',
            title: 'Name the earlier path',
            verify: `node --import tsx --test ${NEW_TEST}`,
            scope: ['src/other.ts'],
            verifyStarts: start,
          },
        ],
      });

      const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);
      assert.deepEqual(
        digest.flags.filter((flag) => flag.id === 'verify_starts_conflict'),
        [],
      );
    }
  });

  it('records the new id in the manifest approvalFlags through approveSpec', async () => {
    const root = await createProject();
    try {
      const change = await createChange(root, 'Conflict Change');
      await fs.mkdir(path.join(root, 'tests'), { recursive: true });
      await fs.writeFile(path.join(root, EXISTING_TEST), '// existing test\n', 'utf8');
      await fs.writeFile(
        path.join(change.folderPath, 'tasks', '1.md'),
        taskContent({
          number: '1',
          title: 'Add the new test',
          verify: `node --import tsx --test ${NEW_TEST} ${EXISTING_TEST}`,
          scope: [NEW_TEST],
          verifyStarts: 'any',
        }),
        'utf8',
      );

      const result = await approveSpec(root, change.specId, DEFAULT_CONFIG);
      assert.ok(
        result.digest.flags.some((flag) => flag.id === 'verify_starts_conflict'),
        'the digest should carry the conflict flag',
      );

      const manifest = await readManifest(change.folderPath);
      const approvalFlags = manifest.approvalFlags as { ids: string[]; mode: string };
      assert.ok(
        approvalFlags.ids.includes('verify_starts_conflict'),
        `manifest approvalFlags should record the id, got ${JSON.stringify(approvalFlags)}`,
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
