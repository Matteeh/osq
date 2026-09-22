import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binPath = path.join(repoRoot, 'src', 'cli', 'bin.ts');
const require = createRequire(import.meta.url);
const tsxLoader = require.resolve('tsx');

const VERIFY_FLAG = '.osq-retry-verify';
const VERIFY_SCRIPT = [
  "const fs = require('fs');",
  `if (!fs.existsSync('${VERIFY_FLAG}')) {`,
  `  fs.writeFileSync('${VERIFY_FLAG}', '1');`,
  '  process.exit(1);',
  '}',
  '',
].join('\n');

async function runCli(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--import', tsxLoader, binPath, ...args],
    { cwd, env: { ...process.env, NO_COLOR: '1', CI: '1' } },
  );
  return stdout;
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

async function parseEvents(eventPath: string): Promise<Record<string, unknown>[]> {
  const raw = await fs.readFile(eventPath, 'utf8').catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function rewriteVerifyLine(filePath: string): Promise<void> {
  const content = await fs.readFile(filePath, 'utf8');
  await fs.writeFile(filePath, content.replace(/^verify:.*$/m, 'verify: node verify.cjs'), 'utf8');
}

describe('retry through the real watcher CLI with the mock harness', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-retry-watch-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      "export default { harness: 'mock' };\n",
      'utf8',
    );
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), VERIFY_SCRIPT, 'utf8');

    const spec = await createNewSpec(tmpDir, 'Retry Watch');
    specFolder = spec.folderPath;
    await rewriteVerifyLine(path.join(specFolder, 'proposal.md'));
    await rewriteVerifyLine(path.join(specFolder, 'tasks', '1.md'));
    await approveSpec(tmpDir, spec.specId, DEFAULT_CONFIG);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('dies once, retries without deleting diagnostics, then lands and archives', async () => {
    await runCli(['watch', '--once', '--allow-stale'], tmpDir);

    // First run dies on verification and retains its failure marker and result.
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'done', '1')), false);
    const resultPath = path.join(specFolder, '.run', 'results', '1.md');
    assert.equal(await exists(resultPath), true);
    const preservedResult = await fs.readFile(resultPath, 'utf8');

    const stdout = await runCli(['retry', '001', '1'], tmpDir);
    assert.match(stdout, /Retried 001 task 1/);

    // The active marker became attempt-suffixed history and the prior result
    // stayed in place until the next attempt could read it.
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.1.md')), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), false);
    assert.equal(await exists(resultPath), true);
    assert.equal(await fs.readFile(resultPath, 'utf8'), preservedResult);

    const beforeEvents = await parseEvents(path.join(specFolder, '.run', 'events', '1.jsonl'));
    const retryEvent = beforeEvents.find((event) => event.type === 'retry');
    assert.deepEqual(retryEvent?.data, { target: '1', reason: 'verify_red', attempt: 2 });

    await runCli(['watch', '--once', '--allow-stale'], tmpDir);

    // The change landed and moved, carrying its diagnostics into the archive.
    assert.equal(await exists(specFolder), false);
    const archiveDir = path.join(tmpDir, 'openspec', 'changes', 'archive');
    const archived = (await fs.readdir(archiveDir)).sort();
    assert.equal(archived.length, 1);
    const archivedFolder = path.join(archiveDir, archived[0]);

    assert.equal(await exists(path.join(archivedFolder, '.run', 'dead', '1.1.md')), true);
    assert.equal(await exists(path.join(archivedFolder, '.run', 'results', '1.md')), true);

    const events = await parseEvents(path.join(archivedFolder, '.run', 'events', '1.jsonl'));
    const started = events.filter((event) => event.type === 'started');
    const lastStarted = started.at(-1);
    assert.equal((lastStarted?.data as { attempt?: number }).attempt, 2);
    assert.equal(
      events.some((event) => event.type === 'retry'),
      true,
    );
  });
});
