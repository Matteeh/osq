import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import type { Logger } from '../src/core/foundation/logger.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';
import { MockAdapter } from '../src/harness/mock.js';
import type { SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { appendHarnessEvent } from '../src/harness/types.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { writeDoneMarker } from '../src/watcher/outcome.js';
import { buildDoneMetadata } from '../src/watcher/regression.js';
import { installFakeValidator } from './helpers.js';

const PASSING = 'node verify.cjs';
const FAILING = 'node -e "console.error(\'detection-failed\'); process.exit(3)"';
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
    'Exercise the pre-dispatch scope recertification audit.',
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

class CountingAdapter extends MockAdapter {
  spawnCalls = 0;

  override async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.spawnCalls += 1;
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
  adapter: CountingAdapter;
  logger: CaptureLogger;
}

async function setupProject(scopes: string[], verify: string = PASSING): Promise<Fixture> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-scope-recert-'));
  await installFakeValidator(tmpDir);
  await scaffoldProject(tmpDir);
  await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
  for (const scope of scopes) {
    await fs.writeFile(path.join(tmpDir, scope), 'export const value = 1;\n', 'utf8');
  }

  const specFolder = path.join(tmpDir, 'openspec', 'changes', '001-scope-recert');
  await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(specFolder, 'proposal.md'), proposalMd('Scope recert'), 'utf8');
  await fs.writeFile(path.join(specFolder, 'tasks.md'), tasksMd(scopes.length), 'utf8');
  for (let index = 0; index < scopes.length; index++) {
    await fs.writeFile(
      path.join(specFolder, 'tasks', `${index + 1}.md`),
      taskMd(index + 1, scopes[index], verify),
      'utf8',
    );
  }
  await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

  return {
    tmpDir,
    specFolder,
    runDir: path.join(specFolder, '.run'),
    adapter: new CountingAdapter(),
    logger: new CaptureLogger(),
  };
}

/** Mark a task done at the current tree without spawning an agent. */
async function markDone(
  fixture: Fixture,
  taskNumber: number,
  scope: string | string[],
): Promise<void> {
  const metadata = await buildDoneMetadata(fixture.tmpDir, Array.isArray(scope) ? scope : [scope]);
  await writeDoneMarker(fixture.runDir, String(taskNumber), metadata);
}

async function appendFileChanged(
  fixture: Fixture,
  taskNumber: number,
  filePath: string,
): Promise<void> {
  await appendHarnessEvent(fixture.specFolder, String(taskNumber), {
    type: 'file_changed',
    timestamp: new Date().toISOString(),
    data: { path: filePath },
  });
}

async function readMarker(fixture: Fixture, taskNumber: number) {
  const content = await fs.readFile(
    path.join(fixture.runDir, 'regressed', `${taskNumber}.md`),
    'utf8',
  );
  return { content, data: parseFrontmatter(content).data };
}

async function readAttribution(
  fixture: Fixture,
  taskNumber: number,
): Promise<Record<string, string>> {
  const { data } = await readMarker(fixture, taskNumber);
  const map: Record<string, string> = {};
  const entries = Array.isArray(data.attribution) ? data.attribution : [];
  for (const entry of entries) {
    if (entry && typeof entry === 'object') {
      const record = entry as { path?: unknown; attribution?: unknown };
      if (typeof record.path === 'string') {
        map[record.path] = typeof record.attribution === 'string' ? record.attribution : 'unknown';
      }
    }
  }
  return map;
}

async function readEvents(fixture: Fixture, taskNumber: number) {
  const raw = await fs
    .readFile(path.join(fixture.runDir, 'events', `${taskNumber}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string; data?: Record<string, unknown> });
}

async function specState(fixture: Fixture) {
  const done = await fs.readdir(path.join(fixture.runDir, 'done')).catch(() => [] as string[]);
  const regressed = await fs
    .readdir(path.join(fixture.runDir, 'regressed'))
    .catch(() => [] as string[]);
  const dead = await fs.readdir(path.join(fixture.runDir, 'dead')).catch(() => [] as string[]);
  const running = await fs
    .readdir(path.join(fixture.runDir, 'running'))
    .catch(() => [] as string[]);
  return { done, regressed, dead, running };
}

async function exists(filePath: string): Promise<boolean> {
  return fs
    .stat(filePath)
    .then(() => true)
    .catch(() => false);
}

describe('Pre-dispatch scope recertification audit', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await setupProject(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts']);
    await markDone(fixture, 1, 'src/a.ts');
    await markDone(fixture, 2, 'src/b.ts');
    await fs.writeFile(path.join(fixture.tmpDir, 'src', 'a.ts'), 'export const value = 2;\n');
    await fs.writeFile(path.join(fixture.tmpDir, 'src', 'b.ts'), 'export const value = 2;\n');
  });

  afterEach(async () => {
    await fs.rm(fixture.tmpDir, { recursive: true, force: true });
  });

  it('verifies every stale task in one audit and blocks without touching the upcoming task', async () => {
    await fs.writeFile(
      path.join(fixture.specFolder, 'tasks', '2.md'),
      taskMd(2, 'src/b.ts', FAILING),
      'utf8',
    );

    const summary = await runWatcherCycle(
      fixture.tmpDir,
      DEFAULT_CONFIG,
      fixture.adapter,
      fixture.logger,
    );

    assert.equal(summary.tasksRun, 0, 'the upcoming task must not count as run');
    assert.equal(fixture.adapter.spawnCalls, 0, 'no agent may spawn on the blocked path');
    assert.deepEqual(summary.blockedByRegression, [
      { id: '001', outcome: 'blocked_by_regression', tasks: ['1', '2'] },
    ]);

    const state = await specState(fixture);
    assert.ok(state.regressed.includes('1.md'));
    assert.ok(state.regressed.includes('2.md'));
    assert.ok(!state.regressed.includes('3.md'), 'upcoming task must have no regression marker');
    assert.ok(!state.dead.includes('3.md'), 'upcoming task must have no dead marker');
    assert.ok(!state.running.includes('3.pid'), 'upcoming task must stay unlocked');

    const first = await readMarker(fixture, 1);
    assert.equal(first.data.reason, 'scope_regression');
    assert.equal(first.data.exit_code, 0);
    assert.equal(first.data.verification_passed, true);
    assert.match(String(first.data.recorded_hash), /^sha256:/);
    assert.match(String(first.data.current_hash), /^sha256:/);
    assert.ok(first.content.includes('src/a.ts (modified)'));
    assert.deepEqual(await readAttribution(fixture, 1), { 'src/a.ts (modified)': 'unknown' });

    const second = await readMarker(fixture, 2);
    assert.equal(second.data.exit_code, 3);
    assert.equal(second.data.verification_passed, false);
    assert.ok(second.content.includes('src/b.ts (modified)'));
    assert.ok(second.content.includes('detection-failed'));

    const firstEvents = await readEvents(fixture, 1);
    assert.equal(firstEvents.filter((event) => event.type === 'regressed').length, 1);
    assert.equal(firstEvents.filter((event) => event.type === 'verify_ran').length, 1);
    const regressed = firstEvents.find((event) => event.type === 'regressed');
    assert.equal(regressed?.data?.reason, 'scope_regression');
    assert.equal(regressed?.data?.exitCode, 0);
    assert.equal(regressed?.data?.verificationPassed, true);
    assert.deepEqual(regressed?.data?.attribution, [
      { path: 'src/a.ts (modified)', attribution: 'unknown' },
    ]);

    const secondEvents = await readEvents(fixture, 2);
    assert.equal(secondEvents.filter((event) => event.type === 'regressed').length, 1);
    assert.equal(secondEvents.find((event) => event.type === 'regressed')?.data?.exitCode, 3);

    const staleLines = fixture.logger.infos.filter((line) => line.includes('regressed'));
    assert.equal(staleLines.length, 2, `expected two stale lines, got: ${staleLines.join(' | ')}`);
    assert.ok(staleLines[0].includes('task 1'));
    assert.ok(staleLines[1].includes('task 2'));
    const summaries = fixture.logger.infos.filter((line) =>
      /spec 001 halted: tasks 1, 2 require recertification/.test(line),
    );
    assert.equal(summaries.length, 1, 'exactly one recertification summary');
  });

  it('does not re-verify or rewrite an already-active regression on a later cycle', async () => {
    const first = await runWatcherCycle(
      fixture.tmpDir,
      DEFAULT_CONFIG,
      fixture.adapter,
      fixture.logger,
    );
    assert.equal(first.tasksRun, 0);

    const eventsBefore = await readEvents(fixture, 1);
    const markerBefore = await fs.readFile(path.join(fixture.runDir, 'regressed', '1.md'), 'utf8');

    const second = await runWatcherCycle(
      fixture.tmpDir,
      DEFAULT_CONFIG,
      fixture.adapter,
      fixture.logger,
    );

    assert.equal(second.tasksRun, 0);
    assert.deepEqual(second.blockedByRegression, []);
    assert.equal(fixture.adapter.spawnCalls, 0);

    const eventsAfter = await readEvents(fixture, 1);
    assert.equal(eventsAfter.length, eventsBefore.length, 'no duplicate events');
    assert.equal(
      await fs.readFile(path.join(fixture.runDir, 'regressed', '1.md'), 'utf8'),
      markerBefore,
      'no duplicate marker write',
    );
  });

  it('retains the timeout result when detection verification exceeds the configured timeout', async () => {
    const strictConfig: OsqConfig = {
      ...DEFAULT_CONFIG,
      timeouts: { ...DEFAULT_CONFIG.timeouts, verifyTimeoutSeconds: 1 },
    };
    await fs.writeFile(
      path.join(fixture.specFolder, 'tasks', '1.md'),
      taskMd(1, 'src/a.ts', `node -e "setTimeout(() => {}, 30000)"`),
      'utf8',
    );

    const summary = await runWatcherCycle(
      fixture.tmpDir,
      strictConfig,
      fixture.adapter,
      fixture.logger,
    );

    assert.equal(summary.tasksRun, 0);
    const marker = await readMarker(fixture, 1);
    assert.equal(marker.data.timed_out, true);
    assert.equal(marker.data.verification_passed, false);
    assert.notEqual(marker.data.exit_code, 0);

    const events = await readEvents(fixture, 1);
    const regressed = events.find((event) => event.type === 'regressed');
    assert.equal(regressed?.data?.timedOut, true);
    assert.equal(regressed?.data?.reason, 'scope_regression');
  });

  it('records differing paths in deterministic sorted order', async () => {
    const fresh = await setupProject(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    try {
      await fs.writeFile(
        path.join(fresh.specFolder, 'tasks', '1.md'),
        taskMd(1, ['src/b.ts', 'src/a.ts'], PASSING),
        'utf8',
      );
      await markDone(fresh, 1, ['src/b.ts', 'src/a.ts']);
      await fs.writeFile(path.join(fresh.tmpDir, 'src', 'a.ts'), 'export const value = 2;\n');
      await fs.writeFile(path.join(fresh.tmpDir, 'src', 'b.ts'), 'export const value = 2;\n');

      await runWatcherCycle(fresh.tmpDir, DEFAULT_CONFIG, fresh.adapter, fresh.logger);

      const events = await readEvents(fresh, 1);
      const regressed = events.find((event) => event.type === 'regressed');
      assert.deepEqual(regressed?.data?.differingPaths, [
        'src/a.ts (modified)',
        'src/b.ts (modified)',
      ]);
    } finally {
      await fs.rm(fresh.tmpDir, { recursive: true, force: true });
    }
  });

  it('leaves manual and malformed done markers outside the audit', async () => {
    const fresh = await setupProject(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts']);
    try {
      await fs.mkdir(path.join(fresh.runDir, 'done'), { recursive: true });
      await fs.writeFile(
        path.join(fresh.runDir, 'done', '1'),
        `---\nmanual: true\nreason: human decided\n---\n${new Date().toISOString()}\n`,
        'utf8',
      );
      await fs.writeFile(path.join(fresh.runDir, 'done', '2'), 'not a done marker\n', 'utf8');
      await fs.writeFile(path.join(fresh.tmpDir, 'src', 'a.ts'), 'export const value = 9;\n');
      await fs.writeFile(path.join(fresh.tmpDir, 'src', 'b.ts'), 'export const value = 9;\n');

      const summary = await runWatcherCycle(
        fresh.tmpDir,
        DEFAULT_CONFIG,
        fresh.adapter,
        fresh.logger,
      );

      assert.equal(summary.tasksRun, 1, 'the upcoming task proceeds past manual markers');
      assert.equal(fresh.adapter.spawnCalls, 1);
      assert.ok(!(await exists(path.join(fresh.runDir, 'regressed', '1.md'))));
      assert.ok(!(await exists(path.join(fresh.runDir, 'regressed', '2.md'))));
    } finally {
      await fs.rm(fresh.tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Scope recertification attribution', () => {
  let fixture: Fixture;

  afterEach(async () => {
    await fs.rm(fixture.tmpDir, { recursive: true, force: true });
  });

  it('attributes a path to a sole later editor with no recorded completion hash', async () => {
    fixture = await setupProject(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    await markDone(fixture, 1, 'src/a.ts');
    await markDone(fixture, 2, 'src/b.ts');
    await fs.writeFile(path.join(fixture.tmpDir, 'src', 'a.ts'), 'export const value = 2;\n');
    await appendFileChanged(fixture, 2, 'src/a.ts');

    await runWatcherCycle(fixture.tmpDir, DEFAULT_CONFIG, fixture.adapter, fixture.logger);

    assert.deepEqual(await readAttribution(fixture, 1), { 'src/a.ts (modified)': '2' });
  });

  it('attributes a path when the current hash agrees with the later completion hash', async () => {
    fixture = await setupProject(['src/a.ts', 'src/a.ts', 'src/c.ts']);
    await markDone(fixture, 1, 'src/a.ts');
    await fs.writeFile(path.join(fixture.tmpDir, 'src', 'a.ts'), 'export const value = 2;\n');
    await markDone(fixture, 2, 'src/a.ts');
    await appendFileChanged(fixture, 2, 'src/a.ts');

    await runWatcherCycle(fixture.tmpDir, DEFAULT_CONFIG, fixture.adapter, fixture.logger);

    assert.deepEqual(await readAttribution(fixture, 1), { 'src/a.ts (modified)': '2' });
  });

  it('records ambiguous when more than one later task named the path', async () => {
    fixture = await setupProject(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts']);
    await markDone(fixture, 1, 'src/a.ts');
    await markDone(fixture, 2, 'src/b.ts');
    await markDone(fixture, 3, 'src/c.ts');
    await fs.writeFile(path.join(fixture.tmpDir, 'src', 'a.ts'), 'export const value = 2;\n');
    await appendFileChanged(fixture, 2, 'src/a.ts');
    await appendFileChanged(fixture, 3, 'src/a.ts');

    await runWatcherCycle(fixture.tmpDir, DEFAULT_CONFIG, fixture.adapter, fixture.logger);

    assert.deepEqual(await readAttribution(fixture, 1), { 'src/a.ts (modified)': 'ambiguous' });
  });

  it('records unknown when no later task named the path', async () => {
    fixture = await setupProject(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    await markDone(fixture, 1, 'src/a.ts');
    await markDone(fixture, 2, 'src/b.ts');
    await fs.writeFile(path.join(fixture.tmpDir, 'src', 'a.ts'), 'export const value = 2;\n');

    await runWatcherCycle(fixture.tmpDir, DEFAULT_CONFIG, fixture.adapter, fixture.logger);

    assert.deepEqual(await readAttribution(fixture, 1), { 'src/a.ts (modified)': 'unknown' });
  });

  it('records unknown when a sole candidate completion hash contradicts the tree', async () => {
    fixture = await setupProject(['src/a.ts', 'src/a.ts', 'src/c.ts']);
    await markDone(fixture, 1, 'src/a.ts');
    await markDone(fixture, 2, 'src/a.ts');
    await fs.writeFile(path.join(fixture.tmpDir, 'src', 'a.ts'), 'export const value = 3;\n');
    await appendFileChanged(fixture, 2, 'src/a.ts');

    await runWatcherCycle(fixture.tmpDir, DEFAULT_CONFIG, fixture.adapter, fixture.logger);

    assert.deepEqual(await readAttribution(fixture, 1), { 'src/a.ts (modified)': 'unknown' });
  });
});
