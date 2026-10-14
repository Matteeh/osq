import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '../src/core/foundation/config.js';
import { writeUsagePause } from '../src/core/run/usage-pause.js';
import { readInbox } from '../src/core/status/inbox-projection.js';
import { type Inbox, formatInboxText } from '../src/core/status/inbox.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN_PATH = path.join(PROJECT_ROOT, 'src', 'cli', 'bin.ts');
const TSX_LOADER = createRequire(path.join(PROJECT_ROOT, 'package.json')).resolve('tsx');
const PAUSED_UNTIL = '2099-01-01T09:30:00.000Z';
const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-paused-inbox-'));
  tmpDirs.push(root);
  return root;
}

async function writeAt(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

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
  tasks: Record<string, string>,
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
  await writeAt(folderPath, path.join('.run', 'approved'), 'sha256:fixture\n');
}

interface BinResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function runBin(cwd: string, home: string, args: string[] = []): Promise<BinResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', TSX_LOADER, BIN_PATH, ...args], {
      cwd,
      env: {
        ...process.env,
        HOME: home,
        NO_COLOR: '1',
        TSX_TSCONFIG_PATH: path.join(PROJECT_ROOT, 'packages/ui/tsconfig.runtime.json'),
      },
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

const PAUSED_ITEM = {
  change: { id: '007', title: 'Pricing' },
  task: { number: '2', title: 'Prices' },
  pausedUntil: PAUSED_UNTIL,
  command: 'osq show 007',
};

describe('Paused task', () => {
  it('lists an approved change with an active pause under Running in JSON and text', async () => {
    const repo = await tempRoot();
    const home = path.join(repo, 'home');
    const folder = await createChange(repo, '007-pricing', 'Pricing', { 2: 'Prices' });
    await approve(folder);
    await writeUsagePause(folder, { task: '2', until: PAUSED_UNTIL, source: 'harness' });

    const config = defineConfig({});
    const inbox = await readInbox(repo, {
      config,
      home,
      now: new Date('2099-01-01T00:00:00.000Z'),
    });
    assert.deepEqual(inbox.running, [PAUSED_ITEM]);

    const text = formatInboxText(inbox);
    assert.ok(
      text
        .split('\n')
        .includes(
          '  007: Pricing — task 2: Prices — paused until 2099-01-01 09:30 UTC — osq show 007',
        ),
      text,
    );

    const result = await runBin(repo, home, ['--json']);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual((JSON.parse(result.stdout) as Inbox).running, [PAUSED_ITEM]);
  });
});

describe('No item for a passed pause', () => {
  it('adds no running item once the pause has passed', async () => {
    const repo = await tempRoot();
    const home = path.join(repo, 'home');
    const folder = await createChange(repo, '007-pricing', 'Pricing', { 2: 'Prices' });
    await approve(folder);
    await writeUsagePause(folder, {
      task: '2',
      until: '2000-01-01T00:00:00.000Z',
      source: 'wait',
    });

    const config = defineConfig({});
    const inbox = await readInbox(repo, {
      config,
      home,
      now: new Date('2099-01-01T00:00:00.000Z'),
    });
    assert.deepEqual(
      inbox.running.filter((item) => item.change.id === '007'),
      [],
    );
  });
});

describe('Paused running item keys', () => {
  it('keeps live and paused running items on disjoint key sets, in change order', async () => {
    const repo = await tempRoot();
    const home = path.join(repo, 'home');
    const live = await createChange(repo, '005-running', 'Running change', { 1: 'Live task' });
    await approve(live);
    await writeAt(
      live,
      path.join('.run', 'running', '1.pid'),
      JSON.stringify({ pid: process.pid, startedAt: Date.now() - 12_000 }),
    );
    const paused = await createChange(repo, '007-pricing', 'Pricing', { 2: 'Prices' });
    await approve(paused);
    await writeUsagePause(paused, { task: '2', until: PAUSED_UNTIL, source: 'harness' });

    const config = defineConfig({});
    const inbox = await readInbox(repo, {
      config,
      home,
      now: new Date('2099-01-01T00:00:00.000Z'),
    });
    const parsed = JSON.parse(JSON.stringify(inbox)) as Inbox;

    assert.deepEqual(
      parsed.running.map((item) => item.change.id),
      ['005', '007'],
    );
    assert.deepEqual(Object.keys(parsed.running[0]), [
      'change',
      'task',
      'pid',
      'startedAt',
      'elapsedSeconds',
      'command',
    ]);
    assert.deepEqual(Object.keys(parsed.running[1]), ['change', 'task', 'pausedUntil', 'command']);
  });
});
