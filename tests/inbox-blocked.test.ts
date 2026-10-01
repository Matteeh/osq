import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Inbox, NeedsYouItem } from '../src/core/status/inbox.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN_PATH = path.join(PROJECT_ROOT, 'src', 'cli', 'bin.ts');
const TSX_LOADER = createRequire(path.join(PROJECT_ROOT, 'package.json')).resolve('tsx');
const NEED = 'Needs src/b.ts in scope.\nInstall b first.';
const COLLAPSED_NEED = 'Needs src/b.ts in scope. Install b first.';

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
  taskTitle: string,
  reason: string,
  result: string | null,
): Promise<string> {
  const dir = path.join(root, 'openspec', 'changes', folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.mkdir(path.join(dir, '.run', 'dead'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(title), 'utf8');
  await fs.writeFile(path.join(dir, '.run', 'approved'), 'sha256:fixture\n', 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), taskMd(taskTitle), 'utf8');
  await fs.writeFile(
    path.join(dir, '.run', 'dead', '1.md'),
    `---\nreason: ${reason}\n---\nbody\n`,
    'utf8',
  );
  if (result !== null) {
    await fs.mkdir(path.join(dir, '.run', 'results'), { recursive: true });
    await fs.writeFile(path.join(dir, '.run', 'results', '1.md'), result, 'utf8');
  }
  return dir;
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

let project: string;
let home: string;

beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-blocked-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-blocked-home-'));
  await createChange(
    project,
    '001-blocked',
    'Blocked change',
    'Blocked task',
    'blocked',
    `## Changed\n\n- thing\n\n## Blocked\n${NEED}\n`,
  );
  await createChange(project, '002-plain', 'Plain change', 'Retry task', 'verify_red', null);
  await createChange(project, '003-unstated', 'Unstated change', 'Unstated task', 'blocked', null);
});

afterEach(async () => {
  await fs.rm(project, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
});

describe('blocked task inbox projection', () => {
  it('marks the blocked item, leaves a non-trigger dead item unchanged, and commands plan', async () => {
    const result = await runBin(project, home, ['--json']);
    assert.equal(result.code, 0, result.stderr);
    const parsed = JSON.parse(result.stdout) as Inbox;
    const [blockedItem, plainItem, unstatedItem] = parsed.needsYou as NeedsYouItem[];

    assert.deepEqual(Object.keys(blockedItem), [
      'kind',
      'change',
      'task',
      'command',
      'steering',
      'blocked',
    ]);
    assert.deepEqual(blockedItem.steering, { trigger: 'blocked', reason: 'blocked' });
    assert.deepEqual(blockedItem.blocked, { need: NEED });
    assert.equal(
      JSON.stringify(blockedItem),
      JSON.stringify({
        kind: 'task-dead',
        change: { id: '001', title: 'Blocked change' },
        task: { number: '1', title: 'Blocked task' },
        command: 'osq plan 001',
        steering: { trigger: 'blocked', reason: 'blocked' },
        blocked: { need: NEED },
      }),
    );

    assert.deepEqual(Object.keys(plainItem), ['kind', 'change', 'task', 'command']);
    assert.equal('blocked' in plainItem, false);
    assert.equal('steering' in plainItem, false);
    assert.equal(
      JSON.stringify(plainItem),
      JSON.stringify({
        kind: 'task-dead',
        change: { id: '002', title: 'Plain change' },
        task: { number: '1', title: 'Retry task' },
        command: 'osq retry 002 1',
      }),
    );

    assert.deepEqual(unstatedItem.blocked, { need: '(not stated)' });
    assert.deepEqual(unstatedItem.steering, { trigger: 'blocked', reason: 'blocked' });
    assert.equal(unstatedItem.command, 'osq plan 003');
  });

  it('renders the steering rows with the collapsed need and the plan command', async () => {
    const result = await runBin(project, home);
    assert.equal(result.code, 0, result.stderr);

    const lines = result.stdout.split('\n');
    assert.ok(
      lines.includes(
        `  001: Blocked change — task 1: Blocked task — needs steering: blocked (blocked): ${COLLAPSED_NEED} — osq plan 001`,
      ),
    );
    assert.ok(lines.includes('  002: Plain change — task 1: Retry task — osq retry 002 1'));
    assert.ok(
      lines.includes(
        '  003: Unstated change — task 1: Unstated task — needs steering: blocked (blocked): (not stated) — osq plan 003',
      ),
    );
    assert.ok(!lines.some((line) => line.includes('reject, then osq plan --next --replan')));
  });
});
