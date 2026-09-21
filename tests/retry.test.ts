import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createProgram } from '../src/cli/index.js';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { createNewSpec } from '../src/core/new.js';
import { retrySpec } from '../src/core/retry.js';
import { deriveSpecState } from '../src/core/state.js';
import { installFakeValidator } from './helpers.js';

const VERIFY = 'node -e "process.exit(0)"';

async function writeTask(specFolder: string): Promise<void> {
  const taskPath = path.join(specFolder, 'tasks', '1.md');
  const task = [
    '---',
    'title: When retry is exercised, diagnostics are retained',
    `verify: ${VERIFY}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] should be observed',
  ].join('\n');
  await fs.writeFile(taskPath, `${task}\n`, 'utf8');
}

async function writeMarker(specFolder: string, kind: string, name: string, reason: string) {
  const dir = path.join(specFolder, '.run', kind);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), `---\nreason: ${reason}\n---\nmarker\n`, 'utf8');
}

async function readEvents(specFolder: string, target: string): Promise<Record<string, unknown>[]> {
  const raw = await fs
    .readFile(path.join(specFolder, '.run', 'events', `${target}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

async function taskStatus(specFolder: string): Promise<string> {
  const root = path.dirname(path.dirname(path.dirname(specFolder)));
  const state = await deriveSpecState(root, specFolder);
  return state.tasks[0]?.status ?? 'missing';
}

describe('explicit retry transition', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-retry-test-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Retry Target');
    specFolder = spec.folderPath;
    await writeTask(specFolder);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('registers the retry command with id and target arguments', () => {
    const program = createProgram();
    const retry = program.commands.find((cmd) => cmd.name() === 'retry');
    assert.ok(retry);
    assert.equal(retry.registeredArguments[0].name(), 'id');
    assert.equal(retry.registeredArguments[0].required, true);
    assert.equal(retry.registeredArguments[1].name(), 'target');
    assert.equal(retry.registeredArguments[1].required, true);
  });

  it('renames an active dead marker to the next ordinal and records the retry', async () => {
    await writeMarker(specFolder, 'dead', '1.md', 'verify_red');

    const result = await retrySpec(tmpDir, '001', '1', DEFAULT_CONFIG);

    assert.equal(result.attempt, 2);
    assert.equal(result.reason, 'verify_red');
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), false);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.1.md')), true);
    assert.equal(await taskStatus(specFolder), 'pending');

    const events = await readEvents(specFolder, '1');
    const retry = events.at(-1);
    assert.equal(retry?.type, 'retry');
    assert.deepEqual(retry?.data, { target: '1', reason: 'verify_red', attempt: 2 });
    assert.equal(typeof retry?.timestamp, 'string');
  });

  it('counts retained dead and regressed history in one shared ordinal', async () => {
    await writeMarker(specFolder, 'dead', '1.1.md', 'verify_red');
    await writeMarker(specFolder, 'regressed', '1.2.md', 'verify_red');
    await writeMarker(specFolder, 'dead', '1.md', 'verify_red');

    const result = await retrySpec(tmpDir, '001', '1', DEFAULT_CONFIG);

    assert.equal(result.attempt, 4);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.3.md')), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), false);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.1.md')), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'regressed', '1.2.md')), true);
  });

  it('retains a task regression done marker so the task derives pending', async () => {
    await writeMarker(specFolder, 'done', '1', '');
    await writeMarker(specFolder, 'regressed', '1.md', 'verify_red');

    const result = await retrySpec(tmpDir, '001', '1', DEFAULT_CONFIG);

    assert.equal(result.reason, 'verify_red');
    assert.equal(await exists(path.join(specFolder, '.run', 'regressed', '1.1.md')), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'regressed', '1.md')), false);
    assert.equal(await exists(path.join(specFolder, '.run', 'done', '1.1')), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'done', '1')), false);
    assert.equal(await taskStatus(specFolder), 'pending');
  });

  it('retries a change-level regression into history and makes archiving eligible', async () => {
    await writeMarker(specFolder, 'done', '1', '');
    await writeMarker(specFolder, 'regressed', 'change.md', 'verify_red');

    const result = await retrySpec(tmpDir, '001', 'change', DEFAULT_CONFIG);

    assert.equal(result.target, 'change');
    assert.equal(result.attempt, 2);
    assert.equal(await exists(path.join(specFolder, '.run', 'regressed', 'change.1.md')), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'regressed', 'change.md')), false);

    const state = await deriveSpecState(tmpDir, specFolder);
    assert.equal(state.status, 'done');

    const events = await readEvents(specFolder, 'change');
    assert.equal(events.at(-1)?.type, 'retry');
  });

  it('preserves both active failure kinds under one ordinal with regression reason', async () => {
    await writeMarker(specFolder, 'done', '1', '');
    await writeMarker(specFolder, 'dead', '1.md', 'crashed');
    await writeMarker(specFolder, 'regressed', '1.md', 'verify_red');

    const result = await retrySpec(tmpDir, '001', '1', DEFAULT_CONFIG);

    assert.equal(result.reason, 'verify_red');
    assert.equal(result.attempt, 2);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.1.md')), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'regressed', '1.1.md')), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'done', '1.1')), true);
  });

  it('refuses a running target without mutating markers or events', async () => {
    await writeMarker(specFolder, 'dead', '1.md', 'verify_red');
    await fs.mkdir(path.join(specFolder, '.run', 'running'), { recursive: true });
    await fs.writeFile(path.join(specFolder, '.run', 'running', '1.pid'), '{"pid":1}', 'utf8');

    await assert.rejects(() => retrySpec(tmpDir, '001', '1', DEFAULT_CONFIG), /running/i);

    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), true);
    assert.equal(
      (await readEvents(specFolder, '1')).some((e) => e.type === 'retry'),
      false,
    );
  });

  it('refuses a missing approval and names osq approve without mutation', async () => {
    await writeMarker(specFolder, 'dead', '1.md', 'verify_red');
    await fs.rm(path.join(specFolder, '.run', 'approved'));

    await assert.rejects(() => retrySpec(tmpDir, '001', '1', DEFAULT_CONFIG), /osq approve 001/);

    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), true);
    assert.equal(
      (await readEvents(specFolder, '1')).some((e) => e.type === 'retry'),
      false,
    );
  });

  it('refuses a mismatched approval hash and names osq approve without mutation', async () => {
    await writeMarker(specFolder, 'dead', '1.md', 'verify_red');
    const taskPath = path.join(specFolder, 'tasks', '1.md');
    const content = await fs.readFile(taskPath, 'utf8');
    await fs.writeFile(taskPath, content.replace('## Acceptance', '## Acceptance notes'), 'utf8');

    await assert.rejects(() => retrySpec(tmpDir, '001', '1', DEFAULT_CONFIG), /osq approve 001/);

    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), true);
    assert.equal(
      (await readEvents(specFolder, '1')).some((e) => e.type === 'retry'),
      false,
    );
  });

  it('refuses a target with no active failure', async () => {
    await assert.rejects(() => retrySpec(tmpDir, '001', '1', DEFAULT_CONFIG), /No active failure/);
    assert.equal((await readEvents(specFolder, '1')).length, 0);
  });

  it('refuses a change target without a change-level regression', async () => {
    await writeMarker(specFolder, 'dead', '1.md', 'verify_red');

    await assert.rejects(
      () => retrySpec(tmpDir, '001', 'change', DEFAULT_CONFIG),
      /No active failure marker for change-level regression/,
    );
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), true);
    assert.equal((await readEvents(specFolder, 'change')).length, 0);
  });

  it('refuses any non-numeric non-change target', async () => {
    await assert.rejects(
      () => retrySpec(tmpDir, '001', 'bogus', DEFAULT_CONFIG),
      /Invalid retry target/,
    );
  });
});
