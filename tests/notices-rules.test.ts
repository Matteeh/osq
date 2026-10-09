import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { buildApprovalDigest } from '../src/core/spec/digest.js';
import { hashChangeFolder } from '../src/core/spec/hasher.js';
import { buildApprovalNotices, formatApprovalNotices } from '../src/core/spec/notices.js';
import { appendPlanReady, countPlanRevisions, readPlanReady } from '../src/core/spec/plan-ready.js';
import { createChange, createProject } from './planning-observed-helpers.js';

interface TaskSpec {
  readonly number: string;
  readonly scope?: readonly string[];
  readonly verifyStarts?: 'red' | 'green' | 'any';
  readonly testsModify?: boolean;
  readonly scenarios?: readonly string[];
}

interface ChangeSpec {
  readonly assumptions?: string | null;
  readonly decisions?: string;
  readonly tasks: readonly TaskSpec[];
  readonly deltas?: ReadonlyArray<{ readonly capability: string; readonly content: string }>;
  readonly files?: readonly string[];
  readonly config?: OsqConfig;
}

const BASE_TASKS: readonly TaskSpec[] = [
  { number: '1', scope: ['src/one.ts'] },
  { number: '2', scope: ['src/two.ts'] },
];

const REMOVED_DELTA = `# Spec Delta: alpha

## REMOVED Requirements

### Requirement: Alpha one
`;

const CREATED_DELTA = `# Spec Delta: beta

## Purpose

Beta exists to be created here.

## ADDED Requirements

### Requirement: Beta thing
The system SHALL do the beta thing.

#### Scenario: Beta works
- **WHEN** beta runs
- **THEN** it works
`;

const UNCOVERED_DELTA = `# Spec Delta: alpha

## ADDED Requirements

### Requirement: Bulk price
The system SHALL price in bulk.

#### Scenario: Bulk price
- **WHEN** the quantity is high
- **THEN** the price drops
`;

function proposalContent(spec: ChangeSpec): string {
  const frontmatter = [
    '---',
    'title: Fixture Change',
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
  ].join('\n');
  const sections: string[] = [
    '## Goal',
    '',
    'Exercise the approval notices.',
    '',
    '## Non-goals',
    '',
    'None.',
    '',
    '## Surface',
    '',
    'None',
    '',
    '## Decisions',
    '',
    spec.decisions ?? 'None',
    '',
  ];
  if (spec.assumptions !== null) {
    sections.push('## Assumptions', '', spec.assumptions ?? 'None', '');
  }
  sections.push('## Contract', '', '### Requirement: Fixture', '', 'The system SHALL work.', '');
  sections.push('## Delta', '', 'Delta specs declare behavior.', '');
  return `${frontmatter}\n${sections.join('\n')}\n`;
}

function taskContent(task: TaskSpec): string {
  const scope = task.scope ?? ['src/one.ts'];
  const lines = [
    '---',
    `title: Task ${task.number}`,
    'verify: node verify.cjs',
    'scope:',
    ...scope.map((entry) => `  - ${entry}`),
    'entry: []',
    'skills: []',
  ];
  if (task.verifyStarts) lines.push(`verify_starts: ${task.verifyStarts}`);
  if (task.testsModify) lines.push('tests.modify: true');
  lines.push('---', '## Acceptance', '- [ ] one');
  if (task.scenarios && task.scenarios.length > 0) {
    lines.push('', '## Scenarios', ...task.scenarios.map((entry) => `- ${entry}`));
  }
  return `${lines.join('\n')}\n`;
}

function configFor(spec: ChangeSpec): OsqConfig {
  return spec.config ?? defineConfig({});
}

describe('approval notices', () => {
  let projectRoot: string;
  let counter = 0;

  beforeEach(async () => {
    projectRoot = await createProject();
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  async function make(spec: ChangeSpec): Promise<string> {
    counter += 1;
    const change = await createChange(projectRoot, `Notices Fixture ${counter}`);
    const folder = change.folderPath;
    await fs.rm(path.join(folder, 'tasks'), { recursive: true, force: true });
    await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(folder, 'proposal.md'), proposalContent(spec), 'utf8');
    for (const task of spec.tasks) {
      await fs.writeFile(
        path.join(folder, 'tasks', `${task.number}.md`),
        taskContent(task),
        'utf8',
      );
    }
    for (const file of spec.files ?? []) {
      const full = path.join(projectRoot, file);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, '// fixture\n', 'utf8');
    }
    for (const delta of spec.deltas ?? []) {
      const dir = path.join(folder, 'specs', delta.capability);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'spec.md'), delta.content, 'utf8');
    }
    return folder;
  }

  async function noticesFor(spec: ChangeSpec) {
    const folder = await make(spec);
    const config = configFor(spec);
    const digest = await buildApprovalDigest(projectRoot, folder, config);
    return buildApprovalNotices(projectRoot, folder, config, digest);
  }

  describe('each rule fires on its own', () => {
    const cases: ReadonlyArray<{
      readonly name: string;
      readonly spec: ChangeSpec;
      readonly id: string;
      readonly severity: string;
      readonly label: string;
    }> = [
      {
        name: 'rules_path from PLANNER.md',
        spec: { tasks: [{ number: '1', scope: ['PLANNER.md'] }, { number: '2' }] },
        id: 'rules_path',
        severity: 'red',
        label: "scope reaches osq's rules",
      },
      {
        name: 'rules_path from the decisions folder',
        spec: { tasks: [{ number: '1' }, { number: '2', scope: ['decisions/'] }] },
        id: 'rules_path',
        severity: 'red',
        label: "scope reaches osq's rules",
      },
      {
        name: 'removed_requirement',
        spec: {
          tasks: BASE_TASKS,
          deltas: [{ capability: 'alpha', content: REMOVED_DELTA }],
        },
        id: 'removed_requirement',
        severity: 'red',
        label: 'removes requirements',
      },
      {
        name: 'adr_departure',
        spec: {
          tasks: BASE_TASKS,
          decisions: '- Departs from ADR 001: the loader needs a second engine.',
        },
        id: 'adr_departure',
        severity: 'red',
        label: 'departs from an ADR',
      },
      {
        name: 'many_tasks',
        spec: {
          tasks: Array.from({ length: 7 }, (_, index) => ({
            number: String(index + 1),
            scope: ['src/one.ts'],
          })),
        },
        id: 'many_tasks',
        severity: 'amber',
        label: '7 tasks',
      },
      {
        name: 'large_scope',
        spec: {
          tasks: [{ number: '1', scope: ['src/many/**'] }, { number: '2' }],
          files: Array.from({ length: 16 }, (_, index) => `src/many/f${index}.ts`),
        },
        id: 'large_scope',
        severity: 'amber',
        label: 'large task scope',
      },
      {
        name: 'package_json',
        spec: {
          tasks: [{ number: '1' }, { number: '2', scope: ['packages/ui/package.json'] }],
          files: ['packages/ui/package.json'],
        },
        id: 'package_json',
        severity: 'amber',
        label: 'package.json in scope',
      },
      {
        name: 'assumptions',
        spec: { tasks: BASE_TASKS, assumptions: '- first\n- second' },
        id: 'assumptions',
        severity: 'amber',
        label: '2 assumptions',
      },
      {
        name: 'verify_starts_any',
        spec: { tasks: [{ number: '1' }, { number: '2', verifyStarts: 'any' }] },
        id: 'verify_starts_any',
        severity: 'amber',
        label: 'verify_starts: any',
      },
      {
        name: 'uncovered_requirement',
        spec: {
          tasks: BASE_TASKS,
          deltas: [{ capability: 'alpha', content: UNCOVERED_DELTA }],
          config: defineConfig({ traceability: { capabilities: ['alpha'] } }),
        },
        id: 'uncovered_requirement',
        severity: 'amber',
        label: "requirements no task's tests cover",
      },
      {
        name: 'tests_modify',
        spec: {
          tasks: [
            { number: '1', scope: ['tests/one.test.ts'], testsModify: true },
            { number: '2' },
          ],
          files: ['tests/one.test.ts'],
        },
        id: 'tests_modify',
        severity: 'grey',
        label: 'tests.modify',
      },
      {
        name: 'new_capability',
        spec: {
          tasks: BASE_TASKS,
          deltas: [{ capability: 'beta', content: CREATED_DELTA }],
        },
        id: 'new_capability',
        severity: 'grey',
        label: 'new capability',
      },
    ];

    for (const testCase of cases) {
      it(`fires ${testCase.name} alone`, async () => {
        const notices = await noticesFor(testCase.spec);

        assert.equal(notices.notices.length, 1, JSON.stringify(notices.notices));
        assert.equal(notices.notices[0].id, testCase.id);
        assert.equal(notices.notices[0].severity, testCase.severity);
        assert.equal(notices.notices[0].label, testCase.label);
      });
    }

    it('fires plan_revised for two records with different hashes', async () => {
      const folder = await make({ tasks: BASE_TASKS });
      const current = await hashChangeFolder(folder);
      await appendPlanReady(folder, 'sha256:first', []);
      await appendPlanReady(folder, current, []);

      const config = configFor({ tasks: BASE_TASKS });
      const digest = await buildApprovalDigest(projectRoot, folder, config);
      const notices = await buildApprovalNotices(projectRoot, folder, config, digest);

      assert.equal(notices.notices.length, 1, JSON.stringify(notices.notices));
      assert.equal(notices.notices[0].id, 'plan_revised');
      assert.equal(notices.notices[0].severity, 'grey');
      assert.equal(notices.notices[0].label, 'plan revised 1 time');
      assert.equal(notices.notices[0].detail, 'since osq first recorded it ready');
    });
  });

  it('fires nothing for a plain two-task change', async () => {
    const notices = await noticesFor({ tasks: BASE_TASKS });
    assert.deepEqual(notices.notices, []);
    assert.equal(notices.unusual, false);
  });

  it('does not fire uncovered_requirement when a task lists the scenario', async () => {
    const notices = await noticesFor({
      tasks: [{ number: '1' }, { number: '2', scenarios: ['alpha: Bulk price'] }],
      deltas: [{ capability: 'alpha', content: UNCOVERED_DELTA }],
      config: defineConfig({ traceability: { capabilities: ['alpha'] } }),
    });
    assert.deepEqual(notices.notices, []);
  });

  describe('notice order and folding', () => {
    it('orders seven notices and folds the rest', async () => {
      const spec: ChangeSpec = {
        assumptions: '- first\n- second',
        tasks: [
          { number: '1', scope: ['PLANNER.md'] },
          { number: '2', scope: ['packages/ui/package.json'] },
          { number: '3', scope: ['src/one.ts'], testsModify: true },
          { number: '4', scope: ['src/one.ts'] },
          { number: '5', scope: ['src/one.ts'] },
          { number: '6', scope: ['src/one.ts'] },
          { number: '7', scope: ['src/one.ts'] },
        ],
        files: ['packages/ui/package.json'],
        deltas: [
          { capability: 'alpha', content: REMOVED_DELTA },
          { capability: 'beta', content: CREATED_DELTA },
        ],
      };
      const notices = await noticesFor(spec);

      assert.equal(notices.maxShown, 5);
      assert.equal(notices.unusual, true);
      assert.deepEqual(
        notices.notices.map((notice) => notice.id),
        [
          'rules_path',
          'removed_requirement',
          'many_tasks',
          'package_json',
          'assumptions',
          'tests_modify',
          'new_capability',
        ],
      );

      const lines = formatApprovalNotices(notices);
      assert.equal(lines[0], 'Notices:');
      assert.equal(lines[1], "  RED scope reaches osq's rules \u2014 task 1: PLANNER.md");
      assert.equal(lines[2], '  RED removes requirements \u2014 alpha: Alpha one');
      assert.equal(lines[3], '  AMBER 7 tasks \u2014 more than notices.maxTasks (6)');
      assert.equal(
        lines[4],
        '  AMBER package.json in scope \u2014 task 2: packages/ui/package.json',
      );
      assert.equal(lines[5], '  AMBER 2 assumptions \u2014 first; second');
      assert.equal(lines[6], '  2 more: tests.modify, new capability');
      assert.equal(lines.length, 7);
    });

    it('reports nothing unusual for a grey-only change', async () => {
      const notices = await noticesFor({
        tasks: BASE_TASKS,
        deltas: [{ capability: 'beta', content: CREATED_DELTA }],
      });

      assert.equal(notices.unusual, false);
      assert.equal(notices.notices.length, 1);
      assert.deepEqual(formatApprovalNotices(notices), [
        'Notices: Nothing unusual',
        '  GREY new capability \u2014 beta',
      ]);
    });
  });
});

describe('plan ready records', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-ready-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('counts zero without a record', () => {
    assert.equal(countPlanRevisions([], 'sha256:any'), 0);
  });

  it('counts zero when the only record matches the current hash', async () => {
    await appendPlanReady(tmpDir, 'sha256:match', []);
    const records = await readPlanReady(tmpDir);
    assert.equal(countPlanRevisions(records, 'sha256:match'), 0);
  });

  it('counts one when the only record differs from the current hash', async () => {
    await appendPlanReady(tmpDir, 'sha256:old', []);
    const records = await readPlanReady(tmpDir);
    assert.equal(countPlanRevisions(records, 'sha256:new'), 1);
  });

  it('counts records after the first plus a differing last', async () => {
    await appendPlanReady(tmpDir, 'sha256:a', []);
    await appendPlanReady(tmpDir, 'sha256:b', []);
    const records = await readPlanReady(tmpDir);
    assert.equal(records.length, 2);
    assert.equal(countPlanRevisions(records, 'sha256:b'), 1);
    assert.equal(countPlanRevisions(records, 'sha256:c'), 2);
  });

  it('reads records in file order, skipping blank and malformed lines', async () => {
    const planPath = path.join(tmpDir, '.run', 'plan.jsonl');
    await fs.mkdir(path.dirname(planPath), { recursive: true });
    const good = JSON.stringify({
      type: 'plan_ready',
      timestamp: '2026-01-01T00:00:00.000Z',
      data: { hash: 'sha256:x', notices: [{ id: 'rules_path', severity: 'red', folded: false }] },
    });
    await fs.writeFile(planPath, `\nnot json\n${good}\n${JSON.stringify({ type: 'x' })}\n`, 'utf8');

    const records = await readPlanReady(tmpDir);
    assert.equal(records.length, 1);
    assert.equal(records[0].data.hash, 'sha256:x');
    assert.equal(records[0].data.notices.length, 1);
  });
});
