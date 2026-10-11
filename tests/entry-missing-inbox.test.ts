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
const TITLE = 'Missing entry change';
const TASK_TITLE = 'Missing entry task';
const NEED = 'missing entry files src/gone.ts, src/old.ts';
const DEAD_BODY = [
  "The task's entry names files that do not exist:",
  '- src/gone.ts',
  '- src/old.ts',
  'Revise the plan with osq plan 001, then approve it again.',
  '',
].join('\n');

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
): Promise<string> {
  const dir = path.join(root, 'openspec', 'changes', folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.mkdir(path.join(dir, '.run', 'dead'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(title), 'utf8');
  await fs.writeFile(path.join(dir, '.run', 'approved'), 'sha256:fixture\n', 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), taskMd(taskTitle), 'utf8');
  await fs.writeFile(
    path.join(dir, '.run', 'dead', '1.md'),
    `---\nreason: entry_missing\n---\n${DEAD_BODY}`,
    'utf8',
  );
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
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-entry-missing-inbox-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-entry-missing-inbox-home-'));
  await createChange(project, '001-gone', TITLE, TASK_TITLE);
});

afterEach(async () => {
  await fs.rm(project, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
});

describe('Missing entry file in the inbox', () => {
  it('carries the missing entry files as the blocked need and commands plan', async () => {
    const result = await runBin(project, home, ['--json']);
    assert.equal(result.code, 0, result.stderr);
    const parsed = JSON.parse(result.stdout) as Inbox;
    const [item] = parsed.needsYou as NeedsYouItem[];

    assert.deepEqual(item?.blocked, { need: NEED });
    assert.deepEqual(item?.steering, { trigger: 'blocked', reason: 'entry_missing' });
    assert.equal(item?.command, 'osq plan 001');
    assert.equal(item?.kind, 'task-dead');
    assert.equal(item?.task?.number, '1');
  });

  it('renders the text row with the missing entry files', async () => {
    const result = await runBin(project, home);
    assert.equal(result.code, 0, result.stderr);

    const lines = result.stdout.split('\n');
    assert.ok(
      lines.some((line) =>
        line.endsWith(`needs steering: blocked (entry_missing): ${NEED} — osq plan 001`),
      ),
      result.stdout,
    );
  });
});
