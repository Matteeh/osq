import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { deriveSpecState } from '../src/core/status/state.js';
import { installFakeValidator } from './helpers.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binPath = path.join(repoRoot, 'src', 'cli', 'bin.ts');
const require = createRequire(import.meta.url);
const tsxLoader = require.resolve('tsx');

const OPENSPEC = 'openspec';
const CHANGES = path.join(OPENSPEC, 'changes');
const ARCHIVE = path.join(CHANGES, 'archive');

const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

const QUEUE = [
  '## [alpha] Queue Alpha',
  'Depends on: nothing',
  '',
  'Alpha brief body.',
  '',
  '## [beta] Queue Beta',
  'Depends on: alpha',
  '',
  'Beta brief body.',
  '',
  '## [gamma] Queue Gamma',
  'Depends on: beta',
  '',
  'Gamma brief body.',
  '',
].join('\n');

interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], cwd: string): Promise<CliRun> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--import', tsxLoader, binPath, ...args],
      { cwd, env: { ...process.env, NO_COLOR: '1', CI: '1' }, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error ? ((error as { code?: number }).code ?? 1) : 0;
        resolve({ code, stdout: stdout ?? '', stderr: stderr ?? '' });
      },
    );
  });
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

function proposalMd(title: string, dependsOn: string[]): string {
  const deps = `[${dependsOn.map((id) => `"${id}"`).join(', ')}]`;
  return [
    '---',
    `title: ${title}`,
    `depends_on: ${deps}`,
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    '',
    `${title} goal.`,
    '',
    '## Contract',
    '',
    '| Input | Expected Output |',
    '|---|---|',
    '| a | b |',
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
  ].join('\n');
}

function taskMd(title: string, verify: string): string {
  return [
    '---',
    `title: ${title}`,
    `verify: ${verify}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] completes',
    '',
  ].join('\n');
}

function tasksMd(title: string): string {
  return ['# Tasks', '', '## 1. Section', '', `- [ ] 1. ${title}`, ''].join('\n');
}

/** Materialize the planner's authored output for a queue-created change. */
async function authorChange(
  root: string,
  folderName: string,
  title: string,
  dependsOn: string[],
  verify: string,
): Promise<string> {
  const folder = path.join(root, CHANGES, folderName);
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), proposalMd(title, dependsOn), 'utf8');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), taskMd(title, verify), 'utf8');
  await fs.writeFile(path.join(folder, 'tasks.md'), tasksMd(title), 'utf8');
  return folder;
}

async function activeFolders(root: string): Promise<string[]> {
  const entries = await fs.readdir(path.join(root, CHANGES), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== 'archive' && entry.name !== 'rejected')
    .map((entry) => entry.name)
    .sort();
}

describe('brief queue planning through the real CLI and mock harness', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-queue-watch-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      "export default { harness: 'mock' };\n",
      'utf8',
    );
    await fs.writeFile(path.join(tmpDir, OPENSPEC, 'queue.md'), QUEUE, 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('plans one item per invocation, halts on a dead task, retries, and lands all three', async () => {
    // 1. First invocation plans only alpha.
    const firstPlan = await runCli(['plan', '--next', '--print'], tmpDir);
    assert.equal(firstPlan.code, 0, firstPlan.stderr);
    assert.deepEqual(await activeFolders(tmpDir), ['001-alpha']);
    assert.match(firstPlan.stdout, /# Change: 001 - Queue Alpha/);
    assert.ok(!firstPlan.stdout.includes('queue.md'), 'prompt must not embed the queue file');
    assert.ok(!firstPlan.stdout.includes('Queue Beta'), 'prompt must not expose later items');

    // Alpha is planned but unlanded, so nothing else is eligible yet.
    const waiting = await runCli(['plan', '--next', '--print'], tmpDir);
    assert.equal(waiting.code, 1);
    assert.match(waiting.stderr, /No queue item is eligible to plan/);
    assert.deepEqual(await activeFolders(tmpDir), ['001-alpha']);

    await authorChange(tmpDir, '001-alpha', 'Queue Alpha', [], 'node verify.cjs');
    assert.equal(
      (await deriveSpecState(tmpDir, path.join(tmpDir, CHANGES, '001-alpha'))).status,
      'unapproved',
    );
    assert.equal((await runCli(['approve', '001'], tmpDir)).code, 0);
    assert.equal(
      (await deriveSpecState(tmpDir, path.join(tmpDir, CHANGES, '001-alpha'))).status,
      'pending',
    );
    assert.equal((await runCli(['watch', '--once', '--allow-stale'], tmpDir)).code, 0);
    assert.ok(await exists(path.join(tmpDir, ARCHIVE, '001-alpha')));

    // 2. Alpha landed, so beta is planned with its archived dependency id.
    const secondPlan = await runCli(['plan', '--next', '--print'], tmpDir);
    assert.equal(secondPlan.code, 0, secondPlan.stderr);
    assert.match(secondPlan.stdout, /# Change: 002 - Queue Beta/);
    assert.match(
      secondPlan.stdout,
      /Landed dependencies:\n- openspec\/changes\/archive\/001-alpha/,
    );
    assert.ok(!secondPlan.stdout.includes('Queue Gamma'), 'prompt must not expose later items');
    const betaFolder = path.join(tmpDir, CHANGES, '002-beta');
    assert.match(
      await fs.readFile(path.join(betaFolder, 'proposal.md'), 'utf8'),
      /^depends_on: \["001"\]$/m,
    );
    await authorChange(tmpDir, '002-beta', 'Queue Beta', ['001'], 'node beta-check.cjs');
    await fs.writeFile(path.join(tmpDir, 'beta-check.cjs'), 'process.exit(1);\n', 'utf8');

    assert.equal((await runCli(['approve', '002'], tmpDir)).code, 0);
    assert.equal((await runCli(['watch', '--once', '--allow-stale'], tmpDir)).code, 0);

    // 3. The dead task halts queue planning and names the exact retry command.
    assert.equal((await deriveSpecState(tmpDir, betaFolder)).status, 'dead');
    assert.ok(await exists(path.join(betaFolder, '.run', 'dead', '1.md')));
    const halted = await runCli(['plan', '--next', '--print'], tmpDir);
    assert.equal(halted.code, 1);
    assert.match(halted.stderr, /osq retry 002 1/);
    assert.deepEqual(await activeFolders(tmpDir), ['002-beta']);

    // 4. Retry preserves the failed attempt, then the task lands.
    await fs.writeFile(path.join(tmpDir, 'beta-check.cjs'), 'process.exit(0);\n', 'utf8');
    const retried = await runCli(['retry', '002', '1'], tmpDir);
    assert.equal(retried.code, 0, retried.stderr);
    assert.ok(await exists(path.join(betaFolder, '.run', 'dead', '1.1.md')));
    assert.ok(!(await exists(path.join(betaFolder, '.run', 'dead', '1.md'))));
    assert.equal((await deriveSpecState(tmpDir, betaFolder)).status, 'pending');

    assert.equal((await runCli(['watch', '--once', '--allow-stale'], tmpDir)).code, 0);
    assert.ok(await exists(path.join(tmpDir, ARCHIVE, '002-beta')));

    // 5. Gamma can only be planned after beta lands, and lands in turn.
    const thirdPlan = await runCli(['plan', '--next', '--print'], tmpDir);
    assert.equal(thirdPlan.code, 0, thirdPlan.stderr);
    assert.match(thirdPlan.stdout, /# Change: 003 - Queue Gamma/);
    const gammaFolder = await authorChange(
      tmpDir,
      '003-gamma',
      'Queue Gamma',
      ['002'],
      'node verify.cjs',
    );
    assert.match(
      await fs.readFile(path.join(gammaFolder, 'proposal.md'), 'utf8'),
      /^depends_on: \["002"\]$/m,
    );
    assert.equal((await runCli(['approve', '003'], tmpDir)).code, 0);
    assert.equal((await runCli(['watch', '--once', '--allow-stale'], tmpDir)).code, 0);
    assert.ok(await exists(path.join(tmpDir, ARCHIVE, '003-gamma')));

    // Every item landed and no extra change was planned along the way.
    assert.deepEqual(await activeFolders(tmpDir), []);
    assert.deepEqual((await fs.readdir(path.join(tmpDir, ARCHIVE))).sort(), [
      '001-alpha',
      '002-beta',
      '003-gamma',
    ]);
    assert.equal(DEFAULT_CONFIG.paths.openspecRoot, 'openspec');
  });
});
