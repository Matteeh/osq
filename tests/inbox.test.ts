import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLastLook, resolveLastLookPath, writeLastLook } from '../src/cli/inbox.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import {
  type Inbox,
  collectLandedItems,
  formatInboxText,
  projectInbox,
  projectNeedsYou,
  projectRunning,
} from '../src/core/inbox.js';
import { formatDuration } from '../src/core/report.js';
import { getStatusOverview } from '../src/core/status.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_INBOX = path.join(PROJECT_ROOT, 'fixture', 'inbox');
const BIN_PATH = path.join(PROJECT_ROOT, 'src', 'cli', 'bin.ts');
const TSX_LOADER = createRequire(path.join(PROJECT_ROOT, 'package.json')).resolve('tsx');
const STALE_PID = 2147483646;

function proposalMd(title: string): string {
  return ['---', `title: ${title}`, 'depends_on: []', '---', '## Goal', `${title} goal.`, ''].join(
    '\n',
  );
}

function taskMd(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'verify: node -e "process.exit(0)"',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    `- [ ] ${title} criterion`,
    '',
  ].join('\n');
}

async function createChange(
  root: string,
  folderName: string,
  title: string,
  tasks: Record<string, string> = { 1: 'Task one' },
): Promise<string> {
  const dir = path.join(root, 'openspec', 'changes', folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(title), 'utf8');
  for (const [number, taskTitle] of Object.entries(tasks)) {
    await fs.writeFile(path.join(dir, 'tasks', `${number}.md`), taskMd(taskTitle), 'utf8');
  }
  return dir;
}

async function approve(folderPath: string): Promise<void> {
  await fs.mkdir(path.join(folderPath, '.run'), { recursive: true });
  await fs.writeFile(path.join(folderPath, '.run', 'approved'), 'sha256:fixture\n', 'utf8');
}

async function writeMarker(folderPath: string, rel: string, content: string): Promise<void> {
  const target = path.join(folderPath, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function createArchived(root: string, folderName: string, iso: string): Promise<string> {
  const dir = path.join(root, 'openspec', 'changes', 'archive', folderName);
  await fs.mkdir(path.join(dir, '.run', 'events'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(folderName), 'utf8');
  await fs.writeFile(
    path.join(dir, '.run', 'events', 'change.jsonl'),
    `${JSON.stringify({ type: 'archived', timestamp: iso, data: { archivePath: dir } })}\n`,
    'utf8',
  );
  return dir;
}

async function treeSnapshot(root: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile())
        snapshot.set(path.relative(root, full), await fs.readFile(full, 'utf8'));
    }
  };
  await walk(root);
  return snapshot;
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('inbox needs-you projection', () => {
  it('projects every attention kind once in change/task order with exact commands', async () => {
    await createChange(tmpDir, '001-unapproved', 'Unapproved change');
    const dead = await createChange(tmpDir, '002-dead', 'Dead change', {
      1: 'First dead',
      2: 'Second dead',
    });
    await approve(dead);
    await writeMarker(dead, '.run/dead/1.md', '---\nreason: verify_red\n---\nbad\n');
    await writeMarker(dead, '.run/dead/2.md', '---\nreason: crashed\n---\nbad\n');

    const regressed = await createChange(tmpDir, '003-regressed', 'Regressed change');
    await approve(regressed);
    await writeMarker(regressed, '.run/regressed/1.md', '---\nreason: verify_red\n---\nbad\n');

    const changeRegressed = await createChange(tmpDir, '004-change', 'Change regression');
    await approve(changeRegressed);
    await writeMarker(
      changeRegressed,
      '.run/regressed/change.md',
      '---\nreason: verify_red\n---\nx\n',
    );

    const overview = await getStatusOverview(tmpDir, DEFAULT_CONFIG);
    const items = projectNeedsYou(overview);

    assert.deepEqual(
      items.map((item) => item.kind),
      ['approval', 'task-dead', 'task-dead', 'task-regressed', 'change-regressed'],
    );
    assert.deepEqual(
      items.map((item) => item.change.id),
      ['001', '002', '002', '003', '004'],
    );
    assert.deepEqual(
      items.map((item) => item.command),
      [
        'osq approve 001',
        'osq retry 002 1',
        'osq retry 002 2',
        'osq retry 003 1',
        'osq reject 004 --reason <text>',
      ],
    );
    assert.equal(items[0].task, null);
    assert.deepEqual(items[1].task, { number: '1', title: 'First dead' });
    assert.equal(items[4].task, null);
  });

  it('ignores a change without proposal.md', async () => {
    const legacy = path.join(tmpDir, 'openspec', 'changes', '005-legacy');
    await fs.mkdir(legacy, { recursive: true });
    await fs.writeFile(path.join(legacy, 'spec.md'), proposalMd('Legacy change'), 'utf8');

    const overview = await getStatusOverview(tmpDir, DEFAULT_CONFIG);
    assert.deepEqual(projectNeedsYou(overview), []);
  });
});

describe('inbox running projection', () => {
  it('includes only derived running tasks whose parsed lock PID is live and leaves markers', async () => {
    const change = await createChange(tmpDir, '005-running', 'Running change', {
      1: 'Live task',
      2: 'Stale task',
    });
    await approve(change);
    const startedAt = Date.now() - 12_000;
    await writeMarker(
      change,
      '.run/running/1.pid',
      JSON.stringify({ pid: process.pid, startedAt }),
    );
    await writeMarker(
      change,
      '.run/running/2.pid',
      JSON.stringify({ pid: STALE_PID, startedAt: startedAt - 60_000 }),
    );

    const overview = await getStatusOverview(tmpDir, DEFAULT_CONFIG);
    const items = projectRunning(overview, Date.now());

    assert.equal(items.length, 1);
    assert.equal(items[0].change.id, '005');
    assert.equal(items[0].task.number, '1');
    assert.equal(items[0].pid, process.pid);
    assert.equal(items[0].startedAt, new Date(startedAt).toISOString());
    assert.ok(Number.isInteger(items[0].elapsedSeconds));
    assert.ok(items[0].elapsedSeconds >= 0);
    assert.equal(items[0].command, 'osq show 005');

    // The stale lock is neither reaped nor rewritten.
    const stale = await fs.readFile(path.join(change, '.run', 'running', '2.pid'), 'utf8');
    assert.equal(JSON.parse(stale).pid, STALE_PID);
  });

  it('omits malformed or non-finite locks without creating a running item', async () => {
    const change = await createChange(tmpDir, '006-malformed', 'Malformed change');
    await approve(change);

    await writeMarker(change, '.run/running/1.pid', 'not-json');
    let overview = await getStatusOverview(tmpDir, DEFAULT_CONFIG);
    assert.deepEqual(projectRunning(overview, Date.now()), []);

    await writeMarker(change, '.run/running/1.pid', '{"pid":1,"startedAt":1e999}');
    overview = await getStatusOverview(tmpDir, DEFAULT_CONFIG);
    assert.deepEqual(projectRunning(overview, Date.now()), []);
  });
});

describe('inbox landed projection and cursor', () => {
  it('selects strictly later archives with a valid cursor and newest ten otherwise', async () => {
    const archiveDir = path.join(tmpDir, 'openspec', 'changes', 'archive');
    const times = [
      ['010-one', '2026-01-01T00:00:01.000Z'],
      ['011-two', '2026-01-01T00:00:02.000Z'],
      ['012-three', '2026-01-01T00:00:03.000Z'],
    ] as const;
    for (const [folder, iso] of times) await createArchived(tmpDir, folder, iso);
    // Invalid streams are never eligible, even though the folders exist.
    await createArchived(tmpDir, '013-missing-event', '2026-01-01T00:00:04.000Z');
    await fs.writeFile(
      path.join(archiveDir, '013-missing-event', '.run', 'events', 'change.jsonl'),
      'not-json\n',
      'utf8',
    );

    const all = await collectLandedItems(archiveDir, null);
    assert.deepEqual(
      all.map((item) => item.change.id),
      ['012', '011', '010'],
    );
    assert.equal(all[0].archivedAt, '2026-01-01T00:00:03.000Z');
    assert.equal(all[0].command, 'osq show 012');

    const later = await collectLandedItems(archiveDir, Date.parse('2026-01-01T00:00:01.000Z'));
    assert.deepEqual(
      later.map((item) => item.change.id),
      ['012', '011'],
    );

    for (let i = 0; i < 12; i++) {
      const iso = new Date(Date.UTC(2026, 1, 1, 0, 0, i)).toISOString();
      await createArchived(tmpDir, `100-many-${String(i).padStart(2, '0')}`, iso);
    }
    const fallback = await collectLandedItems(archiveDir, null, 10);
    assert.equal(fallback.length, 10);
  });

  it('keys the cursor by sha256(realpath) and tolerates missing, malformed, or invalid content', async () => {
    const home = path.join(tmpDir, 'home');
    const real = await fs.realpath(tmpDir);
    const expected = path.join(
      home,
      '.osq',
      'last-look',
      `${createHash('sha256').update(real, 'utf8').digest('hex')}.json`,
    );
    assert.equal(await resolveLastLookPath(tmpDir, home), expected);

    assert.equal(await readLastLook(tmpDir, home), null);

    const iso = '2026-03-04T05:06:07.000Z';
    await writeLastLook(tmpDir, iso, home);
    assert.equal(await readLastLook(tmpDir, home), Date.parse(iso));
    assert.equal(JSON.parse(await fs.readFile(expected, 'utf8')).lastLook, iso);

    await fs.writeFile(expected, 'not-json', 'utf8');
    assert.equal(await readLastLook(tmpDir, home), null);

    await fs.writeFile(expected, JSON.stringify({ lastLook: 'not-a-date' }), 'utf8');
    assert.equal(await readLastLook(tmpDir, home), null);
  });
});

describe('inbox text and JSON contract', () => {
  it('collapses a completely empty inbox to exactly Inbox empty.', () => {
    const inbox: Inbox = { needsYou: [], running: [], landed: [] };
    assert.equal(formatInboxText(inbox), 'Inbox empty.');
  });

  it('renders all groups with one (none) line per empty group and command-terminated rows', async () => {
    const change = await createChange(tmpDir, '001-unapproved', 'Unapproved change');
    await approve(change);
    await writeMarker(change, '.run/regressed/change.md', '---\nreason: verify_red\n---\nx\n');
    await writeMarker(
      change,
      '.run/running/1.pid',
      JSON.stringify({ pid: process.pid, startedAt: Date.now() - 5000 }),
    );

    const overview = await getStatusOverview(tmpDir, DEFAULT_CONFIG);
    const inbox = projectInbox(overview, [], Date.now());
    const lines = formatInboxText(inbox).split('\n');

    assert.equal(lines[0], 'Needs you');
    assert.equal(
      lines[1],
      '  001: Unapproved change — change regressed — osq reject 001 --reason <text>',
    );
    assert.ok(lines.includes('Running'));
    const runningRow = lines.find((line) => line.includes('osq show 001')) as string;
    assert.ok(runningRow.endsWith('osq show 001'));
    assert.ok(runningRow.includes(formatDuration(inbox.running[0].elapsedSeconds * 1000)));
    assert.equal(lines[lines.length - 1], '  (none)');
  });

  it('exposes exactly the documented JSON keys and value types', async () => {
    const change = await createChange(tmpDir, '001-unapproved', 'Unapproved change');
    await approve(change);
    await writeMarker(change, '.run/dead/1.md', '---\nreason: verify_red\n---\nx\n');
    await createArchived(tmpDir, '002-archived', '2026-01-01T00:00:01.000Z');

    const overview = await getStatusOverview(tmpDir, DEFAULT_CONFIG);
    const landed = await collectLandedItems(
      path.join(tmpDir, 'openspec', 'changes', 'archive'),
      null,
    );
    const inbox = projectInbox(overview, landed, Date.now());
    const parsed = JSON.parse(JSON.stringify(inbox)) as Inbox;

    assert.deepEqual(Object.keys(parsed), ['needsYou', 'running', 'landed']);
    assert.deepEqual(Object.keys(parsed.needsYou[0]), ['kind', 'change', 'task', 'command']);
    assert.deepEqual(Object.keys(parsed.needsYou[0].change), ['id', 'title']);
    assert.deepEqual(Object.keys(parsed.needsYou[0].task as object), ['number', 'title']);
    assert.deepEqual(Object.keys(parsed.landed[0]), ['change', 'archivedAt', 'command']);
  });
});

interface BinResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function runBin(cwd: string, home: string, args: string[] = []): Promise<BinResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', TSX_LOADER, BIN_PATH, ...args], {
      cwd,
      env: { ...process.env, HOME: home, NO_COLOR: '1' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}

async function copyFixture(): Promise<string> {
  const dest = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-fixture-'));
  await fs.cp(FIXTURE_INBOX, dest, { recursive: true });
  return dest;
}

async function setLiveLock(projectRoot: string): Promise<number> {
  const startedAt = Date.now() - 12_000;
  const lockPath = path.join(
    projectRoot,
    'openspec',
    'changes',
    '005-running-mixed',
    '.run',
    'running',
    '1.pid',
  );
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  await fs.writeFile(lockPath, JSON.stringify({ pid: process.pid, startedAt }), 'utf8');
  return startedAt;
}

describe('bare osq CLI inbox integration', () => {
  const created: string[] = [];

  afterEach(async () => {
    await Promise.all(created.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  async function fixtureWithHome(): Promise<{ project: string; home: string }> {
    const project = await copyFixture();
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-home-'));
    created.push(project, home);
    return { project, home };
  }

  it('renders text, advances and deletes the cursor, caps fallback at ten, and preserves change folders', async () => {
    const { project, home } = await fixtureWithHome();
    await setLiveLock(project);
    const before = await treeSnapshot(path.join(project, 'openspec', 'changes'));

    const first = await runBin(project, home);
    assert.equal(first.code, 0, first.stderr);
    assert.ok(first.stdout.includes('Needs you'));
    assert.ok(first.stdout.includes('Running'));
    assert.ok(first.stdout.includes('Landed since last look'));
    assert.ok(first.stdout.includes('osq approve 001'));
    assert.ok(first.stdout.includes('osq retry 002 1'));
    assert.ok(first.stdout.includes('osq retry 003 1'));
    assert.ok(first.stdout.includes('osq reject 004 --reason <text>'));

    // Only the live lock projects; the stale lock stays visible in status space.
    const lines = first.stdout.split('\n');
    const runningSection = lines
      .slice(lines.indexOf('Running') + 1, lines.indexOf('Landed since last look'))
      .join('\n');
    assert.ok(runningSection.includes('task 1'));
    assert.ok(runningSection.includes('osq show 005'));
    assert.ok(!runningSection.includes('task 2'));
    const landedRows = first.stdout.split('\n').filter((line) => line.includes('archived 2026'));
    assert.equal(landedRows.length, 10);

    const cursorPath = await resolveLastLookPath(project, home);
    const cursor = JSON.parse(await fs.readFile(cursorPath, 'utf8')) as { lastLook: string };
    assert.ok(Number.isFinite(Date.parse(cursor.lastLook)));

    const after = await treeSnapshot(path.join(project, 'openspec', 'changes'));
    assert.deepEqual([...after.entries()].sort(), [...before.entries()].sort());

    const second = await runBin(project, home);
    const secondLanded = second.stdout.split('Landed since last look')[1].trim();
    assert.equal(secondLanded, '(none)');

    await fs.rm(cursorPath, { force: true });
    const reset = await runBin(project, home, ['--json']);
    const parsed = JSON.parse(reset.stdout) as Inbox;
    assert.equal(parsed.landed.length, 10);
    assert.equal(parsed.running.length, 1);
    assert.equal(parsed.running[0].pid, process.pid);
    assert.ok(Number.isInteger(parsed.running[0].elapsedSeconds));
    assert.ok(parsed.running[0].elapsedSeconds >= 0);
  });

  it('emits exactly the documented JSON object for --json', async () => {
    const { project, home } = await fixtureWithHome();
    await setLiveLock(project);

    const result = await runBin(project, home, ['--json']);
    assert.equal(result.code, 0, result.stderr);
    const parsed = JSON.parse(result.stdout) as Inbox;

    assert.deepEqual(Object.keys(parsed), ['needsYou', 'running', 'landed']);
    assert.deepEqual(
      parsed.needsYou.map((item) => item.kind),
      ['approval', 'task-dead', 'task-regressed', 'change-regressed'],
    );
    assert.equal(parsed.landed.length, 10);

    for (const item of parsed.needsYou) {
      assert.deepEqual(Object.keys(item), ['kind', 'change', 'task', 'command']);
      assert.deepEqual(Object.keys(item.change), ['id', 'title']);
      if (item.kind === 'approval' || item.kind === 'change-regressed')
        assert.equal(item.task, null);
      else assert.deepEqual(Object.keys(item.task as object), ['number', 'title']);
    }
    for (const item of parsed.running) {
      assert.deepEqual(Object.keys(item), [
        'change',
        'task',
        'pid',
        'startedAt',
        'elapsedSeconds',
        'command',
      ]);
      assert.equal(item.command, 'osq show 005');
    }
    for (const item of parsed.landed) {
      assert.deepEqual(Object.keys(item), ['change', 'archivedAt', 'command']);
      assert.ok(Number.isFinite(Date.parse(item.archivedAt)));
    }
  });

  it('materializes the missing runtime lock directory from clean tracked fixture state', async () => {
    const { project, home } = await fixtureWithHome();
    const runningDir = path.join(
      project,
      'openspec',
      'changes',
      '005-running-mixed',
      '.run',
      'running',
    );
    // A clean checkout has no tracked directory for ignored runtime locks.
    await fs.rm(runningDir, { recursive: true, force: true });

    const startedAt = await setLiveLock(project);

    // Setup recreates the directory recursively and keeps the existing payload.
    const lock = JSON.parse(await fs.readFile(path.join(runningDir, '1.pid'), 'utf8')) as {
      pid: number;
      startedAt: number;
    };
    assert.equal(lock.pid, process.pid);
    assert.equal(lock.startedAt, startedAt);

    const result = await runBin(project, home, ['--json']);
    assert.equal(result.code, 0, result.stderr);
    const parsed = JSON.parse(result.stdout) as Inbox;
    assert.equal(parsed.running.length, 1);
    assert.equal(parsed.running[0].change.id, '005');
    assert.equal(parsed.running[0].pid, process.pid);
  });

  it('prints exactly Inbox empty. for an empty project', async () => {
    const project = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-empty-'));
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-empty-home-'));
    created.push(project, home);

    const result = await runBin(project, home);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'Inbox empty.');
  });

  it('keeps explicit status complete and report --json scoped without advancing the cursor', async () => {
    const { project, home } = await fixtureWithHome();

    const status = await runBin(project, home, ['status']);
    assert.equal(status.code, 0, status.stderr);
    assert.ok(status.stdout.includes('Active specs:'));
    assert.ok(status.stdout.includes('001-unapproved-proposal: Unapproved Proposal [unapproved]'));
    assert.ok(status.stdout.includes('Archived specs: 11'));
    assert.ok(status.stdout.includes('Rejected specs:'));

    const report = await runBin(project, home, ['report', '--json']);
    assert.ok(report.stdout.trimStart().startsWith('{'));

    const cursorPath = await resolveLastLookPath(project, home);
    await assert.rejects(() => fs.stat(cursorPath));
  });
});
