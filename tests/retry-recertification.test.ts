import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { retryCommand } from '../src/cli/retry.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { retrySpec } from '../src/core/lifecycle/retry.js';
import { buildScopeRegressionMarker, computeTaskScopeHash } from '../src/core/run/scope-hash.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';
import { deriveSpecState } from '../src/core/status/state.js';
import { buildAgyPrompt } from '../src/harness/agy/agy.js';
import { buildCodexPrompt } from '../src/harness/codex/codex-prompt.js';
import { MockAdapter } from '../src/harness/index.js';
import { buildOpencodePrompt } from '../src/harness/opencode/opencode.js';
import type { SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { readRetryContext } from '../src/watcher/attempt.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const PASSING = 'node recert.cjs';
const TIMEOUT = 'node recert-slow.cjs';

class RecordingAdapter extends MockAdapter {
  readonly spawns: SpawnTaskOptions[] = [];

  override async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.spawns.push(options);
    return super.spawn(options);
  }
}

const RECERT_SCRIPT = [
  "const fs = require('node:fs');",
  "fs.appendFileSync('recert-runs.log', 'run\\n');",
  "if (fs.existsSync('recert-fail')) {",
  "  console.error('recert-failed-output');",
  '  process.exit(4);',
  '}',
  "console.log('recert-passed-output');",
  '',
].join('\n');

const SLOW_SCRIPT = 'setTimeout(() => {}, 30000);\n';

interface Fixture {
  tmpDir: string;
  specFolder: string;
  runDir: string;
}

interface DoneOptions {
  scopeHash: string;
  scopeFiles: Record<string, string | null>;
  body: string;
  extra?: Record<string, string | number>;
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

async function readEvents(fixture: Fixture, target: string) {
  const raw = await fs
    .readFile(path.join(fixture.runDir, 'events', `${target}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string; data?: Record<string, unknown> });
}

async function writeTask(
  specFolder: string,
  number: number,
  verify: string,
  scope: string[],
): Promise<void> {
  const content = [
    '---',
    `title: Task ${number} recertification`,
    `verify: ${verify}`,
    'scope:',
    ...scope.map((entry) => `  - ${entry}`),
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    `- [ ] task ${number} is observable`,
    '',
  ].join('\n');
  await fs.writeFile(path.join(specFolder, 'tasks', `${number}.md`), content, 'utf8');
}

async function setup(options: { scope?: string[]; verify?: string } = {}): Promise<Fixture> {
  const scope = options.scope ?? ['src/a.ts'];
  const verify = options.verify ?? PASSING;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-retry-recert-'));
  await installFakeValidator(tmpDir);
  await scaffoldProject(tmpDir);
  await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
  for (const entry of scope) {
    await fs.writeFile(path.join(tmpDir, entry), 'export const value = 1;\n', 'utf8');
  }
  await fs.writeFile(path.join(tmpDir, 'recert.cjs'), RECERT_SCRIPT, 'utf8');
  await fs.writeFile(path.join(tmpDir, 'recert-slow.cjs'), SLOW_SCRIPT, 'utf8');

  const spec = await createNewSpec(tmpDir, 'Retry Recertification');
  const specFolder = spec.folderPath;
  await writeTask(specFolder, 1, verify, scope);
  const proposalPath = path.join(specFolder, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8');
  await fs.writeFile(proposalPath, proposal.replace(/^verify:.*$/m, `verify: ${verify}`), 'utf8');
  await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

  return { tmpDir, specFolder, runDir: path.join(specFolder, '.run') };
}

async function writeDone(
  fixture: Fixture,
  taskNumber: number,
  options: DoneOptions,
): Promise<void> {
  const lines = [
    '---',
    `scope_hash: ${JSON.stringify(options.scopeHash)}`,
    'build_stamp: "stamp-abc"',
    'exit_code: 0',
    `scope_files: ${JSON.stringify(options.scopeFiles)}`,
  ];
  for (const [key, value] of Object.entries(options.extra ?? {})) {
    lines.push(`${key}: ${typeof value === 'number' ? value : JSON.stringify(value)}`);
  }
  lines.push('---');
  await fs.mkdir(path.join(fixture.runDir, 'done'), { recursive: true });
  await fs.writeFile(
    path.join(fixture.runDir, 'done', String(taskNumber)),
    `${lines.join('\n')}\n${options.body}`,
    'utf8',
  );
}

async function markRegressed(
  fixture: Fixture,
  taskNumber: number,
  recordedHash: string,
  differingPath = 'src/a.ts',
): Promise<void> {
  const content = buildScopeRegressionMarker({
    taskNumber: String(taskNumber),
    differingPaths: [`${differingPath} (modified)`],
    attribution: [{ path: `${differingPath} (modified)`, attribution: 'unknown' }],
    recordedHash,
    currentHash: 'sha256:current',
    verifyCommand: PASSING,
    exitCode: 0,
    duration: 0.01,
    output: 'detection output',
    timedOut: false,
    verificationPassed: true,
  });
  await fs.mkdir(path.join(fixture.runDir, 'regressed'), { recursive: true });
  await fs.writeFile(path.join(fixture.runDir, 'regressed', `${taskNumber}.md`), content, 'utf8');
}

async function changeSource(fixture: Fixture): Promise<void> {
  await fs.writeFile(path.join(fixture.tmpDir, 'src', 'a.ts'), 'export const value = 2;\n', 'utf8');
}

async function captureLog(fn: () => Promise<void>): Promise<string> {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

describe('scope regression recertification', () => {
  let fixture: Fixture;
  let cleanups: string[] = [];

  beforeEach(async () => {
    cleanups = [];
  });

  afterEach(async () => {
    for (const dir of cleanups) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  async function withFixture(
    options: { scope?: string[]; verify?: string } = {},
  ): Promise<Fixture> {
    const created = await setup(options);
    cleanups.push(created.tmpDir);
    fixture = created;
    return created;
  }

  it('passing recertification refreshes canonical done and records outcome passed', async () => {
    await withFixture();
    await writeDone(fixture, 1, {
      scopeHash: 'sha256:old',
      scopeFiles: { 'src/a.ts': 'sha256:oldfile' },
      body: '2025-01-01T00:00:00.000Z\n',
      extra: { custom_note: 'keep-me' },
    });
    await markRegressed(fixture, 1, 'sha256:old');
    await changeSource(fixture);

    const result = await retrySpec(fixture.tmpDir, '001', '1', DEFAULT_CONFIG);

    assert.equal(result.recertification, 'passed');
    assert.equal(await exists(path.join(fixture.tmpDir, 'recert-runs.log')), true, 'verify ran');
    // Only the regression marker is retired; canonical done stays canonical.
    assert.equal(await exists(path.join(fixture.runDir, 'regressed', '1.md')), false);
    assert.equal(await exists(path.join(fixture.runDir, 'regressed', '1.1.md')), true);
    assert.equal(await exists(path.join(fixture.runDir, 'done', '1')), true);
    assert.equal(await exists(path.join(fixture.runDir, 'done', '1.1')), false);

    const raw = await fs.readFile(path.join(fixture.runDir, 'done', '1'), 'utf8');
    const { data, body } = parseFrontmatter(raw);
    assert.equal(body, '2025-01-01T00:00:00.000Z\n', 'completion body preserved');
    assert.equal(data.build_stamp, 'stamp-abc');
    assert.equal(data.exit_code, 0);
    assert.equal(data.custom_note, 'keep-me', 'unknown metadata preserved');
    assert.equal(data.original_scope_hash, 'sha256:old');
    assert.equal(data.recertification_count, 1);
    assert.equal(typeof data.recertified_at, 'string');
    const current = await computeTaskScopeHash(fixture.tmpDir, ['src/a.ts']);
    assert.equal(data.scope_hash, current.hash);
    assert.deepEqual(data.scope_files, current.fileHashes);

    const events = await readEvents(fixture, '1');
    assert.equal(events.length, 1, 'only the recertification event is appended');
    const event = events[0];
    assert.equal(event.type, 'recertification');
    assert.equal(event.data?.outcome, 'passed');
    assert.deepEqual(event.data?.differingPaths, ['src/a.ts (modified)']);
    assert.deepEqual(event.data?.attribution, [
      { path: 'src/a.ts (modified)', attribution: 'unknown' },
    ]);
    assert.equal(event.data?.command, PASSING);
    assert.equal(event.data?.exitCode, 0);
    assert.equal(event.data?.timedOut, false);
    assert.equal(event.data?.recordedHash, 'sha256:old');
    assert.equal(event.data?.currentHash, current.hash);
    assert.ok(String(event.data?.output).includes('recert-passed-output'));
    assert.equal(event.data?.attempt, undefined, 'passed wins do not advance attempts');

    assert.deepEqual(await readRetryContext(fixture.specFolder, '1'), { attempt: 1 });
    const state = await deriveSpecState(fixture.tmpDir, fixture.specFolder);
    assert.equal(state.tasks[0]?.status, 'done');
  });

  it('never replaces original_scope_hash across repeated passing recertifications', async () => {
    await withFixture();
    await writeDone(fixture, 1, {
      scopeHash: 'sha256:second',
      scopeFiles: { 'src/a.ts': 'sha256:secondfile' },
      body: 'BODY\n',
      extra: { original_scope_hash: 'sha256:first', recertification_count: 3 },
    });
    await markRegressed(fixture, 1, 'sha256:second');
    await changeSource(fixture);

    const result = await retrySpec(fixture.tmpDir, '001', '1', DEFAULT_CONFIG);

    assert.equal(result.recertification, 'passed');
    const { data } = parseFrontmatter(
      await fs.readFile(path.join(fixture.runDir, 'done', '1'), 'utf8'),
    );
    assert.equal(data.original_scope_hash, 'sha256:first', 'first trusted hash is retained');
    assert.equal(data.recertification_count, 4, 'count increments from the recorded value');
  });

  it('requeues on failing recertification with the failed output and next attempt', async () => {
    await withFixture();
    await writeDone(fixture, 1, {
      scopeHash: 'sha256:old',
      scopeFiles: { 'src/a.ts': 'sha256:oldfile' },
      body: 'DONE-BODY\n',
    });
    await markRegressed(fixture, 1, 'sha256:old');
    await fs.writeFile(path.join(fixture.tmpDir, 'recert-fail'), '1', 'utf8');

    const result = await retrySpec(fixture.tmpDir, '001', '1', DEFAULT_CONFIG);

    assert.equal(result.recertification, 'requeued');
    assert.equal(result.attempt, 2);
    assert.equal(await exists(path.join(fixture.runDir, 'regressed', '1.1.md')), true);
    assert.equal(await exists(path.join(fixture.runDir, 'done', '1.1')), true);
    assert.equal(await exists(path.join(fixture.runDir, 'done', '1')), false);
    const state = await deriveSpecState(fixture.tmpDir, fixture.specFolder);
    assert.equal(state.tasks[0]?.status, 'pending');

    const events = await readEvents(fixture, '1');
    assert.equal(events.length, 1);
    const event = events[0];
    assert.equal(event.type, 'recertification');
    assert.equal(event.data?.outcome, 'requeued');
    assert.equal(event.data?.attempt, 2);
    assert.equal(event.data?.reason, 'scope_regression');
    assert.equal(event.data?.exitCode, 4);
    assert.ok(String(event.data?.output).includes('recert-failed-output'));

    // A fresh read reconstructs the next executor context from append-only state.
    const context = await readRetryContext(fixture.specFolder, '1');
    assert.equal(context.attempt, 2);
    assert.equal(context.reason, 'scope_regression');
    assert.ok(String(context.output).includes('recert-failed-output'));
  });

  it('requeues with the timeout result when recertification exceeds the configured timeout', async () => {
    await withFixture({ verify: TIMEOUT });
    await writeDone(fixture, 1, {
      scopeHash: 'sha256:old',
      scopeFiles: { 'src/a.ts': 'sha256:oldfile' },
      body: 'DONE-BODY\n',
    });
    await markRegressed(fixture, 1, 'sha256:old');
    const config: OsqConfig = {
      ...DEFAULT_CONFIG,
      timeouts: { ...DEFAULT_CONFIG.timeouts, verifyTimeoutSeconds: 1 },
    };

    const result = await retrySpec(fixture.tmpDir, '001', '1', config);

    assert.equal(result.recertification, 'requeued');
    const event = (await readEvents(fixture, '1'))[0];
    assert.equal(event.type, 'recertification');
    assert.equal(event.data?.timedOut, true);
    assert.notEqual(event.data?.exitCode, 0);
  });

  it('preserves the established retry transition for a dead task without verification', async () => {
    await withFixture();
    await fs.mkdir(path.join(fixture.runDir, 'dead'), { recursive: true });
    await fs.writeFile(
      path.join(fixture.runDir, 'dead', '1.md'),
      '---\nreason: verify_red\n---\ndead marker\n',
      'utf8',
    );

    const result = await retrySpec(fixture.tmpDir, '001', '1', DEFAULT_CONFIG);

    assert.equal(result.recertification, undefined);
    assert.equal(result.attempt, 2);
    assert.equal(await exists(path.join(fixture.runDir, 'dead', '1.1.md')), true);
    assert.equal(await exists(path.join(fixture.tmpDir, 'recert-runs.log')), false);
    const events = await readEvents(fixture, '1');
    assert.equal(events.at(-1)?.type, 'retry');
    assert.equal(
      events.some((event) => event.type === 'recertification'),
      false,
    );
  });

  it('preserves the established retry transition for a non-scope regression', async () => {
    await withFixture();
    await writeDone(fixture, 1, {
      scopeHash: 'sha256:old',
      scopeFiles: { 'src/a.ts': 'sha256:oldfile' },
      body: 'DONE-BODY\n',
    });
    await fs.mkdir(path.join(fixture.runDir, 'regressed'), { recursive: true });
    await fs.writeFile(
      path.join(fixture.runDir, 'regressed', '1.md'),
      '---\nreason: verify_red\n---\nregression marker\n',
      'utf8',
    );

    const result = await retrySpec(fixture.tmpDir, '001', '1', DEFAULT_CONFIG);

    assert.equal(result.recertification, undefined);
    assert.equal(await exists(path.join(fixture.runDir, 'regressed', '1.1.md')), true);
    assert.equal(await exists(path.join(fixture.runDir, 'done', '1.1')), true);
    assert.equal(await exists(path.join(fixture.tmpDir, 'recert-runs.log')), false);
    assert.equal((await readEvents(fixture, '1')).at(-1)?.type, 'retry');
  });

  it('falls back to the preserving transition when no automated done marker exists', async () => {
    await withFixture();
    await markRegressed(fixture, 1, 'sha256:old');

    const result = await retrySpec(fixture.tmpDir, '001', '1', DEFAULT_CONFIG);

    assert.equal(result.recertification, undefined);
    assert.equal(await exists(path.join(fixture.runDir, 'regressed', '1.1.md')), true);
    assert.equal(await exists(path.join(fixture.tmpDir, 'recert-runs.log')), false);
    assert.equal((await readEvents(fixture, '1')).at(-1)?.type, 'retry');
  });

  it('refuses a malformed done marker as a recertification target', async () => {
    await withFixture();
    await fs.mkdir(path.join(fixture.runDir, 'done'), { recursive: true });
    await fs.writeFile(
      path.join(fixture.runDir, 'done', '1'),
      `---\nmanual: true\nreason: human decided\n---\n${new Date().toISOString()}\n`,
      'utf8',
    );
    await markRegressed(fixture, 1, 'sha256:old');

    const result = await retrySpec(fixture.tmpDir, '001', '1', DEFAULT_CONFIG);

    assert.equal(result.recertification, undefined);
    assert.equal(await exists(path.join(fixture.tmpDir, 'recert-runs.log')), false);
    assert.equal((await readEvents(fixture, '1')).at(-1)?.type, 'retry');
  });

  it('uses the shared target-wide ordinal when a recertification requeues', async () => {
    await withFixture();
    await writeDone(fixture, 1, {
      scopeHash: 'sha256:old',
      scopeFiles: { 'src/a.ts': 'sha256:oldfile' },
      body: 'DONE-BODY\n',
    });
    await markRegressed(fixture, 1, 'sha256:old');
    await fs.mkdir(path.join(fixture.runDir, 'regressed'), { recursive: true });
    await fs.mkdir(path.join(fixture.runDir, 'dead'), { recursive: true });
    await fs.writeFile(
      path.join(fixture.runDir, 'regressed', '1.1.md'),
      '---\nreason: verify_red\n---\nprior\n',
      'utf8',
    );
    await fs.writeFile(
      path.join(fixture.runDir, 'dead', '1.2.md'),
      '---\nreason: crashed\n---\nprior\n',
      'utf8',
    );
    await fs.writeFile(path.join(fixture.tmpDir, 'recert-fail'), '1', 'utf8');

    const result = await retrySpec(fixture.tmpDir, '001', '1', DEFAULT_CONFIG);

    assert.equal(result.attempt, 4);
    assert.equal(await exists(path.join(fixture.runDir, 'regressed', '1.3.md')), true);
    assert.equal(await exists(path.join(fixture.runDir, 'done', '1.3')), true);
    const event = (await readEvents(fixture, '1'))[0];
    assert.equal(event.data?.attempt, 4);
  });

  it('renders the failed recertification output in every textual prompt after restart', async () => {
    await withFixture();
    await writeDone(fixture, 1, {
      scopeHash: 'sha256:old',
      scopeFiles: { 'src/a.ts': 'sha256:oldfile' },
      body: 'DONE-BODY\n',
    });
    await markRegressed(fixture, 1, 'sha256:old');
    await fs.writeFile(path.join(fixture.tmpDir, 'recert-fail'), '1', 'utf8');
    await retrySpec(fixture.tmpDir, '001', '1', DEFAULT_CONFIG);

    const resultsDir = path.join(fixture.runDir, 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(path.join(resultsDir, '1.md'), '# prior result\n', 'utf8');

    const context = await readRetryContext(fixture.specFolder, '1');
    const options: SpawnTaskOptions = {
      projectRoot: fixture.tmpDir,
      specFolderPath: fixture.specFolder,
      taskNumber: '1',
      taskTitle: 'Task 1 recertification',
      verifyCommand: PASSING,
      scope: ['src/a.ts'],
      entry: [],
      skills: [],
      tier: 'coding',
      attempt: context.attempt,
      priorFailureReason: context.reason,
      priorFailureOutput: context.output,
    };
    const prompts = [
      buildAgyPrompt(options),
      buildOpencodePrompt(options),
      await buildCodexPrompt(options),
    ];

    for (const prompt of prompts) {
      assert.ok(prompt.includes('Prior Context:'));
      assert.ok(prompt.includes('- Prior Attempt: 2'));
      assert.ok(prompt.includes('- Prior Failure: scope_regression'));
      assert.ok(prompt.includes('- Prior Failure Output:'));
      assert.ok(prompt.includes('recert-failed-output'));
      assert.ok(prompt.includes('Prior Result:'));
    }
  });

  it('passes the requeued failure context into the next agent spawn', async () => {
    await withFixture();
    await writeDone(fixture, 1, {
      scopeHash: 'sha256:old',
      scopeFiles: { 'src/a.ts': 'sha256:oldfile' },
      body: 'DONE-BODY\n',
    });
    await markRegressed(fixture, 1, 'sha256:old');
    await fs.writeFile(path.join(fixture.tmpDir, 'recert-fail'), '1', 'utf8');
    await retrySpec(fixture.tmpDir, '001', '1', DEFAULT_CONFIG);
    // The next attempt's own verification now passes; only the prompt context matters.
    await fs.rm(path.join(fixture.tmpDir, 'recert-fail'), { force: true });

    const adapter = new RecordingAdapter();
    await runTask(fixture.tmpDir, fixture.specFolder, '1', DEFAULT_CONFIG, adapter);

    assert.equal(adapter.spawns.length, 1);
    assert.equal(adapter.spawns[0].attempt, 2);
    assert.equal(adapter.spawns[0].priorFailureReason, 'scope_regression');
    assert.ok(String(adapter.spawns[0].priorFailureOutput).includes('recert-failed-output'));
  });

  it('reports recertification and requeue distinctly through the CLI', async () => {
    await withFixture();
    await writeDone(fixture, 1, {
      scopeHash: 'sha256:old',
      scopeFiles: { 'src/a.ts': 'sha256:oldfile' },
      body: 'DONE-BODY\n',
    });
    await markRegressed(fixture, 1, 'sha256:old');
    await changeSource(fixture);

    const passed = await captureLog(() =>
      retryCommand('001', '1', { cwd: fixture.tmpDir, config: DEFAULT_CONFIG }),
    );
    assert.match(passed, /Recertified 001 task 1/);
    assert.ok(!passed.includes('Retried 001'));

    // Recreate the regression over the refreshed done marker and fail it.
    await markRegressed(fixture, 1, 'sha256:refreshed');
    await fs.writeFile(path.join(fixture.tmpDir, 'recert-fail'), '1', 'utf8');
    const requeued = await captureLog(() =>
      retryCommand('001', '1', { cwd: fixture.tmpDir, config: DEFAULT_CONFIG }),
    );
    assert.match(requeued, /Requeued 001 task 1 for agent work/);
    assert.match(requeued, /next attempt: 3/);
  });
});
