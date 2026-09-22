import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { parseFrontmatter } from '../src/core/parser.js';
import { retrySpec } from '../src/core/retry.js';
import {
  SCOPE_RESOLVER_VERSION,
  computeTaskScopeHash,
  readDoneMarker,
} from '../src/core/scope-hash.js';
import { MockAdapter } from '../src/harness/mock.js';
import { checkAndArchiveSpec } from '../src/watcher/archiver.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { writeDoneMarker } from '../src/watcher/outcome.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const PASSING = 'node verify.cjs';
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
    'Exercise resolver-versioned completion migration.',
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

interface Fixture {
  tmpDir: string;
  specFolder: string;
  runDir: string;
  adapter: MockAdapter;
}

const fixtures: Fixture[] = [];

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await fs.rm(fixture.tmpDir, { recursive: true, force: true });
  }
});

async function setupProject(
  files: string[],
  tasks: { scope: string | string[]; verify?: string }[],
): Promise<Fixture> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-scope-upgrade-'));
  await installFakeValidator(tmpDir);
  await scaffoldProject(tmpDir);
  await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
  for (const file of files) {
    await fs.writeFile(path.join(tmpDir, file), 'export const value = 1;\n', 'utf8');
  }

  const specFolder = path.join(tmpDir, 'openspec', 'changes', '001-resolver-upgrade');
  await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(specFolder, 'proposal.md'), proposalMd('Resolver upgrade'), 'utf8');
  await fs.writeFile(path.join(specFolder, 'tasks.md'), tasksMd(tasks.length), 'utf8');
  for (let index = 0; index < tasks.length; index++) {
    await fs.writeFile(
      path.join(specFolder, 'tasks', `${index + 1}.md`),
      taskMd(index + 1, tasks[index].scope, tasks[index].verify ?? PASSING),
      'utf8',
    );
  }
  await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

  const fixture: Fixture = {
    tmpDir,
    specFolder,
    runDir: path.join(specFolder, '.run'),
    adapter: new MockAdapter(),
  };
  fixtures.push(fixture);
  return fixture;
}

interface LegacyDoneOptions {
  scopeHash: string;
  scopeFiles: Record<string, string | null>;
  body?: string;
  extra?: Record<string, string | number>;
}

/** Write an automated done marker in the pre-resolver (legacy) format. */
async function writeLegacyDone(
  fixture: Fixture,
  taskNumber: number,
  options: LegacyDoneOptions,
): Promise<void> {
  const lines = [
    '---',
    `scope_hash: ${JSON.stringify(options.scopeHash)}`,
    'build_stamp: "stamp-legacy"',
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
    `${lines.join('\n')}\n${options.body ?? '2025-01-01T00:00:00.000Z\n'}`,
    'utf8',
  );
}

async function readMarker(fixture: Fixture, taskNumber: number) {
  const content = await fs.readFile(
    path.join(fixture.runDir, 'regressed', `${taskNumber}.md`),
    'utf8',
  );
  return { content, data: parseFrontmatter(content).data };
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

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

describe('Resolver-versioned completion records', () => {
  it('writes scope_resolver: 2 on automated completion and leaves timestamp-only markers unchanged', async () => {
    const fixture = await setupProject(['src/a.ts'], [{ scope: 'src/a.ts' }]);

    const result = await runTask(
      fixture.tmpDir,
      fixture.specFolder,
      '1',
      DEFAULT_CONFIG,
      fixture.adapter,
    );
    assert.equal(result.success, true);

    const raw = await fs.readFile(path.join(fixture.runDir, 'done', '1'), 'utf8');
    const { data } = parseFrontmatter(raw);
    assert.equal(data.scope_resolver, SCOPE_RESOLVER_VERSION);
    assert.equal(data.exit_code, 0);
    assert.match(String(data.scope_hash), /^sha256:/);
    assert.deepEqual(Object.keys(data.scope_files as object), ['src/a.ts']);

    const recognized = await readDoneMarker(fixture.runDir, '1');
    assert.equal(recognized?.scopeResolver, SCOPE_RESOLVER_VERSION);

    // A timestamp-only manual marker stays frontmatter-free and is not recognized.
    const legacyRunDir = path.join(fixture.tmpDir, '.run-manual');
    await writeDoneMarker(legacyRunDir, '1');
    const manual = await fs.readFile(path.join(legacyRunDir, 'done', '1'), 'utf8');
    assert.ok(!manual.startsWith('---'));
    assert.equal(await readDoneMarker(legacyRunDir, '1'), null);
  });

  it('detects a version-only legacy marker with empty differing paths and resolver-upgrade context', async () => {
    const fixture = await setupProject(
      ['src/a.ts', 'src/b.ts'],
      [{ scope: 'src/a.ts' }, { scope: 'src/b.ts' }],
    );
    const current = await computeTaskScopeHash(fixture.tmpDir, ['src/a.ts']);
    await writeLegacyDone(fixture, 1, {
      scopeHash: current.hash,
      scopeFiles: current.fileHashes,
      body: '2025-02-02T00:00:00.000Z\n',
    });
    const donePath = path.join(fixture.runDir, 'done', '1');
    const doneBefore = await fs.readFile(donePath, 'utf8');

    const summary = await runWatcherCycle(fixture.tmpDir, DEFAULT_CONFIG, fixture.adapter);

    assert.equal(summary.tasksRun, 0);
    assert.deepEqual(summary.blockedByRegression, [
      { id: '001', outcome: 'blocked_by_regression', tasks: ['1'] },
    ]);
    assert.equal(
      await fs.readFile(donePath, 'utf8'),
      doneBefore,
      'legacy done marker is untouched',
    );

    const marker = await readMarker(fixture, 1);
    assert.equal(marker.data.reason, 'scope_regression');
    assert.equal(marker.data.recorded_resolver, null);
    assert.equal(marker.data.current_resolver, SCOPE_RESOLVER_VERSION);
    assert.equal(marker.data.verification_passed, true);
    assert.deepEqual(marker.data.attribution, []);

    const events = await readEvents(fixture, 1);
    const regressed = events.find((event) => event.type === 'regressed');
    assert.equal(regressed?.data?.reason, 'scope_regression');
    assert.deepEqual(regressed?.data?.differingPaths, []);
    assert.equal(regressed?.data?.recordedResolver, null);
    assert.equal(regressed?.data?.currentResolver, SCOPE_RESOLVER_VERSION);
    assert.equal(regressed?.data?.verificationPassed, true);
    assert.equal(events.filter((event) => event.type === 'verify_ran').length, 1);
  });

  it('records differing resolved glob paths alongside the resolver upgrade', async () => {
    const fixture = await setupProject(
      ['src/a.ts', 'src/b.ts'],
      [{ scope: 'src/*.ts' }, { scope: 'src/b.ts' }],
    );
    await writeLegacyDone(fixture, 1, {
      scopeHash: 'sha256:legacy-aggregate',
      scopeFiles: { 'src/*.ts': 'sha256:legacy-file' },
    });

    await runWatcherCycle(fixture.tmpDir, DEFAULT_CONFIG, fixture.adapter);

    const marker = await readMarker(fixture, 1);
    assert.equal(marker.data.recorded_resolver, null);
    assert.equal(marker.data.current_resolver, SCOPE_RESOLVER_VERSION);
    const expectedPaths = ['src/*.ts (deleted)', 'src/a.ts (added)', 'src/b.ts (added)'];
    for (const differingPath of expectedPaths) {
      assert.ok(marker.content.includes(differingPath), `marker mentions ${differingPath}`);
    }

    const events = await readEvents(fixture, 1);
    const regressed = events.find((event) => event.type === 'regressed');
    assert.deepEqual(regressed?.data?.differingPaths, expectedPaths);
    assert.equal(regressed?.data?.recordedResolver, null);
    assert.equal(regressed?.data?.currentResolver, SCOPE_RESOLVER_VERSION);
  });

  it('keeps repeated watcher cycles idempotent for an active version regression', async () => {
    const fixture = await setupProject(
      ['src/a.ts', 'src/b.ts'],
      [{ scope: 'src/a.ts' }, { scope: 'src/b.ts' }],
    );
    const current = await computeTaskScopeHash(fixture.tmpDir, ['src/a.ts']);
    await writeLegacyDone(fixture, 1, { scopeHash: current.hash, scopeFiles: current.fileHashes });

    await runWatcherCycle(fixture.tmpDir, DEFAULT_CONFIG, fixture.adapter);
    const markerBefore = await fs.readFile(path.join(fixture.runDir, 'regressed', '1.md'), 'utf8');
    const eventsBefore = await readEvents(fixture, 1);

    const summary = await runWatcherCycle(fixture.tmpDir, DEFAULT_CONFIG, fixture.adapter);

    assert.equal(summary.tasksRun, 0);
    assert.deepEqual(summary.blockedByRegression, []);
    assert.equal(
      await fs.readFile(path.join(fixture.runDir, 'regressed', '1.md'), 'utf8'),
      markerBefore,
      'no duplicate marker write',
    );
    assert.deepEqual(await readEvents(fixture, 1), eventsBefore, 'no duplicate events');
  });

  it('freshly recertifies a version-stale task after explicit retry', async () => {
    const fixture = await setupProject(
      ['src/a.ts', 'src/b.ts'],
      [{ scope: 'src/a.ts' }, { scope: 'src/b.ts' }],
    );
    const current = await computeTaskScopeHash(fixture.tmpDir, ['src/a.ts']);
    await writeLegacyDone(fixture, 1, {
      scopeHash: current.hash,
      scopeFiles: current.fileHashes,
      body: 'KEEP-BODY\n',
      extra: { custom_note: 'keep-me' },
    });

    await runWatcherCycle(fixture.tmpDir, DEFAULT_CONFIG, fixture.adapter);
    assert.ok(await exists(path.join(fixture.runDir, 'regressed', '1.md')));

    const result = await retrySpec(fixture.tmpDir, '001', '1', DEFAULT_CONFIG);

    assert.equal(result.recertification, 'passed');
    const done = parseFrontmatter(
      await fs.readFile(path.join(fixture.runDir, 'done', '1'), 'utf8'),
    );
    assert.equal(done.body, 'KEEP-BODY\n', 'completion body preserved');
    assert.equal(done.data.build_stamp, 'stamp-legacy');
    assert.equal(done.data.exit_code, 0);
    assert.equal(done.data.custom_note, 'keep-me');
    assert.equal(done.data.original_scope_hash, current.hash);
    assert.equal(done.data.recertification_count, 1);
    assert.equal(done.data.scope_resolver, SCOPE_RESOLVER_VERSION);
    const refreshed = await computeTaskScopeHash(fixture.tmpDir, ['src/a.ts']);
    assert.equal(done.data.scope_hash, refreshed.hash);
    assert.deepEqual(done.data.scope_files, refreshed.fileHashes);

    // The refreshed resolver-2 marker is no longer stale, so the next task runs.
    const summary = await runWatcherCycle(fixture.tmpDir, DEFAULT_CONFIG, fixture.adapter);
    assert.deepEqual(summary.blockedByRegression, []);
    assert.equal(summary.tasksRun, 1);
    assert.equal(await exists(path.join(fixture.runDir, 'regressed', '1.md')), false);
  });

  it('leaves archived markers untouched and does not scan them', async () => {
    const fixture = await setupProject(
      ['src/a.ts', 'src/b.ts'],
      [{ scope: 'src/a.ts' }, { scope: 'src/b.ts' }],
    );
    const current = await computeTaskScopeHash(fixture.tmpDir, ['src/a.ts']);
    await writeLegacyDone(fixture, 1, { scopeHash: current.hash, scopeFiles: current.fileHashes });

    const archiveRunDir = path.join(
      fixture.tmpDir,
      'openspec',
      'changes',
      'archive',
      '000-legacy',
      '.run',
    );
    await fs.mkdir(path.join(archiveRunDir, 'done'), { recursive: true });
    const archivedMarker = '---\nscope_hash: "sha256:archived"\nscope_files: {}\n---\nOLD\n';
    const archivedPath = path.join(archiveRunDir, 'done', '1');
    await fs.writeFile(archivedPath, archivedMarker, 'utf8');

    await runWatcherCycle(fixture.tmpDir, DEFAULT_CONFIG, fixture.adapter);

    assert.equal(await fs.readFile(archivedPath, 'utf8'), archivedMarker);
    assert.equal(await exists(path.join(archiveRunDir, 'regressed', '1.md')), false);
    assert.equal(await exists(path.join(archiveRunDir, 'events', '1.jsonl')), false);
  });

  it('treats wrong and malformed resolver versions as stale while excluding manual markers', async () => {
    const fixture = await setupProject(
      ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'],
      [{ scope: 'src/a.ts' }, { scope: 'src/b.ts' }, { scope: 'src/c.ts' }, { scope: 'src/d.ts' }],
    );
    const b = await computeTaskScopeHash(fixture.tmpDir, ['src/b.ts']);
    const c = await computeTaskScopeHash(fixture.tmpDir, ['src/c.ts']);
    await fs.mkdir(path.join(fixture.runDir, 'done'), { recursive: true });
    await fs.writeFile(
      path.join(fixture.runDir, 'done', '1'),
      `---\nmanual: true\nreason: human decided\n---\n${new Date().toISOString()}\n`,
      'utf8',
    );
    await writeLegacyDone(fixture, 2, {
      scopeHash: b.hash,
      scopeFiles: b.fileHashes,
      extra: { scope_resolver: 3 },
    });
    await writeLegacyDone(fixture, 3, {
      scopeHash: c.hash,
      scopeFiles: c.fileHashes,
      extra: { scope_resolver: '2' },
    });

    const summary = await runWatcherCycle(fixture.tmpDir, DEFAULT_CONFIG, fixture.adapter);

    assert.deepEqual(summary.blockedByRegression, [
      { id: '001', outcome: 'blocked_by_regression', tasks: ['2', '3'] },
    ]);
    assert.equal(await exists(path.join(fixture.runDir, 'regressed', '1.md')), false);
    assert.equal((await readMarker(fixture, 2)).data.recorded_resolver, 3);
    assert.equal((await readMarker(fixture, 3)).data.recorded_resolver, null);
  });

  it('blocks the pre-archive audit for a version-stale completion', async () => {
    const fixture = await setupProject(['src/a.ts'], [{ scope: 'src/a.ts' }]);
    const current = await computeTaskScopeHash(fixture.tmpDir, ['src/a.ts']);
    await writeLegacyDone(fixture, 1, { scopeHash: current.hash, scopeFiles: current.fileHashes });

    const archived = await checkAndArchiveSpec(fixture.tmpDir, fixture.specFolder, DEFAULT_CONFIG);

    assert.equal(archived, false);
    assert.equal(await exists(path.join(fixture.runDir, 'regressed', '1.md')), true);
    assert.equal(await exists(fixture.specFolder), true, 'change folder remains active');
  });

  it('requeues a failed recertification without leaving a canonical done marker', async () => {
    const fixture = await setupProject(
      ['src/a.ts', 'src/b.ts'],
      [{ scope: 'src/a.ts' }, { scope: 'src/b.ts' }],
    );
    const current = await computeTaskScopeHash(fixture.tmpDir, ['src/a.ts']);
    await writeLegacyDone(fixture, 1, { scopeHash: current.hash, scopeFiles: current.fileHashes });

    await runWatcherCycle(fixture.tmpDir, DEFAULT_CONFIG, fixture.adapter);
    // The human's explicit retry finds the verify red; the task must go back to agent work.
    await fs.writeFile(path.join(fixture.tmpDir, 'verify.cjs'), 'process.exit(5);\n', 'utf8');

    const result = await retrySpec(fixture.tmpDir, '001', '1', DEFAULT_CONFIG);

    assert.equal(result.recertification, 'requeued');
    assert.equal(await exists(path.join(fixture.runDir, 'done', '1')), false);
    assert.equal(await exists(path.join(fixture.runDir, 'done', '1.1')), true);
    assert.equal(await exists(path.join(fixture.runDir, 'regressed', '1.1.md')), true);
    const recertification = (await readEvents(fixture, 1)).find(
      (event) => event.type === 'recertification',
    );
    assert.equal(recertification?.data?.outcome, 'requeued');
  });
});

describe('Resolver upgrade guidance', () => {
  it('documents exactly one Upgrading note with the detection and retry contract', async () => {
    const readmePath = path.resolve(fileURLToPath(new URL('..', import.meta.url)), 'README.md');
    const readme = await fs.readFile(readmePath, 'utf8');

    const headings = [...readme.matchAll(/^#{1,6}[ \t]+Upgrading\b.*$/gm)];
    assert.equal(headings.length, 1, 'exactly one Upgrading section');

    const start = headings[0].index ?? 0;
    const rest = readme.slice(start + headings[0][0].length);
    const nextHeading = rest.search(/^#{1,6}[ \t]+\S/m);
    const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);

    assert.match(section, /resolver 2/i);
    assert.match(section, /verif/i);
    assert.match(section, /osq retry <id> <task>/);
    assert.match(section, /archive/i);
  });
});
