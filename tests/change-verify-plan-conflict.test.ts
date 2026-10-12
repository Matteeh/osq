import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

const LOCAL_VERIFIER = [
  "const fs = require('node:fs');",
  "if (!fs.existsSync('openspec')) {",
  '  process.exit(1);',
  '}',
  'process.exit(0);',
  '',
].join('\n');

const PREFIX = '✖ failing tests:';

const TASKS_MD = ['# Tasks', '', '- [ ] 1. Earlier task', '- [ ] 2. Plan conflict', ''].join('\n');

const PROPOSAL = [
  '---',
  'title: Plan conflict on earlier done tasks',
  'depends_on: []',
  'verify: node change-verify.cjs',
  'features:',
  '  reads: []',
  '---',
  '## Goal',
  '',
  'Exercise the change-level plan conflict death.',
  '',
  '## Surface',
  '',
  'None.',
  '',
].join('\n');

/** A change-level verify that always exits 1, naming `tests` or `message`. */
function changeVerifySource(options: {
  tests: string[];
  message?: string;
  waitMs?: number;
}): string {
  const fail = (indent: string): string[] => {
    const lines: string[] = [];
    if (options.message !== undefined) {
      lines.push(`${indent}console.error(${JSON.stringify(options.message)});`);
    } else {
      lines.push(`${indent}console.error('${PREFIX}');`);
      for (const test of options.tests) {
        lines.push(`${indent}console.error(${JSON.stringify(`test at ${test}:1:1`)});`);
      }
    }
    lines.push(`${indent}process.exit(1);`);
    return lines;
  };
  const lines = ["const fs = require('node:fs');"];
  if (options.waitMs !== undefined) {
    lines.push('setTimeout(() => {', ...fail('  '), `}, ${options.waitMs});`);
  } else {
    lines.push(...fail(''));
  }
  return lines.join('\n');
}

/** Adapter that writes the result file the runner expects. */
class ResultAdapter implements HarnessAdapter {
  readonly name = 'result';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(
      path.join(resultsDir, `${options.taskNumber}.md`),
      '# Agent result\n',
      'utf8',
    );
    return { exitCode: 0 };
  }
}

interface TaskFileOptions {
  scope: string[];
  testsModify?: boolean;
}

async function writeTaskFile(
  specFolder: string,
  taskNumber: string,
  options: TaskFileOptions,
): Promise<void> {
  const lines = [
    '---',
    `title: Task ${taskNumber}`,
    'verify: node verify.cjs',
    `scope: [${options.scope.join(', ')}]`,
    'entry: []',
    'skills: []',
  ];
  if (options.testsModify) {
    lines.push('tests:', '  modify: true');
  }
  lines.push('---', '## Acceptance', '- [ ] observed');
  await fs.writeFile(
    path.join(specFolder, 'tasks', `${taskNumber}.md`),
    `${lines.join('\n')}\n`,
    'utf8',
  );
}

/** Scaffold change `007-plan-conflict` with task 1 in the row's state and task 2 pending. */
interface PrepareOptions {
  failingTests: string[];
  message?: string;
  waitMs?: number;
  task1Scope: string[];
  task1Touched?: string;
  task1Done: boolean;
  task2Scope: string[];
  task2TestsModify?: boolean;
  /** When set, task 0 is written with this scope, so it exists before approval. */
  task0Scope?: string[];
  verifyTimeoutSeconds?: number;
}

async function prepare(
  tmpDir: string,
  options: PrepareOptions,
): Promise<{ specFolder: string; config: OsqConfig }> {
  await installFakeValidator(tmpDir);
  await scaffoldProject(tmpDir);
  await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  await fs.writeFile(
    path.join(tmpDir, 'change-verify.cjs'),
    changeVerifySource({
      tests: options.failingTests,
      message: options.message,
      waitMs: options.waitMs,
    }),
    'utf8',
  );

  for (const file of ['tests/a.test.ts', 'tests/b.test.ts', 'tests/c.test.ts']) {
    const full = path.join(tmpDir, file);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, '// fixture\n', 'utf8');
  }
  const two = path.join(tmpDir, 'src', 'two.ts');
  await fs.mkdir(path.dirname(two), { recursive: true });
  await fs.writeFile(two, 'export const two = 2;\n', 'utf8');

  const specFolder = path.join(tmpDir, 'openspec', 'changes', '007-plan-conflict');
  await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(specFolder, 'proposal.md'), PROPOSAL, 'utf8');
  await fs.writeFile(path.join(specFolder, 'tasks.md'), TASKS_MD, 'utf8');
  await writeTaskFile(specFolder, '1', { scope: options.task1Scope, testsModify: true });
  await writeTaskFile(specFolder, '2', {
    scope: options.task2Scope,
    testsModify: options.task2TestsModify,
  });
  if (options.task0Scope !== undefined) {
    await writeTaskFile(specFolder, '0', {
      scope: options.task0Scope,
      testsModify: options.task0Scope.length > 0,
    });
  }

  const config = defineConfig({
    gates: { preSpawnVerify: 'off', autoRetries: 0, changeVerifyReruns: 0 },
    ...(options.verifyTimeoutSeconds !== undefined
      ? { timeouts: { verifyTimeoutSeconds: options.verifyTimeoutSeconds } }
      : {}),
  });
  await approveSpec(tmpDir, '007', config);

  if (options.task1Done) {
    await fs.mkdir(path.join(specFolder, '.run', 'done'), { recursive: true });
    await fs.writeFile(
      path.join(specFolder, '.run', 'done', '1'),
      `${new Date().toISOString()}\n`,
      'utf8',
    );
  }
  if (options.task1Touched !== undefined) {
    await fs.mkdir(path.join(specFolder, '.run', 'results'), { recursive: true });
    await fs.writeFile(
      path.join(specFolder, '.run', 'results', '1.md'),
      `# Result\n\nTouched: ${options.task1Touched}\n`,
      'utf8',
    );
  }
  return { specFolder, config };
}

async function readEvents(specFolder: string, target: string): Promise<ParsedEvent[]> {
  const eventFilePath = path.join(specFolder, '.run', 'events', `${target}.jsonl`);
  let raw = '';
  try {
    raw = await fs.readFile(eventFilePath, 'utf8');
  } catch {
    return [];
  }
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

interface RowCase {
  name: string;
  failingTests: string[];
  message?: string;
  waitMs?: number;
  task1Scope: string[];
  task1Touched?: string;
  task1Done: boolean;
  task2Scope: string[];
  task2TestsModify?: boolean;
  verifyTimeoutSeconds?: number;
  expectedReason: 'blocked' | 'change_verify_red';
}

const ROWS: RowCase[] = [
  {
    name: 'a failing test in task 1 scope',
    failingTests: ['tests/a.test.ts'],
    task1Scope: ['tests/a.test.ts'],
    task1Done: true,
    task2Scope: ['src/two.ts'],
    expectedReason: 'blocked',
  },
  {
    name: 'a failing test on task 1 Touched line only',
    failingTests: ['tests/b.test.ts'],
    task1Scope: [],
    task1Touched: 'tests/b.test.ts',
    task1Done: true,
    task2Scope: ['src/two.ts'],
    expectedReason: 'blocked',
  },
  {
    name: 'task 1 has no done marker',
    failingTests: ['tests/a.test.ts'],
    task1Scope: ['tests/a.test.ts'],
    task1Done: false,
    task2Scope: ['src/two.ts'],
    expectedReason: 'change_verify_red',
  },
  {
    name: 'one failing test owned, another by no task',
    failingTests: ['tests/a.test.ts', 'tests/c.test.ts'],
    task1Scope: ['tests/a.test.ts'],
    task1Done: true,
    task2Scope: ['src/two.ts'],
    expectedReason: 'change_verify_red',
  },
  {
    name: 'a failing test in task 1 and task 2 scope',
    failingTests: ['tests/a.test.ts'],
    task1Scope: ['tests/a.test.ts'],
    task1Done: true,
    task2Scope: ['src/two.ts', 'tests/a.test.ts'],
    task2TestsModify: true,
    expectedReason: 'change_verify_red',
  },
  {
    name: 'no failing-tests section in the output',
    failingTests: [],
    message: 'change verify exploded',
    task1Scope: ['tests/a.test.ts'],
    task1Done: true,
    task2Scope: ['src/two.ts'],
    expectedReason: 'change_verify_red',
  },
  {
    name: 'the run timed out',
    failingTests: ['tests/a.test.ts'],
    waitMs: 8000,
    task1Scope: ['tests/a.test.ts'],
    task1Done: true,
    task2Scope: ['src/two.ts'],
    verifyTimeoutSeconds: 2,
    expectedReason: 'change_verify_red',
  },
];

describe('Plan conflict at change verify', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-change-verify-plan-conflict-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  for (const row of ROWS) {
    it(`dies ${row.expectedReason} when ${row.name}`, async () => {
      const { specFolder, config } = await prepare(tmpDir, row);

      const result = await runTask(tmpDir, specFolder, '2', config, new ResultAdapter());
      assert.equal(result.success, false);
      assert.equal(result.reason, row.expectedReason);

      const marker = await fs.readFile(path.join(specFolder, '.run', 'dead', '2.md'), 'utf8');
      assert.match(marker, new RegExp(`reason: ${row.expectedReason}`));
      if (row.expectedReason === 'blocked') {
        assert.match(marker, /command: "node change-verify\.cjs"/);
        assert.match(marker, /Revise the plan with osq plan 007/);
      }
    });
  }

  it('records a blocked dead marker naming the test, its owner, and osq plan <id>', async () => {
    const { specFolder, config } = await prepare(tmpDir, {
      failingTests: ['tests/a.test.ts'],
      task1Scope: ['tests/a.test.ts'],
      task1Done: true,
      task2Scope: ['src/two.ts'],
    });

    const result = await runTask(tmpDir, specFolder, '2', config, new ResultAdapter());
    assert.equal(result.success, false);
    assert.equal(result.reason, 'blocked');

    const marker = await fs.readFile(path.join(specFolder, '.run', 'dead', '2.md'), 'utf8');
    const lines = marker.trimEnd().split('\n');
    assert.equal(lines[0], '---');
    assert.ok(lines.some((line) => line.startsWith('fingerprint: sha256:')));
    assert.ok(lines.includes('reason: blocked'));
    assert.ok(lines.includes('command: "node change-verify.cjs"'));
    assert.ok(lines.includes('exit_code: 1'));
    const ownerIndex = lines.indexOf('- tests/a.test.ts (task 1)');
    assert.ok(
      ownerIndex >
        lines.indexOf(
          'Change-level verification failed only on tests that earlier done tasks own, so this task conflicts with the plan:',
        ),
    );
    const planIndex = lines.indexOf('Revise the plan with osq plan 007, then approve it again.');
    assert.ok(planIndex > ownerIndex);
    const failingIndex = lines.findIndex((line) => line.includes('✖ failing tests:'));
    assert.ok(failingIndex > planIndex);
    const fullOutputIndex = lines.findIndex((line) =>
      line.startsWith('Full output: .run/logs/change-'),
    );
    assert.equal(fullOutputIndex, lines.length - 1);

    const events = await readEvents(specFolder, '2');
    const dead = events.filter((event) => event.type === 'dead');
    assert.equal(dead.length, 1);
    assert.equal(dead[0].data?.reason, 'blocked');
    assert.equal(dead[0].data?.task, '2');
  });

  it('keeps the lowest done task as the owner', async () => {
    const { specFolder, config } = await prepare(tmpDir, {
      failingTests: ['tests/a.test.ts'],
      task1Scope: ['tests/a.test.ts'],
      task1Done: true,
      task2Scope: ['src/two.ts'],
      task0Scope: ['tests/a.test.ts'],
    });

    // A second done task, numbered 0, also owns the failing test.
    await fs.writeFile(
      path.join(specFolder, '.run', 'done', '0'),
      `${new Date().toISOString()}\n`,
      'utf8',
    );

    const result = await runTask(tmpDir, specFolder, '2', config, new ResultAdapter());
    assert.equal(result.reason, 'blocked');
    const marker = await fs.readFile(path.join(specFolder, '.run', 'dead', '2.md'), 'utf8');
    assert.match(marker, /- tests\/a\.test\.ts \(task 0\)/);
  });
});
