import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Inbox } from '../src/core/status/inbox.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN_PATH = path.join(PROJECT_ROOT, 'src', 'cli', 'bin.ts');
const TSX_LOADER = createRequire(path.join(PROJECT_ROOT, 'package.json')).resolve('tsx');

const DISCLOSED_ARCHIVED_AT = '2026-01-01T00:00:01.000Z';
const PLAIN_ARCHIVED_AT = '2026-01-01T00:00:02.000Z';

/** A real outside-scope disclosure plus a `None` missing-context section. */
const DISCLOSED_RESULT = [
  '## Outside scope',
  '',
  'Left a dead helper in src/legacy.',
  '',
  '## Missing context',
  '',
  'None',
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

async function archiveChange(
  root: string,
  folderName: string,
  title: string,
  iso: string,
  result: string | null,
): Promise<string> {
  const dir = path.join(root, 'openspec', 'changes', 'archive', folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.mkdir(path.join(dir, '.run', 'events'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(title), 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), taskMd(title), 'utf8');
  await fs.writeFile(path.join(dir, '.run', 'approved'), 'sha256:fixture\n', 'utf8');
  if (result !== null) {
    await fs.mkdir(path.join(dir, '.run', 'results'), { recursive: true });
    await fs.writeFile(path.join(dir, '.run', 'results', '1.md'), result, 'utf8');
  }
  await fs.writeFile(
    path.join(dir, '.run', 'events', 'change.jsonl'),
    `${JSON.stringify({ type: 'archived', timestamp: iso, data: { archivePath: dir } })}\n`,
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
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-disclosures-'));
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-disclosures-home-'));
  await archiveChange(
    project,
    '001-disclosed',
    'Disclosed change',
    DISCLOSED_ARCHIVED_AT,
    DISCLOSED_RESULT,
  );
  await archiveChange(project, '002-plain', 'Plain change', PLAIN_ARCHIVED_AT, null);
});

afterEach(async () => {
  await fs.rm(project, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
});

describe('landed disclosures in the inbox and osq show', () => {
  it('marks the disclosed landed item and leaves a change without disclosures unchanged', async () => {
    const result = await runBin(project, home, ['--json']);
    assert.equal(result.code, 0, result.stderr);
    const inbox = JSON.parse(result.stdout) as Inbox;

    const disclosed = inbox.landed.find((item) => item.change.id === '001');
    const plain = inbox.landed.find((item) => item.change.id === '002');
    assert.ok(disclosed);
    assert.ok(plain);

    assert.deepEqual(Object.keys(disclosed), ['change', 'archivedAt', 'command', 'disclosures']);
    assert.deepEqual(disclosed.disclosures, { deviated: 0, missingContext: 0, outsideScope: 1 });

    assert.deepEqual(Object.keys(plain), ['change', 'archivedAt', 'command']);
    assert.equal('disclosures' in plain, false);
  });

  it('appends the disclosed counts to that landed text row and no other', async () => {
    const result = await runBin(project, home);
    assert.equal(result.code, 0, result.stderr);
    const lines = result.stdout.split('\n');

    assert.ok(
      lines.includes(
        `  001: Disclosed change — archived ${DISCLOSED_ARCHIVED_AT} — disclosed: outside scope 1 — osq show 001`,
      ),
    );
    assert.ok(lines.includes(`  002: Plain change — archived ${PLAIN_ARCHIVED_AT} — osq show 002`));
    assert.ok(
      !lines.some((line) => line.includes('002: Plain change') && line.includes('disclosed')),
    );
  });

  it('prints the Disclosures line for a task with a real section and none otherwise', async () => {
    const disclosed = await runBin(project, home, ['show', '001']);
    assert.equal(disclosed.code, 0, disclosed.stderr);
    assert.ok(disclosed.stdout.includes('      Disclosures: outside scope'));
    assert.ok(!disclosed.stdout.includes('Disclosures: deviated'));
    assert.ok(!disclosed.stdout.includes('Disclosures: missing context'));

    const plain = await runBin(project, home, ['show', '002']);
    assert.equal(plain.code, 0, plain.stderr);
    assert.ok(!plain.stdout.includes('Disclosures:'));
  });
});
