import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_GATES_CONFIG, type GatesConfig } from '../src/core/foundation/config-gates.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
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

const PASS = 'process.exit(0);\n';
const NUMBERED_FAIL =
  "for (let i = 1; i <= 100; i += 1) console.log('line ' + i);\nprocess.exit(1);\n";
const FOCUSED_FAIL =
  "for (let i = 1; i <= 100; i += 1) console.log('line ' + i);\n" +
  "console.log('not ok 1 - Scenario: Excerpt scenario');\nprocess.exit(1);\n";
const SCENARIO_TEST =
  "import { scenario } from '@matteeh/osq/testing';\n" +
  "import { quote } from '../src/pricing/quote.js';\n" +
  "scenario('pricing', 'Excerpt scenario', { covers: quote }, () => {});\n";
const QUOTE =
  'export interface Quote { readonly unitPrice: number; }\n' +
  'export function quote(quantity: number): Quote { return { unitPrice: quantity }; }\n';
const TASKS_MD = '# Tasks\n\n- [ ] 1. Excerpt task\n';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

function proposalFor(verify: string): string {
  return `---\ntitle: Excerpt\ndepends_on: []\nverify: ${verify}\nfeatures:\n  reads: []\n---\n## Goal\n\nExercise the excerpt.\n\n## Surface\n\nNone.\n`;
}

function configWith(gates: Partial<GatesConfig>, trace?: OsqConfig['traceability']): OsqConfig {
  return {
    ...DEFAULT_CONFIG,
    gates: { ...DEFAULT_GATES_CONFIG, ...gates },
    ...(trace === undefined ? {} : { traceability: trace }),
  };
}

class ResultAdapter implements HarnessAdapter {
  readonly name = 'result';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(path.join(resultsDir, `${options.taskNumber}.md`), '# Result\n', 'utf8');
    return { exitCode: 0 };
  }
}

interface SetupOptions {
  proposalVerify: string;
  taskVerify: string;
  verifyStarts?: string;
  testsModify?: boolean;
  scope?: string[];
  config: OsqConfig;
  scenario?: boolean;
}

async function setup(options: SetupOptions): Promise<{ root: string; folder: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-dead-excerpt-'));
  roots.push(root);
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'pass.cjs'), PASS, 'utf8');
  await fs.writeFile(path.join(root, 'fail100.cjs'), NUMBERED_FAIL, 'utf8');
  await fs.writeFile(path.join(root, 'focused-fail.cjs'), FOCUSED_FAIL, 'utf8');

  if (options.scenario) {
    await fs.mkdir(path.join(root, 'tests'), { recursive: true });
    await fs.writeFile(path.join(root, 'tests', 'scenario.test.ts'), SCENARIO_TEST, 'utf8');
    await fs.mkdir(path.join(root, 'src', 'pricing'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'pricing', 'quote.ts'), QUOTE, 'utf8');
  }

  const folder = path.join(root, 'openspec', 'changes', '001-excerpt');
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), proposalFor(options.proposalVerify), 'utf8');
  await fs.writeFile(path.join(folder, 'tasks.md'), TASKS_MD, 'utf8');
  const lines = [
    '---',
    'title: Excerpt task',
    `verify: ${options.taskVerify}`,
    `scope: [${(options.scope ?? []).join(', ')}]`,
    'entry: []',
    'skills: []',
  ];
  if (options.verifyStarts) lines.push(`verify_starts: ${options.verifyStarts}`);
  if (options.testsModify) lines.push('tests:', '  modify: true');
  lines.push('---', '## Acceptance', '- [ ] excerpt decides');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), `${lines.join('\n')}\n`, 'utf8');
  await approveSpec(root, '001', options.config);
  return { root, folder };
}

async function readEvents(folder: string, target: string): Promise<ParsedEvent[]> {
  const filePath = path.join(folder, '.run', 'events', `${target}.jsonl`);
  const raw = await fs.readFile(filePath, 'utf8').catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as ParsedEvent);
}

async function readMarker(folder: string): Promise<string> {
  return fs.readFile(path.join(folder, '.run', 'dead', '1.md'), 'utf8');
}

function assertTrailingExcerpt(marker: string, source: string, firstLine = 61): void {
  const lines = marker.trimEnd().split('\n');
  assert.equal(lines.at(-1), `Full output: ${source}`);
  const excerpt = lines.slice(-41, -1);
  assert.equal(excerpt.length, 40);
  assert.equal(excerpt[0], `line ${firstLine}`);
  assert.equal(excerpt.at(-1), 'line 100');
}

/** The `log` of the last `verify_ran` event for `target`. */
async function logOf(folder: string, target: string): Promise<string> {
  const events = await readEvents(folder, target);
  const event = [...events].reverse().find((candidate) => candidate.type === 'verify_ran');
  return String(event?.data?.log ?? '');
}

/** Assert the marker points at `log` and excerpt the log holds all 100 lines. */
async function assertLogExcerpt(folder: string, target: string): Promise<void> {
  const marker = await readMarker(folder);
  const log = await logOf(folder, target);
  assertTrailingExcerpt(marker, log);
  const raw = await fs.readFile(path.join(folder, log), 'utf8');
  const all = raw.trimEnd().split('\n');
  assert.equal(all.length, 100);
  assert.equal(all[0], 'line 1');
  assert.equal(all.at(-1), 'line 100');
}

function outputOf(events: ParsedEvent[], type: string): string {
  return String(events.find((candidate) => candidate.type === type)?.data?.output ?? '');
}

describe('dead marker holds the verify excerpt', () => {
  it('keeps the task verify excerpt and points at the task event', async () => {
    const config = configWith({ preSpawnVerify: 'off', autoRetries: 0 });
    const { root, folder } = await setup({
      proposalVerify: 'node pass.cjs',
      taskVerify: 'node fail100.cjs',
      config,
    });

    const result = await runTask(root, folder, '1', config, new ResultAdapter());

    assert.equal(result.reason, 'verify_red');
    const marker = await readMarker(folder);
    assert.match(marker, /^reason: verify_red$/m);
    await assertLogExcerpt(folder, '1');
    assert.ok(!marker.includes('line 60'));
  });

  it('keeps the change verify excerpt and points at the change event', async () => {
    const config = configWith({ preSpawnVerify: 'off', autoRetries: 0 });
    const { root, folder } = await setup({
      proposalVerify: 'node fail100.cjs',
      taskVerify: 'node pass.cjs',
      config,
    });

    const result = await runTask(root, folder, '1', config, new ResultAdapter());

    assert.equal(result.reason, 'change_verify_red');
    const marker = await readMarker(folder);
    assert.match(marker, /^reason: change_verify_red$/m);
    await assertLogExcerpt(folder, 'change');
  });

  it('keeps the focused run excerpt and points at the focused event', async () => {
    const config = configWith(
      { preSpawnVerify: 'off', autoRetries: 0 },
      { capabilities: ['pricing'], mode: 'warn', focusedTests: 'node focused-fail.cjs {files}' },
    );
    const { root, folder } = await setup({
      proposalVerify: 'node pass.cjs',
      taskVerify: 'node pass.cjs',
      scope: ['tests/scenario.test.ts', 'src/pricing/quote.ts'],
      config,
      scenario: true,
      testsModify: true,
    });

    const result = await runTask(root, folder, '1', config, new ResultAdapter());

    assert.equal(result.reason, 'verify_red');
    const marker = await readMarker(folder);
    assert.match(marker, /^focused: true$/m);
    assert.match(marker, /Watcher focused scenario tests failed:/);
    assert.match(marker, /not ok 1 - Scenario: Excerpt scenario/);
    assert.ok(!marker.includes('line 1\n'));
    assert.ok(
      marker.trimEnd().endsWith('Full output: the focused_ran event in .run/events/1.jsonl'),
    );
    const output = outputOf(await readEvents(folder, '1'), 'focused_ran');
    assert.match(output, /line 1\n/);
    assert.match(output, /not ok 1 - Scenario: Excerpt scenario/);
  });

  it('keeps the red baseline output in the event and the excerpt in the marker', async () => {
    const config = configWith({
      preSpawnVerify: 'off',
      autoRetries: 0,
      baselineVerify: 'node fail100.cjs',
    });
    const { root, folder } = await setup({
      proposalVerify: 'node pass.cjs',
      taskVerify: 'node pass.cjs',
      config,
    });

    const result = await runTask(root, folder, '1', config, new ResultAdapter());

    assert.equal(result.reason, 'baseline_red');
    const marker = await readMarker(folder);
    assert.match(marker, /^reason: baseline_red$/m);
    assertTrailingExcerpt(marker, 'the baseline_ran event in .run/events/change.jsonl');

    const events = await readEvents(folder, 'change');
    const event = events.find((candidate) => candidate.type === 'baseline_ran');
    assert.equal(event?.data?.outcome, 'failed');
    assert.match(String(event?.data?.output), /line 1\n/);
    assert.match(String(event?.data?.output), /line 100/);
  });

  it('keeps the pre-spawn excerpt and points at the task event', async () => {
    const config = configWith({ preSpawnVerify: 'fail', autoRetries: 0 });
    const { root, folder } = await setup({
      proposalVerify: 'node pass.cjs',
      taskVerify: 'node fail100.cjs',
      verifyStarts: 'green',
      config,
    });

    const result = await runTask(root, folder, '1', config, new ResultAdapter());

    assert.equal(result.reason, 'verify_precondition');
    const marker = await readMarker(folder);
    assert.match(marker, /^reason: verify_precondition$/m);
    await assertLogExcerpt(folder, '1');
  });
});
