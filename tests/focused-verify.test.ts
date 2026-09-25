import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { MockAdapter } from '../src/harness/mock.js';
import { buildExecutorPrompt } from '../src/harness/prompt.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(REPO_ROOT, 'fixture', 'trace', 'pricing');
const TESTING_URL = pathToFileURL(path.join(REPO_ROOT, 'src', 'testing', 'index.ts')).href;
const TSX = import.meta.resolve('tsx');
const PASS_SCRIPT = 'process.exit(0);\n';
const SCENARIO = 'Volume discount tiers';
const TEST_FILE = 'tests/pricing-quote.test.ts';
const FAIL_LINE = `not ok 1 - Scenario: ${SCENARIO}`;

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    await fs.rm(roots.pop() ?? '', { recursive: true, force: true });
  }
});

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

interface Project {
  root: string;
  folder: string;
  config: OsqConfig;
}

const TASKS_MD = `# Tasks

- [ ] 1. When a focused run fails a collected scenario, the task dies
`;

const SCENARIO_TEST_SOURCE = [
  "import { scenario } from '@matteeh/osq/testing';",
  "import { quote } from '../src/pricing/quote.js';",
  `scenario('pricing', '${SCENARIO}', { covers: quote }, () => {});`,
  '',
].join('\n');

const QUOTE_SOURCE = [
  'export interface Quote { readonly unitPrice: number; }',
  'export function quote(quantity: number): Quote { return { unitPrice: quantity }; }',
  '',
].join('\n');

function proposal(): string {
  return `---
title: Focused verify
depends_on: []
verify: node pass.cjs
features:
  reads: []
---
## Goal

Exercise the focused scenario-test check.

## Surface

None.

## Decisions

None
`;
}

function taskMarkdown(): string {
  return [
    '---',
    'title: When a focused run fails a collected scenario, the task dies',
    'verify: node pass.cjs',
    `scope: ${JSON.stringify([TEST_FILE, 'src/pricing/quote.ts'])}`,
    'tests:',
    '  modify: true',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] the focused run decides the attempt',
    '',
  ].join('\n');
}

function configWith(focusedTests?: string): OsqConfig {
  return {
    ...DEFAULT_CONFIG,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
    traceability: {
      capabilities: ['pricing'],
      mode: 'warn',
      ...(focusedTests === undefined ? {} : { focusedTests }),
    },
  };
}

/** Adapter that writes its result file and nothing else. */
class ResultAdapter implements HarnessAdapter {
  readonly name = 'result';

  async setup(_projectRoot: string, _config: OsqConfig): Promise<void> {}

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

async function readEvents(folder: string, taskNumber = '1'): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(folder, '.run', 'events', `${taskNumber}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as ParsedEvent);
}

function indexOfEvent(events: readonly ParsedEvent[], type: string, postSpawn = false): number {
  return events.findIndex(
    (event) =>
      event.type === type &&
      (!postSpawn || (event.type === 'verify_ran' && event.data?.phase !== 'pre_spawn')),
  );
}

/** Write the change artifacts a focused run needs and approve them. */
async function prepareChange(root: string, config: OsqConfig): Promise<string> {
  const folder = path.join(root, 'openspec', 'changes', '001-focused-verify');
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), proposal(), 'utf8');
  await fs.writeFile(path.join(folder, 'tasks.md'), TASKS_MD, 'utf8');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), taskMarkdown(), 'utf8');
  await approveSpec(root, '001', config);
  return folder;
}

/** Scaffold a project with a scoped scenario test and a fake focused command. */
async function setupProject(tap: string, focusedTests?: string): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-focused-verify-'));
  roots.push(root);
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'pass.cjs'), PASS_SCRIPT, 'utf8');
  await fs.writeFile(path.join(root, 'tap.cjs'), tap, 'utf8');
  await fs.mkdir(path.join(root, 'tests'), { recursive: true });
  await fs.writeFile(path.join(root, TEST_FILE), SCENARIO_TEST_SOURCE, 'utf8');
  await fs.mkdir(path.join(root, 'src', 'pricing'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'pricing', 'quote.ts'), QUOTE_SOURCE, 'utf8');

  const config = configWith(focusedTests);
  const folder = await prepareChange(root, config);
  return { root, folder, config };
}

function focusedEvent(events: readonly ParsedEvent[]): ParsedEvent | undefined {
  return events.find((event) => event.type === 'focused_ran');
}

describe('focused failure ends the attempt through runTask', () => {
  it('runs the focused files and goes on to the verify when the run passes', async () => {
    const project = await setupProject(
      `console.log('ok 1 - Scenario: ${SCENARIO}');\n`,
      'node tap.cjs {files}',
    );

    const result = await runTask(
      project.root,
      project.folder,
      '1',
      project.config,
      new ResultAdapter(),
    );

    assert.equal(result.success, true);
    const events = await readEvents(project.folder);
    const focused = focusedEvent(events);
    assert.equal(focused?.data?.outcome, 'passed');
    assert.deepEqual(focused?.data?.files, [TEST_FILE]);
    assert.deepEqual(focused?.data?.scenarios, [`pricing: ${SCENARIO}`]);
    assert.equal(focused?.data?.command, `node tap.cjs '${TEST_FILE}'`);
    assert.equal(focused?.data?.exitCode, 0);
    assert.equal(focused?.data?.timedOut, false);
    assert.equal(typeof focused?.data?.duration, 'number');
    assert.match(String(focused?.data?.output), /ok 1 - Scenario: Volume discount tiers/);

    const focusedIndex = indexOfEvent(events, 'focused_ran');
    const verifyIndex = indexOfEvent(events, 'verify_ran', true);
    assert.ok(focusedIndex >= 0, 'the focused event is appended');
    assert.ok(verifyIndex > focusedIndex, 'the verify follows the focused run');
  });

  it('kills the task with verify_red and skips the verify when a scenario fails', async () => {
    const project = await setupProject(`console.log('${FAIL_LINE}');\n`, 'node tap.cjs {files}');

    const result = await runTask(
      project.root,
      project.folder,
      '1',
      project.config,
      new ResultAdapter(),
    );

    assert.equal(result.success, false);
    assert.equal(result.reason, 'verify_red');

    const events = await readEvents(project.folder);
    const focusedIndex = indexOfEvent(events, 'focused_ran');
    const deadIndex = indexOfEvent(events, 'dead');
    assert.equal(focusedEvent(events)?.data?.outcome, 'failed');
    assert.ok(focusedIndex >= 0 && deadIndex > focusedIndex, 'the death follows the focused event');
    assert.equal(
      events.some((event) => event.type === 'verify_ran' && event.data?.phase !== 'pre_spawn'),
      false,
      'the task verify must not run',
    );

    const marker = await fs.readFile(path.join(project.folder, '.run', 'dead', '1.md'), 'utf8');
    assert.match(marker, /^reason: verify_red$/m);
    assert.match(marker, /^focused: true$/m);
    assert.match(marker, /^command: "node tap\.cjs 'tests\/pricing-quote\.test\.ts'"$/m);
    assert.match(marker, /Watcher focused scenario tests failed:/);
    assert.match(marker, /not ok 1 - Scenario: Volume discount tiers/);
  });

  it('records a broken focused command as a problem and lets the verify decide', async () => {
    const project = await setupProject('', 'node missing-runner.js {files}');

    const result = await runTask(
      project.root,
      project.folder,
      '1',
      project.config,
      new ResultAdapter(),
    );

    assert.equal(result.success, true);
    const events = await readEvents(project.folder);
    const focused = focusedEvent(events);
    assert.equal(focused?.data?.outcome, 'problem');
    assert.notEqual(focused?.data?.exitCode, 0);
    assert.ok(
      events.some((event) => event.type === 'verify_ran' && event.data?.phase !== 'pre_spawn'),
      'the verify still runs',
    );
    assert.ok(events.some((event) => event.type === 'done'));
  });

  it('appends no focused event when the command is unset', async () => {
    const project = await setupProject('', undefined);

    const result = await runTask(
      project.root,
      project.folder,
      '1',
      project.config,
      new ResultAdapter(),
    );

    assert.equal(result.success, true);
    const events = await readEvents(project.folder);
    assert.equal(
      events.some((event) => event.type === 'focused_ran'),
      false,
    );
    assert.ok(
      events.some((event) => event.type === 'verify_ran' && event.data?.phase !== 'pre_spawn'),
    );
  });
});

/** Mock adapter that repairs the fake focused command on its retry. */
class RetryingAdapter extends MockAdapter {
  readonly spawns: SpawnTaskOptions[] = [];

  override async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.spawns.push(options);
    if (options.attempt === 2) {
      await fs.writeFile(
        path.join(options.projectRoot, 'tap.cjs'),
        `console.log('ok 1 - Scenario: ${SCENARIO}');\n`,
        'utf8',
      );
    }
    return super.spawn(options);
  }
}

describe('focused failure through the watcher loop', () => {
  it('retries automatically and the next prompt carries the focused output', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-focused-verify-loop-'));
    roots.push(root);
    await installFakeValidator(root);
    await scaffoldProject(root);
    await fs.writeFile(path.join(root, 'pass.cjs'), PASS_SCRIPT, 'utf8');
    await fs.writeFile(path.join(root, 'tap.cjs'), `console.log('${FAIL_LINE}');\n`, 'utf8');
    await fs.mkdir(path.join(root, 'tests'), { recursive: true });
    await fs.writeFile(path.join(root, TEST_FILE), SCENARIO_TEST_SOURCE, 'utf8');
    await fs.mkdir(path.join(root, 'src', 'pricing'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'pricing', 'quote.ts'), QUOTE_SOURCE, 'utf8');

    const spec = await createNewSpec(root, 'Focused Verify Loop');
    await fs.writeFile(path.join(spec.folderPath, 'tasks', '1.md'), taskMarkdown(), 'utf8');
    const proposalPath = path.join(spec.folderPath, 'proposal.md');
    const content = await fs.readFile(proposalPath, 'utf8');
    await fs.writeFile(
      proposalPath,
      content.replace(/^verify:.*$/m, 'verify: node pass.cjs'),
      'utf8',
    );

    const config = configWith('node tap.cjs {files}');
    await approveSpec(root, '001', config);
    const adapter = new RetryingAdapter();

    const summary = await runWatcherOnce(root, config, adapter, undefined);

    assert.equal(summary.retried, 1);
    assert.equal(summary.tasksRun, 2);
    assert.equal(adapter.spawns.length, 2);
    const retrySpawn = adapter.spawns[1];
    assert.equal(retrySpawn?.attempt, 2);
    assert.equal(retrySpawn?.priorFailureReason, 'verify_red');
    assert.match(retrySpawn?.priorFailureOutput ?? '', /Watcher focused scenario tests failed:/);
    assert.match(
      retrySpawn?.priorFailureOutput ?? '',
      /not ok 1 - Scenario: Volume discount tiers/,
    );
    assert.match(
      buildExecutorPrompt(retrySpawn as SpawnTaskOptions),
      /not ok 1 - Scenario: Volume discount tiers/,
    );
  });
});

/** Copy the pricing fixture and rewrite the helper import for the runtime. */
async function setupFixtureProject(broken: boolean): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-focused-verify-tap-'));
  await fs.rm(root, { recursive: true, force: true });
  await fs.cp(FIXTURE, root, { recursive: true });
  roots.push(root);

  const testPath = path.join(root, TEST_FILE);
  const testSource = await fs.readFile(testPath, 'utf8');
  await fs.writeFile(
    testPath,
    testSource.replace(
      "import { scenario } from '@matteeh/osq/testing';",
      `// The scenario index reads this literal: from '@matteeh/osq/testing'.\nimport { scenario } from '${TESTING_URL}';`,
    ),
    'utf8',
  );
  if (broken) {
    const quotePath = path.join(root, 'src', 'pricing', 'quote.ts');
    const quoteSource = await fs.readFile(quotePath, 'utf8');
    await fs.writeFile(quotePath, quoteSource.replace('quantity >= 100', 'quantity > 100'), 'utf8');
  }

  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'pass.cjs'), PASS_SCRIPT, 'utf8');

  const config = configWith(`node --import ${TSX} --test --test-reporter=tap {files}`);
  const folder = await prepareChange(root, config);
  return { root, folder, config };
}

/** Run `fn` with the outer test runner's context cleared so the child really runs. */
async function withoutNodeTestContext<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.NODE_TEST_CONTEXT;
  Reflect.deleteProperty(process.env, 'NODE_TEST_CONTEXT');
  try {
    return await fn();
  } finally {
    if (previous !== undefined) process.env.NODE_TEST_CONTEXT = previous;
  }
}

describe('real TAP focused run of the pricing fixture', () => {
  it('ends on the focused run when the tier boundary moved', { timeout: 120_000 }, async () => {
    const project = await setupFixtureProject(true);

    const result = await withoutNodeTestContext(() =>
      runTask(project.root, project.folder, '1', project.config, new ResultAdapter()),
    );

    assert.equal(result.success, false);
    assert.equal(result.reason, 'verify_red');
    const events = await readEvents(project.folder);
    const focused = focusedEvent(events);
    assert.equal(focused?.data?.outcome, 'failed');
    assert.match(String(focused?.data?.output), /not ok 1 - Scenario: Volume discount tiers/);
    assert.equal(
      events.some((event) => event.type === 'verify_ran' && event.data?.phase !== 'pre_spawn'),
      false,
      'the full verify must not run',
    );
    const marker = await fs.readFile(path.join(project.folder, '.run', 'dead', '1.md'), 'utf8');
    assert.match(marker, /^focused: true$/m);
    assert.match(marker, /not ok 1 - Scenario: Volume discount tiers/);
  });

  it('passes the intact fixture on its focused run', { timeout: 120_000 }, async () => {
    const project = await setupFixtureProject(false);

    const result = await withoutNodeTestContext(() =>
      runTask(project.root, project.folder, '1', project.config, new ResultAdapter()),
    );

    assert.equal(result.success, true);
    const focused = focusedEvent(await readEvents(project.folder));
    assert.equal(focused?.data?.outcome, 'passed');
    assert.deepEqual(focused?.data?.files, [TEST_FILE]);
    assert.deepEqual(focused?.data?.scenarios, [
      'pricing: A percentage code comes off the tiered subtotal',
      `pricing: ${SCENARIO}`,
    ]);
  });
});
