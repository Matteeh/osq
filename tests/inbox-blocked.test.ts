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
const REJECT_COMMAND = 'osq reject 001 --reason <text>';
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

async function createChange(root: string, folderName: string, title: string): Promise<string> {
  const dir = path.join(root, 'openspec', 'changes', folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.mkdir(path.join(dir, '.run', 'dead'), { recursive: true });
  await fs.mkdir(path.join(dir, '.run', 'results'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(title), 'utf8');
  await fs.writeFile(path.join(dir, '.run', 'approved'), 'sha256:fixture\n', 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), taskMd('Blocked task'), 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '2.md'), taskMd('Retry task'), 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '3.md'), taskMd('Unstated need'), 'utf8');
  await fs.writeFile(
    path.join(dir, '.run', 'dead', '1.md'),
    '---\nreason: blocked\n---\nNeeds more scope.\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(dir, '.run', 'dead', '2.md'),
    '---\nreason: verify_red\n---\nred\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(dir, '.run', 'dead', '3.md'),
    '---\nreason: blocked\n---\nunstated\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(dir, '.run', 'results', '1.md'),
    `## Changed\n\n- thing\n\n## Blocked\n${NEED}\n`,
    'utf8',
  );
  await fs.writeFile(path.join(dir, '.run', 'results', '3.md'), '## Changed\n\n- thing\n', 'utf8');
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
  await createChange(project, '001-blocked', 'Blocked change');
});

afterEach(async () => {
  await fs.rm(project, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
});

describe('blocked task inbox projection', () => {
  it('marks the blocked JSON item, leaves other dead items unchanged, and uses the reject command', async () => {
    const result = await runBin(project, home, ['--json']);
    assert.equal(result.code, 0, result.stderr);
    const parsed = JSON.parse(result.stdout) as Inbox;
    const [blockedItem, plainItem, unstatedItem] = parsed.needsYou as NeedsYouItem[];

    assert.deepEqual(Object.keys(blockedItem), ['kind', 'change', 'task', 'command', 'blocked']);
    assert.deepEqual(blockedItem.blocked, { need: NEED });
    assert.equal(
      JSON.stringify(blockedItem),
      JSON.stringify({
        kind: 'task-dead',
        change: { id: '001', title: 'Blocked change' },
        task: { number: '1', title: 'Blocked task' },
        command: REJECT_COMMAND,
        blocked: { need: NEED },
      }),
    );

    assert.deepEqual(Object.keys(plainItem), ['kind', 'change', 'task', 'command']);
    assert.equal('blocked' in plainItem, false);
    assert.equal(
      JSON.stringify(plainItem),
      JSON.stringify({
        kind: 'task-dead',
        change: { id: '001', title: 'Blocked change' },
        task: { number: '2', title: 'Retry task' },
        command: 'osq retry 001 2',
      }),
    );

    assert.deepEqual(unstatedItem.blocked, { need: '(not stated)' });
    assert.equal(unstatedItem.command, REJECT_COMMAND);
  });

  it('renders the collapsed need and reject-and-replan path, leaving the plain row unchanged', async () => {
    const result = await runBin(project, home);
    assert.equal(result.code, 0, result.stderr);

    const lines = result.stdout.split('\n');
    assert.ok(
      lines.includes(
        `  001: Blocked change — task 1: Blocked task — blocked: ${COLLAPSED_NEED} — reject, then osq plan --next --replan — ${REJECT_COMMAND}`,
      ),
    );
    assert.ok(lines.includes('  001: Blocked change — task 2: Retry task — osq retry 001 2'));
    assert.ok(
      lines.includes(
        '  001: Blocked change — task 3: Unstated need — blocked: (not stated) — reject, then osq plan --next --replan — osq reject 001 --reason <text>',
      ),
    );
    assert.ok(!lines.some((line) => line.includes('task 2: Retry task — blocked')));
  });
});
