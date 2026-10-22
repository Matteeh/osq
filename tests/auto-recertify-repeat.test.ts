import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import type { Logger } from '../src/core/foundation/logger.js';
import { computeTaskScopeHash } from '../src/core/run/scope-hash.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';
import { MockAdapter } from '../src/harness/mock.js';
import type { SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const PASSING = 'node verify.cjs';
const INITIAL_CONTENT = 'export const value = 1;\n';
const SECOND_CONTENT = 'export const value = 2;\n';
const THIRD_CONTENT = 'export const value = 3;\n';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
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
    'Exercise repeated automatic scope recertification.',
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

function taskMd(number: number, scope: string): string {
  return `${[
    '---',
    `title: Task ${number} scope`,
    `verify: ${PASSING}`,
    'scope:',
    `  - ${scope}`,
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
  scopes: string[],
  writesByTask: Record<string, Record<string, string>>,
): Promise<Fixture> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-auto-recert-repeat-'));
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
  await fs.writeFile(path.join(specFolder, 'tasks.md'), tasksMd(scopes.length), 'utf8');
  for (let index = 0; index < scopes.length; index++) {
    await fs.writeFile(
      path.join(specFolder, 'tasks', `${index + 1}.md`),
      taskMd(index + 1, scopes[index] as string),
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

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

async function runCycle(fixture: Fixture, config: OsqConfig = DEFAULT_CONFIG) {
  return runWatcherCycle(fixture.tmpDir, config, fixture.adapter, fixture.logger);
}

describe('A third task extends the file again', () => {
  const fixtures: string[] = [];

  afterEach(async () => {
    for (const dir of fixtures.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('recertifies the owner a second time instead of halting', async () => {
    const project = await setupProject(
      ['src/a.ts', 'src/d.ts', 'src/e.ts'],
      ['src/a.ts', 'src/a.ts', 'src/a.ts', 'src/d.ts', 'src/e.ts'],
      { '2': { 'src/a.ts': SECOND_CONTENT }, '3': { 'src/a.ts': THIRD_CONTENT } },
    );
    fixtures.push(project.tmpDir);

    const summaries = [];
    for (let cycle = 0; cycle < 4; cycle++) {
      summaries.push(await runCycle(project));
    }

    for (const summary of summaries) {
      assert.deepEqual(summary.blockedByRegression, []);
    }

    assert.equal(await exists(path.join(project.runDir, 'done', '4')), true, 'task 4 is done');
    assert.equal(await exists(path.join(project.runDir, 'regressed', '1.md')), false);

    const current = await computeTaskScopeHash(project.tmpDir, ['src/a.ts']);
    const done = await readDone(project, 1);
    assert.equal(done.data.scope_hash, current.hash);
    assert.equal(done.data.recertification_count, 2);

    const recertifications = (await readEvents(project, 1)).filter(
      (event) => event.type === 'recertification',
    );
    assert.equal(recertifications.length, 2);
    assert.equal(recertifications[1]?.data?.automatic, true);
    assert.deepEqual(recertifications[1]?.data?.attribution, [
      { path: 'src/a.ts (modified)', attribution: '3', source: 'measures' },
    ]);
  });
});
