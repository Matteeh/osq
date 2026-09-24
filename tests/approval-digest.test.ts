import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import {
  buildApprovalDigest,
  collapseWhitespace,
  firstTwoSentences,
  formatApprovalDigest,
  formatApprovalFlags,
  summarizeApprovalFlags,
} from '../src/core/spec/digest.js';

interface TaskFixture {
  readonly number: string;
  readonly title: string;
  readonly verify: string;
  readonly scope: readonly string[];
  readonly testsModify?: boolean;
}

interface ChangeFixture {
  readonly folder: string;
  readonly goal: string;
  readonly verify?: string;
  readonly humanSteps?: string;
  readonly tasks: readonly TaskFixture[];
  readonly specs?: ReadonlyArray<{ capability: string; content: string }>;
  readonly livingSpecs?: readonly string[];
}

const RUNNER_VERIFY = 'node --import tsx --test tests/placeholder.test.ts';

function taskContent(task: TaskFixture): string {
  const scopeLines = task.scope.map((entry) => `  - ${entry}`).join('\n');
  const testsLine = task.testsModify ? '\ntests:\n  modify: true' : '';
  return `---\ntitle: ${task.title}\nverify: ${task.verify}\nscope:\n${scopeLines}\nentry: []\nskills: []${testsLine}\n---\n## Acceptance\n- [ ] one line\n`;
}

function proposalContent(change: ChangeFixture): string {
  return `---\ntitle: Fixture\nverify: ${change.verify ?? 'pnpm verify'}\n---\n## Goal\n\n${change.goal}\n\n## Human steps\n\n${change.humanSteps ?? ''}\n`;
}

function livingSpec(name: string): string {
  return `# ${name} Specification\n\n## Purpose\n\nFixture purpose.\n\n## Requirements\n`;
}

describe('approval digest', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-approval-digest-'));
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

  const addedDelta = `# Spec Delta: Fixture

## ADDED Requirements

### Requirement: Fixture requirement
The system SHALL do a thing.

#### Scenario: A scenario
- **WHEN** x happens
- **THEN** y holds
`;

  async function buildClean(): Promise<string> {
    await write('src/one.ts', 'export const one = 1;\n');
    await write('src/two.ts', 'export const two = 2;\n');
    return makeChange({
      folder: '001-clean',
      goal: 'First sentence one. Second sentence two. Third sentence three.',
      humanSteps: 'Review the plan.',
      verify: 'pnpm verify',
      tasks: [
        { number: '1', title: 'Do the first thing', verify: RUNNER_VERIFY, scope: ['src/one.ts'] },
        { number: '2', title: 'Do the second thing', verify: RUNNER_VERIFY, scope: ['src/two.ts'] },
      ],
      specs: [{ capability: 'spec-lint-and-approve', content: addedDelta }],
      livingSpecs: ['spec-lint-and-approve'],
    });
  }

  it('summarizes a clean change and raises no flags', async () => {
    const folder = await buildClean();
    const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);

    assert.equal(digest.change, '001-clean');
    assert.equal(digest.goal, 'First sentence one. Second sentence two.');
    assert.equal(digest.humanSteps, 'Review the plan.');
    assert.deepEqual(
      digest.tasks.map((task) => [task.number, task.title, task.scopeFiles, task.testsModify]),
      [
        ['1', 'Do the first thing', 1, false],
        ['2', 'Do the second thing', 1, false],
      ],
    );
    assert.deepEqual(digest.capabilities, [
      {
        name: 'spec-lint-and-approve',
        added: ['Fixture requirement'],
        modified: [],
        removed: [],
        creates: false,
      },
    ]);
    assert.deepEqual(digest.flags, []);
    assert.deepEqual(formatApprovalFlags(digest.flags), []);
    assert.equal(summarizeApprovalFlags(digest.flags), '');

    const text = formatApprovalDigest(digest);
    assert.ok(text.includes('Goal: First sentence one. Second sentence two.'));
    assert.ok(text.includes('1. Do the first thing (1 scope file)'));
    assert.ok(text.includes('spec-lint-and-approve'));
    assert.ok(text.includes('Human steps:'));
    assert.ok(!text.includes('Flag:'));
  });

  it('collapses whitespace and takes the first two sentences of a goal', () => {
    assert.equal(collapseWhitespace('  a\n  b\tc  '), 'a b c');
    assert.equal(firstTwoSentences('One.   Two\nsecond. Three.'), 'One. Two second.');
    assert.equal(firstTwoSentences('Only one sentence'), 'Only one sentence');
    assert.equal(firstTwoSentences(''), '');
  });

  it('reports tests.modify tasks with existing tests as information, never a flag', async () => {
    await write('tests/existing.test.ts', '// existing test\n');
    const folder = await makeChange({
      folder: '002-modify',
      goal: 'Keep an existing test green.',
      tasks: [
        {
          number: '1',
          title: 'Update the existing test',
          verify: 'node --import tsx --test tests/existing.test.ts',
          scope: ['tests/existing.test.ts'],
          testsModify: true,
        },
      ],
    });

    const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);

    assert.deepEqual(digest.tasks[0].existingTests, ['tests/existing.test.ts']);
    assert.equal(digest.tasks[0].testsModify, true);
    assert.deepEqual(digest.flags, []);
  });

  it('flags a resolved scope path shared by two tasks, including missing declarations', async () => {
    await write('src/shared.ts', 'export const shared = 1;\n');
    const folder = await makeChange({
      folder: '003-shared',
      goal: 'Share a file across two tasks.',
      tasks: [
        {
          number: '1',
          title: 'First',
          verify: RUNNER_VERIFY,
          scope: ['src/shared.ts', 'src/missing.ts'],
        },
        {
          number: '2',
          title: 'Second',
          verify: RUNNER_VERIFY,
          scope: ['src/shared.ts', 'src/missing.ts'],
        },
      ],
    });

    const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);
    const shared = digest.flags.find((flag) => flag.id === 'shared_file');

    assert.ok(shared);
    assert.equal(shared.label, 'shared files in tasks 1 and 2');
    assert.equal(
      shared.excerpt,
      'src/missing.ts, src/shared.ts; the watcher will halt for recertification when task 2 changes them',
    );
    assert.deepEqual(
      digest.flags.map((flag) => flag.id),
      ['shared_file'],
    );
  });

  it('flags every sensitive kind once and excludes env templates', async () => {
    const sensitive = [
      'package.json',
      'pnpm-lock.yaml',
      '.github/workflows/ci.yml',
      '.gitlab-ci.yml',
      'osq.config.ts',
      'openspec/config.yaml',
      'AGENTS.md',
      '.claude/commands/osq-plan.md',
      '.opencode/agent/helper.md',
      '.env',
      '.env.example',
    ];
    for (const file of sensitive) {
      await write(file, 'fixture\n');
    }

    const folder = await makeChange({
      folder: '004-sensitive',
      goal: 'Touch sensitive files.',
      tasks: [{ number: '1', title: 'Touch them', verify: RUNNER_VERIFY, scope: sensitive }],
    });

    const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);
    const labels = digest.flags.map((flag) => flag.label);
    assert.deepEqual(labels, [
      'package manifest in scope',
      'lockfile in scope',
      'CI workflow in scope',
      'osq config in scope',
      'OpenSpec config in scope',
      'managed instructions in scope',
      'env file in scope',
    ]);

    const env = digest.flags.find((flag) => flag.label === 'env file in scope');
    assert.ok(env);
    assert.ok(env.excerpt.includes('.env in task 1'));
    assert.ok(!env.excerpt.includes('.env.example'));

    const config = digest.flags.find((flag) => flag.label === 'OpenSpec config in scope');
    assert.ok(config?.excerpt.includes('openspec/config.yaml'));
  });

  it('flags only verifies that name neither a test file nor a runner', async () => {
    const folder = await makeChange({
      folder: '005-verify',
      goal: 'Exercise verify detection.',
      verify: 'npx tsc --noEmit',
      tasks: [
        { number: '1', title: 'Runner', verify: 'pnpm verify', scope: ['src/a.ts'] },
        {
          number: '2',
          title: 'Test file',
          verify: 'node --import tsx --test tests/b.test.ts',
          scope: ['src/b.ts'],
        },
        { number: '3', title: 'Vitest', verify: 'vitest run', scope: ['src/c.ts'] },
        { number: '4', title: 'Neither', verify: 'npx tsc --noEmit', scope: ['src/d.ts'] },
      ],
    });

    const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);

    assert.deepEqual(
      digest.flags.map((flag) => [flag.id, flag.label]),
      [
        ['verify_without_test', 'verify without a test in task 4'],
        ['verify_without_test', 'verify without a test in the proposal'],
      ],
    );
    assert.equal(digest.flags[0].excerpt, 'npx tsc --noEmit');
  });

  it('does not flag a verify that names a bare tests path segment', async () => {
    const folder = await makeChange({
      folder: '006-tests-path',
      goal: 'Detect the tests path segment.',
      tasks: [
        {
          number: '1',
          title: 'Node test dir',
          verify: 'node --import tsx --test tests/',
          scope: ['src/a.ts'],
        },
      ],
    });

    const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);
    assert.deepEqual(digest.flags, []);
  });

  it('flags removed requirements and unknown capabilities by name', async () => {
    const removedDelta = `# Spec Delta: Fixture

## REMOVED Requirements

### Requirement: Legacy requirement
`;
    const folder = await makeChange({
      folder: '007-removed',
      goal: 'Remove and invent capabilities.',
      tasks: [{ number: '1', title: 'Do it', verify: RUNNER_VERIFY, scope: ['src/a.ts'] }],
      specs: [
        { capability: 'spec-lint-and-approve', content: removedDelta },
        { capability: 'brand-new-capability', content: addedDelta },
      ],
      livingSpecs: ['spec-lint-and-approve'],
    });

    const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);

    assert.deepEqual(
      digest.flags.map((flag) => [flag.id, flag.label, flag.excerpt]),
      [
        [
          'removed_requirement',
          'removes 1 requirements from spec-lint-and-approve',
          'Legacy requirement',
        ],
        [
          'unknown_capability',
          'unknown capability brand-new-capability without a Purpose',
          'no living spec at openspec/specs/brand-new-capability/spec.md',
        ],
      ],
    );
  });

  it('keeps flag order stable by id, then task number or name, and formats lines', async () => {
    await write('src/shared.ts', 'export const shared = 1;\n');
    await write('package.json', '{}\n');
    const removedDelta = `# Spec Delta: Fixture

## REMOVED Requirements

### Requirement: Legacy requirement
`;
    const folder = await makeChange({
      folder: '008-ordered',
      goal: 'Trip several flags at once.',
      tasks: [
        {
          number: '1',
          title: 'First',
          verify: 'npx tsc --noEmit',
          scope: ['src/shared.ts', 'package.json'],
        },
        {
          number: '2',
          title: 'Second',
          verify: 'node --import tsx --test tests/two.test.ts',
          scope: ['src/shared.ts'],
        },
      ],
      specs: [
        { capability: 'spec-lint-and-approve', content: removedDelta },
        { capability: 'brand-new-capability', content: addedDelta },
      ],
      livingSpecs: ['spec-lint-and-approve'],
    });

    const digest = await buildApprovalDigest(projectRoot, folder, DEFAULT_CONFIG);

    assert.deepEqual(
      digest.flags.map((flag) => flag.label),
      [
        'shared files in tasks 1 and 2',
        'package manifest in scope',
        'verify without a test in task 1',
        'removes 1 requirements from spec-lint-and-approve',
        'unknown capability brand-new-capability without a Purpose',
      ],
    );

    assert.deepEqual(formatApprovalFlags(digest.flags), [
      'Flag: shared files in tasks 1 and 2 \u2014 src/shared.ts; the watcher will halt for recertification when task 2 changes them',
      'Flag: package manifest in scope \u2014 package.json in task 1',
      'Flag: verify without a test in task 1 \u2014 npx tsc --noEmit',
      'Flag: removes 1 requirements from spec-lint-and-approve \u2014 Legacy requirement',
      'Flag: unknown capability brand-new-capability without a Purpose \u2014 no living spec at openspec/specs/brand-new-capability/spec.md',
    ]);
    assert.equal(
      summarizeApprovalFlags(digest.flags),
      '5 flags: shared files in tasks 1 and 2, package manifest in scope, verify without a test in task 1, removes 1 requirements from spec-lint-and-approve, unknown capability brand-new-capability without a Purpose',
    );
  });

  it('summarizes a single flag with the singular noun', () => {
    assert.equal(
      summarizeApprovalFlags([
        { id: 'shared_file', label: 'shared files in tasks 1 and 2', excerpt: 'x' },
      ]),
      '1 flag: shared files in tasks 1 and 2',
    );
  });
});
