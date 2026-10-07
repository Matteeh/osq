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

const TASKS_MD = [
  '# Tasks',
  '',
  '- [ ] 1. Change verify reruns when failures are unrelated',
  '',
].join('\n');

function proposalFor(verify: string): string {
  return [
    '---',
    'title: Change verify rerun',
    'depends_on: []',
    `verify: ${verify}`,
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    '',
    'Exercise the change-level verify rerun.',
    '',
    '## Surface',
    '',
    'None.',
    '',
  ].join('\n');
}

interface ScriptOptions {
  /** The 1-based runs that print a failing-tests section (or `message`) and exit 1. */
  failRuns: number;
  /** The failing test paths the section names. */
  tests: string[];
  /** When set, fail with this single line instead of a failing-tests section. */
  message?: string;
  /** Keep the process alive this long before failing, for the timeout case. */
  waitMs?: number;
}

/** The console.error lines that print a script's failure. */
function failLines(options: ScriptOptions, indent: string): string[] {
  if (options.message !== undefined) {
    return [`${indent}console.error(${JSON.stringify(options.message)});`];
  }
  const lines = [`${indent}console.error('${PREFIX}');`];
  for (const test of options.tests) {
    lines.push(`${indent}console.error(${JSON.stringify(`test at ${test}:1:1`)});`);
  }
  return lines;
}

/**
 * Build the change-level verify script from an array of lines joined with a
 * newline. It counts its runs in `change-verify-count.txt` and either fails
 * (printing the needed failing-tests section) or passes.
 */
function changeVerifyScript(options: ScriptOptions): string {
  const lines = [
    "const fs = require('node:fs');",
    "const stateFile = 'change-verify-count.txt';",
    'let n = 0;',
    "try { n = parseInt(fs.readFileSync(stateFile, 'utf8'), 10) || 0; } catch {}",
    'n += 1;',
    'fs.writeFileSync(stateFile, String(n));',
  ];
  if (options.waitMs !== undefined) {
    lines.push('setTimeout(() => {');
    lines.push(...failLines(options, '  '));
    lines.push('  process.exit(1);');
    lines.push(`}, ${options.waitMs});`);
  } else {
    lines.push(`if (n <= ${options.failRuns}) {`);
    lines.push(...failLines(options, '  '));
    lines.push('  process.exit(1);');
    lines.push('}');
    lines.push('process.exit(0);');
  }
  return lines.join('\n');
}

/** Adapter that performs an optional mutation, then writes a result file. */
class ResultAdapter implements HarnessAdapter {
  readonly name = 'result';

  constructor(private readonly mutate?: (projectRoot: string) => Promise<void>) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await this.mutate?.(options.projectRoot);
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

interface TaskOptions {
  scope?: string[];
  testsModify?: boolean;
}

async function writeTask(specFolder: string, options: TaskOptions = {}): Promise<void> {
  const lines = [
    '---',
    'title: Change verify reruns when failures are unrelated',
    'verify: node verify.cjs',
    `scope: [${(options.scope ?? []).join(', ')}]`,
    'entry: []',
    'skills: []',
  ];
  if (options.testsModify) {
    lines.push('tests:', '  modify: true');
  }
  lines.push('---', '## Acceptance', '- [ ] rerun is observed');
  await fs.writeFile(path.join(specFolder, 'tasks', '1.md'), `${lines.join('\n')}\n`, 'utf8');
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

function changeVerifies(events: ParsedEvent[]): ParsedEvent[] {
  return events.filter((event) => event.type === 'verify_ran' && event.data?.phase !== 'pre_spawn');
}

function rerunEvents(events: ParsedEvent[]): ParsedEvent[] {
  return events.filter((event) => event.type === 'change_verify_rerun');
}

describe('Change verify rerun after unrelated failures', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-change-verify-rerun-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  /** Scaffold one temporary project and seal its one-task change. */
  async function prepare(options: {
    script: ScriptOptions;
    taskScope?: string[];
    testsModify?: boolean;
    reruns?: number;
    verifyTimeoutSeconds?: number;
  }): Promise<{ specFolder: string; config: OsqConfig }> {
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
    await fs.writeFile(
      path.join(tmpDir, 'change-verify.cjs'),
      changeVerifyScript(options.script),
      'utf8',
    );

    const fixtures: Record<string, string> = {
      'tests/other.test.ts': '// other\n',
      'tests/scoped.test.ts': '// scoped\n',
      'tests/changed.test.ts': '// changed\n',
      'tests/importer.test.ts': "import './helper.js';\n",
      'tests/helper.ts': "import '../src/scoped.js';\n",
      'src/outside.test.ts': '// outside\n',
      'src/scoped.ts': 'export const scoped = 1;\n',
    };
    for (const [relative, content] of Object.entries(fixtures)) {
      const full = path.join(tmpDir, relative);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, 'utf8');
    }

    const specFolder = path.join(tmpDir, 'openspec', 'changes', '001-change-verify-rerun');
    await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
    await fs.writeFile(
      path.join(specFolder, 'proposal.md'),
      proposalFor('node change-verify.cjs'),
      'utf8',
    );
    await fs.writeFile(path.join(specFolder, 'tasks.md'), TASKS_MD, 'utf8');
    await writeTask(specFolder, { scope: options.taskScope, testsModify: options.testsModify });

    const config = defineConfig({
      gates: { preSpawnVerify: 'off', autoRetries: 0, changeVerifyReruns: options.reruns ?? 1 },
      ...(options.verifyTimeoutSeconds !== undefined
        ? { timeouts: { verifyTimeoutSeconds: options.verifyTimeoutSeconds } }
        : {}),
    });
    await approveSpec(tmpDir, '001', config);
    return { specFolder, config };
  }

  it('reruns an unrelated failure that passes, records rerun 1, and reaches done', async () => {
    const { specFolder, config } = await prepare({
      script: { failRuns: 1, tests: ['tests/other.test.ts'] },
    });

    const result = await runTask(tmpDir, specFolder, '1', config, new ResultAdapter());
    assert.equal(result.success, true);

    const taskEvents = await readEvents(specFolder, '1');
    const reruns = rerunEvents(taskEvents);
    assert.equal(reruns.length, 1);
    assert.deepEqual(reruns[0].data, {
      rerun: 1,
      tests: ['tests/other.test.ts'],
      passed: true,
    });
    assert.equal(changeVerifies(await readEvents(specFolder, 'change')).length, 2);
  });

  it('kills the task with change_verify_red when the rerun fails too', async () => {
    const { specFolder, config } = await prepare({
      script: { failRuns: 5, tests: ['tests/other.test.ts'] },
    });

    const result = await runTask(tmpDir, specFolder, '1', config, new ResultAdapter());
    assert.equal(result.success, false);
    assert.equal(result.reason, 'change_verify_red');

    const reruns = rerunEvents(await readEvents(specFolder, '1'));
    assert.equal(reruns.length, 1);
    assert.deepEqual(reruns[0].data, {
      rerun: 1,
      tests: ['tests/other.test.ts'],
      passed: false,
    });

    const marker = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.match(marker, /reason: change_verify_red/);
    assert.match(marker, /✖ failing tests:/);
    assert.match(marker, /test at tests\/other\.test\.ts:1:1/);
  });

  it('does not rerun a failure whose test imports a scoped file through another file', async () => {
    const { specFolder, config } = await prepare({
      script: { failRuns: 5, tests: ['tests/importer.test.ts'] },
      taskScope: ['src/scoped.ts'],
    });

    const result = await runTask(tmpDir, specFolder, '1', config, new ResultAdapter());
    await assertNoRerun(result, specFolder);
  });

  it('does not rerun a failure whose test is in the task scope', async () => {
    const { specFolder, config } = await prepare({
      script: { failRuns: 5, tests: ['tests/scoped.test.ts'] },
      taskScope: ['tests/scoped.test.ts'],
      testsModify: true,
    });

    const result = await runTask(tmpDir, specFolder, '1', config, new ResultAdapter());
    await assertNoRerun(result, specFolder);
  });

  it('does not rerun a failure the agent created', async () => {
    const { specFolder, config } = await prepare({
      script: { failRuns: 5, tests: ['tests/created.test.ts'] },
    });

    const adapter = new ResultAdapter(async (projectRoot) => {
      await fs.writeFile(
        path.join(projectRoot, 'tests', 'created.test.ts'),
        '// created\n',
        'utf8',
      );
    });
    const result = await runTask(tmpDir, specFolder, '1', config, adapter);
    await assertNoRerun(result, specFolder);
  });

  it('does not rerun a failure the agent changed', async () => {
    const { specFolder, config } = await prepare({
      script: { failRuns: 5, tests: ['tests/changed.test.ts'] },
      taskScope: ['tests/changed.test.ts'],
      testsModify: true,
    });

    const adapter = new ResultAdapter(async (projectRoot) => {
      await fs.writeFile(
        path.join(projectRoot, 'tests', 'changed.test.ts'),
        '// changed by the agent\n',
        'utf8',
      );
    });
    const result = await runTask(tmpDir, specFolder, '1', config, adapter);
    await assertNoRerun(result, specFolder);
  });

  it('does not rerun a failure outside tests', async () => {
    const { specFolder, config } = await prepare({
      script: { failRuns: 5, tests: ['src/outside.test.ts'] },
    });

    const result = await runTask(tmpDir, specFolder, '1', config, new ResultAdapter());
    await assertNoRerun(result, specFolder);
  });

  it('does not rerun when one of two failing tests imports a scoped file', async () => {
    const { specFolder, config } = await prepare({
      script: { failRuns: 5, tests: ['tests/other.test.ts', 'tests/importer.test.ts'] },
      taskScope: ['src/scoped.ts'],
    });

    const result = await runTask(tmpDir, specFolder, '1', config, new ResultAdapter());
    await assertNoRerun(result, specFolder);
  });

  it('does not rerun when the output names no failing test', async () => {
    const { specFolder, config } = await prepare({
      script: { failRuns: 5, tests: [], message: 'change verify exploded' },
    });

    const result = await runTask(tmpDir, specFolder, '1', config, new ResultAdapter());
    await assertNoRerun(result, specFolder);
  });

  it('does not rerun a run that timed out', async () => {
    const { specFolder, config } = await prepare({
      script: { failRuns: 5, tests: ['tests/other.test.ts'], waitMs: 8000 },
      verifyTimeoutSeconds: 2,
    });

    const result = await runTask(tmpDir, specFolder, '1', config, new ResultAdapter());
    await assertNoRerun(result, specFolder);
  });

  it('turns reruns off with changeVerifyReruns 0', async () => {
    const { specFolder, config } = await prepare({
      script: { failRuns: 5, tests: ['tests/other.test.ts'] },
      reruns: 0,
    });

    const result = await runTask(tmpDir, specFolder, '1', config, new ResultAdapter());
    await assertNoRerun(result, specFolder);
  });

  it('spends two reruns when changeVerifyReruns is 2', async () => {
    const { specFolder, config } = await prepare({
      script: { failRuns: 2, tests: ['tests/other.test.ts'] },
      reruns: 2,
    });

    const result = await runTask(tmpDir, specFolder, '1', config, new ResultAdapter());
    assert.equal(result.success, true);

    const reruns = rerunEvents(await readEvents(specFolder, '1'));
    assert.equal(reruns.length, 2);
    assert.deepEqual(reruns[0].data, {
      rerun: 1,
      tests: ['tests/other.test.ts'],
      passed: false,
    });
    assert.deepEqual(reruns[1].data, {
      rerun: 2,
      tests: ['tests/other.test.ts'],
      passed: true,
    });
    assert.equal(changeVerifies(await readEvents(specFolder, 'change')).length, 3);
  });

  /** The no-rerun shape: today's single red change verify, with no rerun event. */
  async function assertNoRerun(
    result: { success: boolean; reason?: string },
    specFolder: string,
  ): Promise<void> {
    assert.equal(result.success, false);
    assert.equal(result.reason, 'change_verify_red');
    assert.equal(rerunEvents(await readEvents(specFolder, '1')).length, 0);
    assert.equal(changeVerifies(await readEvents(specFolder, 'change')).length, 1);
  }
});
