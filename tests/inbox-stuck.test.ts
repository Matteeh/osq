import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import type { Inbox, NeedsYouItem } from '../src/core/status/inbox.js';
import { getStatusOverview } from '../src/core/status/status.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN_PATH = path.join(PROJECT_ROOT, 'src', 'cli', 'bin.ts');
const TSX_LOADER = createRequire(path.join(PROJECT_ROOT, 'package.json')).resolve('tsx');
const FINGERPRINT = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';

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
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(title), 'utf8');
  await fs.writeFile(path.join(dir, '.run', 'approved'), 'sha256:fixture\n', 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), taskMd('First dead'), 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '2.md'), taskMd('Second dead'), 'utf8');
  await fs.writeFile(
    path.join(dir, '.run', 'dead', '1.md'),
    `---\nreason: verify_red\nstuck: true\nfingerprint: ${FINGERPRINT}\n---\nbad\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(dir, '.run', 'dead', '2.md'),
    '---\nreason: crashed\n---\nbad\n',
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

const PLAIN_ITEM = {
  kind: 'task-dead',
  change: { id: '002', title: 'Dead change' },
  task: { number: '2', title: 'Second dead' },
  command: 'osq retry 002 2',
};

let project: string;
let home: string;

beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-stuck-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-stuck-home-'));
  await createChange(project, '002-dead', 'Dead change');
});

afterEach(async () => {
  await fs.rm(project, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
});

describe('stuck task inbox projection', () => {
  it('derives stuck only for the marker carrying stuck and a fingerprint', async () => {
    const overview = await getStatusOverview(project, DEFAULT_CONFIG);
    const [stuckTask, plainTask] = overview.specs[0].tasks;
    assert.equal(stuckTask.stuck, FINGERPRINT);
    assert.equal(plainTask.stuck, undefined);
  });

  it('marks the stuck JSON item and leaves the plain item byte-identical', async () => {
    const result = await runBin(project, home, ['--json']);
    assert.equal(result.code, 0, result.stderr);
    const parsed = JSON.parse(result.stdout) as Inbox;

    const [stuckItem, plainItem] = parsed.needsYou as NeedsYouItem[];
    assert.deepEqual(Object.keys(stuckItem), ['kind', 'change', 'task', 'command', 'stuck']);
    assert.deepEqual(stuckItem.stuck, { fingerprint: FINGERPRINT });
    assert.equal(
      JSON.stringify(stuckItem),
      JSON.stringify({
        kind: 'task-dead',
        change: { id: '002', title: 'Dead change' },
        task: { number: '1', title: 'First dead' },
        command: 'osq retry 002 1',
        stuck: { fingerprint: FINGERPRINT },
      }),
    );

    assert.deepEqual(Object.keys(plainItem), ['kind', 'change', 'task', 'command']);
    assert.equal('stuck' in plainItem, false);
    assert.equal(JSON.stringify(plainItem), JSON.stringify(PLAIN_ITEM));
  });

  it('renders the stuck row before its retry command and leaves the plain row unchanged', async () => {
    const result = await runBin(project, home);
    assert.equal(result.code, 0, result.stderr);

    const lines = result.stdout.split('\n');
    assert.ok(
      lines.includes(
        '  002: Dead change — task 1: First dead — stuck: same failure twice; amend the spec or osq reject 002 --reason <text> — osq retry 002 1',
      ),
    );
    assert.ok(lines.includes('  002: Dead change — task 2: Second dead — osq retry 002 2'));
    assert.ok(!lines.some((line) => line.includes('task 2: Second dead — stuck')));
  });
});
