import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import type { Logger } from '../src/core/foundation/logger.js';
import { retrySpec } from '../src/core/lifecycle/retry.js';
import { buildScopeRegressionMarker, computeTaskScopeHash } from '../src/core/run/scope-hash.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';
import { MockAdapter } from '../src/harness/mock.js';
import type { SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { writeDoneMarker } from '../src/watcher/outcome.js';
import { auditScopeRegressions, buildDoneMetadata } from '../src/watcher/regression.js';
import { installFakeValidator } from './helpers.js';

const PASSING = 'node verify.cjs';
const INITIAL_CONTENT = 'export const value = 1;\n';
const UPDATED_CONTENT = 'export const value = 2;\n';
const TIMEOUT_SECONDS = DEFAULT_CONFIG.timeouts.verifyTimeoutSeconds ?? 600;
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;
const DETECT_SCRIPT = `const fs = require('node:fs');
if (fs.existsSync('detect-fail')) {
  console.error('detection-failed');
  process.exit(3);
}
process.exit(0);
`;

function proposalMd(title: string): string {
  return `${[
    '---',
    `title: ${title}`,
    'depends_on: []',
    `verify: ${PASSING}`,
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    '',
    'Exercise automatic scope recertification.',
    '',
    '## Contract',
    '',
    '| Input | Expected Output |',
    '|---|---|',
    '| sample | sample |',
    '',
    '## Non-goals',
    '',
    'None.',
    '',
    '## Surface',
    '',
    'None.',
    '',
    '## Delta',
    '',
    'None.',
    '',
  ].join('\n')}`;
}

function tasksMd(count: number): string {
  const lines = ['# Tasks', ''];
  for (let n = 1; n <= count; n++) {
    lines.push(`- [ ] ${n}. When task ${n} runs, its scope is recorded`);
  }
  return `${lines.join('\n')}\n`;
}

function taskMd(number: number, scope: string | string[], verify: string): string {
  const scopes = Array.isArray(scope) ? scope : [scope];
  return `${[
    '---',
    `title: Task ${number} scope`,
    `verify: ${verify}`,
    'scope:',
    ...scopes.map((entry) => `  - ${entry}`),
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    `- [ ] task ${number} is observable`,
    '',
  ].join('\n')}`;
}

class WritingAdapter extends MockAdapter {
  private readonly writesByTask: Record<string, Record<string, string>>;

  constructor(writesByTask: Record<string, Record<string, string>>) {
    super();
    this.writesByTask = writesByTask;
  }

  override async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    const writes = this.writesByTask[options.taskNumber] ?? {};
    for (const [relative, content] of Object.entries(writes)) {
      await fs.writeFile(path.join(options.projectRoot, relative), content, 'utf8');
    }
    return super.spawn(options);
  }
}

class CaptureLogger implements Logger {
  readonly infos: string[] = [];
  readonly errors: string[] = [];
  readonly statuses: string[] = [];
  readonly interactive = false;
  readonly symbols = false;

  info(msg: string): void {
    this.infos.push(msg);
  }

  verbose(_msg: string): void {}
  warn(_msg: string): void {}

  error(msg: string): void {
    this.errors.push(msg);
  }

  status(text: string): void {
    this.statuses.push(text);
  }

  clearStatus(): void {}
}

interface Fixture {
  tmpDir: string;
  specFolder: string;
  runDir: string;
  adapter: WritingAdapter;
  logger: CaptureLogger;
}

async function setupProject(
  files: string[],
  tasks: { scope: string | string[]; verify?: string }[],
  writesByTask: Record<string, Record<string, string>> = {},
): Promise<Fixture> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-auto-recert-'));
  await installFakeValidator(tmpDir);
  await scaffoldProject(tmpDir);
  await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
  for (const file of files) {
    await fs.writeFile(path.join(tmpDir, file), INITIAL_CONTENT, 'utf8');
  }

  const specFolder = path.join(tmpDir, 'openspec', 'changes', '001-auto-recert');
  await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(specFolder, 'proposal.md'), proposalMd('Auto recert'), 'utf8');
  await fs.writeFile(path.join(specFolder, 'tasks.md'), tasksMd(tasks.length), 'utf8');
  for (let index = 0; index < tasks.length; index++) {
    await fs.writeFile(
      path.join(specFolder, 'tasks', `${index + 1}.md`),
      taskMd(index + 1, tasks[index].scope, tasks[index].verify ?? PASSING),
      'utf8',
    );
  }
  await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

  return {
    tmpDir,
    specFolder,
    runDir: path.join(specFolder, '.run'),
    adapter: new WritingAdapter(writesByTask),
    logger: new CaptureLogger(),
  };
}

async function markDone(
  fixture: Fixture,
  taskNumber: number,
  scope: string | string[],
): Promise<void> {
  const metadata = await buildDoneMetadata(fixture.tmpDir, Array.isArray(scope) ? scope : [scope]);
  await writeDoneMarker(fixture.runDir, String(taskNumber), metadata);
}

async function writeDone(
  fixture: Fixture,
  taskNumber: number,
  scopeHash: string,
  scopeFiles: Record<string, string | null>,
): Promise<void> {
  await fs.mkdir(path.join(fixture.runDir, 'done'), { recursive: true });
  const lines = [
    '---',
    `scope_hash: ${JSON.stringify(scopeHash)}`,
    'build_stamp: "stamp-abc"',
    'exit_code: 0',
    `scope_files: ${JSON.stringify(scopeFiles)}`,
    '---',
    '',
  ];
  await fs.writeFile(
    path.join(fixture.runDir, 'done', String(taskNumber)),
    lines.join('\n'),
    'utf8',
  );
}

async function writeLegacyDone(
  fixture: Fixture,
  taskNumber: number,
  scope: string[],
): Promise<void> {
  const current = await computeTaskScopeHash(fixture.tmpDir, scope);
  await fs.mkdir(path.join(fixture.runDir, 'done'), { recursive: true });
  const content = [
    '---',
    `scope_hash: ${JSON.stringify(current.hash)}`,
    'build_stamp: "stamp-legacy"',
    'exit_code: 0',
    `scope_files: ${JSON.stringify(current.fileHashes)}`,
    '---',
    '',
  ].join('\n');
  await fs.writeFile(path.join(fixture.runDir, 'done', String(taskNumber)), content, 'utf8');
}

async function markRegressed(
  fixture: Fixture,
  taskNumber: number,
  recordedHash: string,
): Promise<void> {
  const content = buildScopeRegressionMarker({
    taskNumber: String(taskNumber),
    differingPaths: ['src/a.ts (modified)'],
    attribution: [{ path: 'src/a.ts (modified)', attribution: 'unknown' }],
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

async function appendMeasuresEnd(
  fixture: Fixture,
  taskNumber: number,
  filePath: string,
  before: string | null,
  after: string | null,
): Promise<void> {
  const eventsDir = path.join(fixture.runDir, 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  const event = {
    type: 'measures',
    timestamp: new Date().toISOString(),
    data: { phase: 'end', scopeHashes: { [filePath]: { before, after } } },
  };
  await fs.appendFile(path.join(eventsDir, `${taskNumber}.jsonl`), `${JSON.stringify(event)}\n`);
}

async function readEvents(fixture: Fixture, target: number) {
  const raw = await fs
    .readFile(path.join(fixture.runDir, 'events', `${target}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string; data?: Record<string, unknown> });
}

async function readDone(fixture: Fixture, taskNumber: number) {
  const content = await fs.readFile(path.join(fixture.runDir, 'done', String(taskNumber)), 'utf8');
  return parseFrontmatter(content);
}

async function readRegressed(fixture: Fixture, taskNumber: number) {
  const content = await fs.readFile(
    path.join(fixture.runDir, 'regressed', `${taskNumber}.md`),
    'utf8',
  );
  return parseFrontmatter(content);
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

async function audit(fixture: Fixture, eligibleTaskNumbers: string[]) {
  return auditScopeRegressions({
    projectRoot: fixture.tmpDir,
    specFolderPath: fixture.specFolder,
    eligibleTaskNumbers,
    verifyTimeoutSeconds: TIMEOUT_SECONDS,
  });
}

async function runCycle(fixture: Fixture, config: OsqConfig = DEFAULT_CONFIG) {
  return runWatcherCycle(fixture.tmpDir, config, fixture.adapter, fixture.logger);
}

describe('Automatic scope recertification', () => {
  const fixtures: string[] = [];

  afterEach(async () => {
    for (const dir of fixtures.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  async function fixture(
    files: string[],
    tasks: { scope: string | string[]; verify?: string }[],
    writesByTask: Record<string, Record<string, string>> = {},
  ): Promise<Fixture> {
    const created = await setupProject(files, tasks, writesByTask);
    fixtures.push(created.tmpDir);
    return created;
  }

  it('recertifies a task automatically when a later in-scope task extended its file', async () => {
    const project = await fixture(
      ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'],
      [
        { scope: 'src/a.ts' },
        { scope: ['src/a.ts', 'src/b.ts'] },
        { scope: 'src/c.ts' },
        { scope: 'src/d.ts' },
      ],
      { '2': { 'src/a.ts': UPDATED_CONTENT } },
    );

    await runCycle(project);
    const recordedHash = String((await readDone(project, 1)).data.scope_hash);
    await runCycle(project);
    const current = await computeTaskScopeHash(project.tmpDir, ['src/a.ts']);
    assert.notEqual(current.hash, recordedHash, 'task 2 changed the file');

    const summary = await runCycle(project);

    assert.deepEqual(summary.blockedByRegression, []);
    assert.equal(await exists(path.join(project.runDir, 'regressed', '1.md')), false);

    const done = await readDone(project, 1);
    assert.equal(done.data.original_scope_hash, recordedHash);
    assert.equal(done.data.scope_hash, current.hash);
    assert.equal(done.data.scope_resolver, 2);
    assert.equal(done.data.recertification_count, 1);

    const events = await readEvents(project, 1);
    const recertifications = events.filter((event) => event.type === 'recertification');
    assert.equal(recertifications.length, 1);
    assert.equal(recertifications[0]?.data?.outcome, 'passed');
    assert.equal(recertifications[0]?.data?.automatic, true);
    assert.equal(recertifications[0]?.data?.recordedHash, recordedHash);
    assert.equal(recertifications[0]?.data?.currentHash, current.hash);
    assert.equal(recertifications[0]?.data?.attempt, undefined, 'no attempt advance');
    assert.deepEqual(recertifications[0]?.data?.differingPaths, ['src/a.ts (modified)']);
    assert.equal(events.filter((event) => event.type === 'regressed').length, 0);
    assert.equal(events.filter((event) => event.type === 'retry').length, 0);
    assert.equal(events.filter((event) => event.type === 'started').length, 1, 'no new attempt');

    assert.equal(await exists(path.join(project.runDir, 'done', '3')), true, 'task 3 ran');
    const lines = project.logger.infos.filter((line) =>
      line.includes('task 1 recertified automatically'),
    );
    assert.equal(lines.length, 1);
    assert.ok(lines[0]?.includes('src/a.ts (modified)'));
  });

  it('reports the recertified task and no stale task from the audit', async () => {
    const project = await fixture(
      ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      [{ scope: 'src/a.ts' }, { scope: 'src/a.ts' }, { scope: 'src/b.ts' }],
      { '2': { 'src/a.ts': UPDATED_CONTENT } },
    );

    await runCycle(project);
    await runCycle(project);

    const result = await audit(project, ['1', '2']);
    assert.deepEqual(result.stale, []);
    assert.deepEqual(result.recertified, ['1']);
    assert.deepEqual(result.recertifiedPaths, { '1': ['src/a.ts (modified)'] });
    assert.equal(await exists(path.join(project.runDir, 'regressed', '1.md')), false);
  });

  it('halts with a regression when the chain is intact but the verify fails', async () => {
    const project = await fixture(
      ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      [
        { scope: 'src/a.ts', verify: 'node detect.cjs' },
        { scope: 'src/a.ts' },
        { scope: 'src/c.ts' },
      ],
      { '2': { 'src/a.ts': UPDATED_CONTENT } },
    );
    await fs.writeFile(path.join(project.tmpDir, 'detect.cjs'), DETECT_SCRIPT, 'utf8');

    await runCycle(project);
    await runCycle(project);
    await fs.writeFile(path.join(project.tmpDir, 'detect-fail'), '1', 'utf8');

    const summary = await runCycle(project);

    assert.equal(summary.tasksRun, 0);
    assert.deepEqual(summary.blockedByRegression, [
      { id: '001', outcome: 'blocked_by_regression', tasks: ['1'] },
    ]);
    const marker = await readRegressed(project, 1);
    assert.equal(marker.data.reason, 'scope_regression');
    assert.equal(marker.data.exit_code, 3);
    assert.equal(marker.data.verification_passed, false);
    const events = await readEvents(project, 1);
    assert.equal(events.filter((event) => event.type === 'regressed').length, 1);
    assert.equal(events.filter((event) => event.type === 'recertification').length, 0);
    assert.equal((await readDone(project, 1)).data.recertification_count, undefined);
  });

  it('halts when a human edit leaves a gap before the later task recorded the file', async () => {
    const project = await fixture(
      ['src/a.ts', 'src/b.ts'],
      [{ scope: 'src/a.ts' }, { scope: 'src/a.ts' }],
    );

    await markDone(project, 1, 'src/a.ts');
    await fs.writeFile(path.join(project.tmpDir, 'src', 'a.ts'), UPDATED_CONTENT, 'utf8');
    await markDone(project, 2, 'src/a.ts');
    const current = await computeTaskScopeHash(project.tmpDir, ['src/a.ts']);
    await appendMeasuresEnd(project, 2, 'src/a.ts', 'sha256:human-edit', current.hash);

    const result = await audit(project, ['1']);
    assert.deepEqual(result.recertified, []);
    assert.equal(result.stale.length, 1);
    assert.equal(result.stale[0]?.taskNumber, '1');
    assert.equal(await exists(path.join(project.runDir, 'regressed', '1.md')), true);
  });

  it('halts when the changed file is outside every later task scope', async () => {
    const project = await fixture(
      ['src/a.ts', 'src/b.ts'],
      [{ scope: 'src/a.ts' }, { scope: 'src/b.ts' }],
    );

    await markDone(project, 1, 'src/a.ts');
    await fs.writeFile(path.join(project.tmpDir, 'src', 'a.ts'), UPDATED_CONTENT, 'utf8');
    await markDone(project, 2, 'src/b.ts');

    const result = await audit(project, ['1', '2']);
    assert.deepEqual(result.recertified, []);
    assert.equal(result.stale.length, 1);
    assert.equal(result.stale[0]?.taskNumber, '1');
    assert.equal(await exists(path.join(project.runDir, 'regressed', '1.md')), true);
  });

  it('records a resolver-only difference as a regression exactly as before', async () => {
    const project = await fixture(
      ['src/a.ts', 'src/b.ts'],
      [{ scope: 'src/a.ts' }, { scope: 'src/b.ts' }],
    );

    await writeLegacyDone(project, 1, ['src/a.ts']);

    const result = await audit(project, ['1']);
    assert.deepEqual(result.recertified, []);
    assert.equal(result.stale.length, 1);

    const marker = await readRegressed(project, 1);
    assert.equal(marker.data.reason, 'scope_regression');
    assert.equal(marker.data.recorded_resolver, null);
    assert.equal(marker.data.verification_passed, true);
    const events = await readEvents(project, 1);
    assert.equal(events.filter((event) => event.type === 'recertification').length, 0);
    assert.deepEqual(events.find((event) => event.type === 'regressed')?.data?.differingPaths, []);
  });

  it('leaves automatic out of a passing human retry recertification', async () => {
    const project = await fixture(['src/a.ts'], [{ scope: 'src/a.ts' }]);

    await writeDone(project, 1, 'sha256:old', { 'src/a.ts': 'sha256:oldfile' });
    await markRegressed(project, 1, 'sha256:old');
    await fs.writeFile(path.join(project.tmpDir, 'src', 'a.ts'), UPDATED_CONTENT, 'utf8');

    const result = await retrySpec(project.tmpDir, '001', '1', DEFAULT_CONFIG);
    assert.equal(result.recertification, 'passed');

    const event = (await readEvents(project, 1)).find((entry) => entry.type === 'recertification');
    assert.equal(event?.data?.outcome, 'passed');
    assert.equal(event?.data?.automatic, undefined);
    assert.equal(Object.hasOwn(event?.data ?? {}, 'automatic'), false);
  });
});
