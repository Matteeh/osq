import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { tailVerifyOutput } from '../src/core/run/verify-excerpt.js';
import { writeVerifyLog } from '../src/core/run/verify-log.js';
import { markerFingerprint } from '../src/watcher/fingerprint.js';
import { writeDoneMarker } from '../src/watcher/outcome.js';
import { auditScopeRegressions, buildDoneMetadata } from '../src/watcher/regression.js';
import { runVerificationGateResult } from '../src/watcher/verify.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const LIMITS = { markerOutputLines: 40, markerLineChars: 400 };
const FAILING = "for (let i = 1; i <= 100; i += 1) console.log('line ' + i);\nprocess.exit(1);\n";
const TIMEOUT_SECONDS = DEFAULT_CONFIG.timeouts.verifyTimeoutSeconds ?? 600;
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

function numbered(count: number, prefix = 'line'): string {
  return Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`).join('\n');
}

function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'])
    Reflect.deleteProperty(env, key);
  return env;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, env: cleanGitEnv() });
  return stdout.trim();
}

/** A change folder with a local script the shared gate can run. */
async function makeChangeFolder(script: string): Promise<{ root: string; folder: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-verify-log-'));
  roots.push(root);
  const folder = path.join(root, 'openspec', 'changes', '001-verify-log');
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(root, 'verify.cjs'), script, 'utf8');
  return { root, folder };
}

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

async function readEvents(folder: string, target: string): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(folder, '.run', 'events', `${target}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

describe('writeVerifyLog', () => {
  it('writes the next free task log, its gitignore, and returns the relative path', async () => {
    const { folder } = await makeChangeFolder('');

    const first = await writeVerifyLog(folder, '1', 'line 1\nline 2\n');

    assert.equal(first, '.run/logs/1-1.log');
    assert.equal(await fs.readFile(path.join(folder, first), 'utf8'), 'line 1\nline 2\n');
    assert.equal(await fs.readFile(path.join(folder, '.run', 'logs', '.gitignore'), 'utf8'), '*\n');

    const second = await writeVerifyLog(folder, '1', 'again\n');
    assert.equal(second, '.run/logs/1-2.log');
    assert.equal(await fs.readFile(path.join(folder, first), 'utf8'), 'line 1\nline 2\n');
  });

  it('numbers a change target from one and writes an empty log for blank output', async () => {
    const { folder } = await makeChangeFolder('');

    const log = await writeVerifyLog(folder, 'change', '');

    assert.equal(log, '.run/logs/change-1.log');
    assert.equal(await fs.readFile(path.join(folder, log), 'utf8'), '');
  });

  it('makes git ignore every file under .run/logs/', async () => {
    const { root, folder } = await makeChangeFolder('');
    await git(['init'], root);
    await writeVerifyLog(folder, '1', 'hidden\n');

    const status = await git(['status', '--porcelain', '--untracked-files=all'], root);
    assert.ok(!status.split('\n').some((line) => line.includes('.run/logs/')));
    assert.equal(await fs.readFile(path.join(folder, '.run', 'logs', '.gitignore'), 'utf8'), '*\n');
  });
});

describe('tailVerifyOutput', () => {
  it('keeps short output exactly, trailing newline included', () => {
    assert.equal(tailVerifyOutput('before red after\n', LIMITS), 'before red after\n');
  });

  it('keeps the last configured lines of a long output', () => {
    const tail = tailVerifyOutput(`${numbered(100)}\n`, LIMITS);
    const lines = tail.split('\n');
    assert.equal(lines.length, 40);
    assert.equal(lines[0], 'line 61');
    assert.equal(lines.at(-1), 'line 100');
  });

  it('cuts an over-long kept line and counts the removed characters', () => {
    assert.equal(
      tailVerifyOutput('x'.repeat(1000), LIMITS),
      `${'x'.repeat(400)}… (600 more characters)`,
    );
  });

  it('makes blank output the empty string', () => {
    for (const output of ['', '   ', '\n\n\t\n'])
      assert.equal(tailVerifyOutput(output, LIMITS), '');
  });
});

describe('runVerificationGateResult writes logs and tails', () => {
  it('writes all 100 lines to the log and the last 40 to the event', async () => {
    const { root, folder } = await makeChangeFolder(FAILING);

    const result = await runVerificationGateResult(
      root,
      'node verify.cjs',
      TIMEOUT_SECONDS,
      { specFolderPath: folder, taskNumber: '1' },
      DEFAULT_CONFIG,
    );

    assert.equal(result.passed, false);
    assert.equal(result.log, '.run/logs/1-1.log');
    const log = await fs.readFile(path.join(folder, result.log as string), 'utf8');
    assert.equal(log.trimEnd().split('\n').length, 100);
    assert.match(log, /line 1\n/);
    assert.match(log, /line 100/);

    const event = (await readEvents(folder, '1')).find((entry) => entry.type === 'verify_ran');
    assert.equal(event?.data?.log, '.run/logs/1-1.log');
    assert.equal(event?.data?.output, numbered(100).split('\n').slice(60).join('\n'));
    assert.ok(!String(event?.data?.output).includes('line 60'));
  });

  it('writes an empty log and omits output for blank output', async () => {
    const { root, folder } = await makeChangeFolder('process.exit(0);\n');

    const result = await runVerificationGateResult(
      root,
      'node verify.cjs',
      TIMEOUT_SECONDS,
      { specFolderPath: folder, taskNumber: '1' },
      DEFAULT_CONFIG,
    );

    assert.equal(result.passed, true);
    assert.equal(result.log, '.run/logs/1-1.log');
    assert.equal(await fs.readFile(path.join(folder, '.run', 'logs', '1-1.log'), 'utf8'), '');
    const event = (await readEvents(folder, '1')).find((entry) => entry.type === 'verify_ran');
    assert.equal(event?.data?.log, '.run/logs/1-1.log');
    assert.ok(!('output' in (event?.data ?? {})));
  });

  it('returns a null log and writes no event without a context', async () => {
    const { root, folder } = await makeChangeFolder(FAILING);

    const result = await runVerificationGateResult(root, 'node verify.cjs', TIMEOUT_SECONDS);

    assert.equal(result.log, null);
    const raw = await fs
      .readFile(path.join(folder, '.run', 'events', '1.jsonl'), 'utf8')
      .catch(() => '');
    assert.equal(raw, '');
  });
});

describe('scope audit event tails', () => {
  it('records the tail in the regressed event and the log pointer in the marker', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-verify-log-scope-'));
    roots.push(root);
    await installFakeValidator(root);
    await scaffoldProject(root);
    await fs.writeFile(path.join(root, 'verify.cjs'), FAILING, 'utf8');
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'a.ts'), 'export const value = 1;\n', 'utf8');

    const folder = path.join(root, 'openspec', 'changes', '001-verify-log');
    const runDir = path.join(folder, '.run');
    await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
    await fs.writeFile(
      path.join(folder, 'proposal.md'),
      '---\ntitle: Verify log\ndepends_on: []\nverify: node verify.cjs\nfeatures:\n  reads: []\n---\n## Goal\n\nTail the scope audit.\n',
      'utf8',
    );
    await fs.writeFile(path.join(folder, 'tasks.md'), '# Tasks\n\n- [ ] 1. Verify log\n', 'utf8');
    await fs.writeFile(
      path.join(folder, 'tasks', '1.md'),
      '---\ntitle: Verify log\nverify: node verify.cjs\nscope: [src/a.ts]\nentry: []\nskills: []\n---\n## Acceptance\n\n- [ ] tail\n',
      'utf8',
    );
    await writeDoneMarker(runDir, '1', await buildDoneMetadata(root, ['src/a.ts']));
    await fs.writeFile(path.join(root, 'src', 'a.ts'), 'export const value = 2;\n', 'utf8');

    await auditScopeRegressions({
      projectRoot: root,
      specFolderPath: folder,
      eligibleTaskNumbers: ['1'],
      verifyTimeoutSeconds: TIMEOUT_SECONDS,
    });

    const log = await fs.readFile(path.join(folder, '.run', 'logs', '1-1.log'), 'utf8');
    assert.equal(log.trimEnd().split('\n').length, 100);

    const marker = await fs.readFile(path.join(runDir, 'regressed', '1.md'), 'utf8');
    assert.ok(marker.trimEnd().endsWith('Full output: .run/logs/1-1.log'));

    const regressed = (await readEvents(folder, '1')).find((entry) => entry.type === 'regressed');
    assert.equal(regressed?.data?.output, numbered(100).split('\n').slice(60).join('\n'));
  });
});

describe('dead marker fingerprint log run number', () => {
  const marker = (log: string) => `---\nreason: verify_red\n---\nFull output: ${log}\n`;

  it('drops the run number but keeps the target', () => {
    const first = marker('.run/logs/1-1.log');
    const second = marker('.run/logs/1-2.log');
    const other = marker('.run/logs/2-1.log');

    assert.equal(markerFingerprint(first), markerFingerprint(second));
    assert.notEqual(markerFingerprint(first), markerFingerprint(other));
  });
});
