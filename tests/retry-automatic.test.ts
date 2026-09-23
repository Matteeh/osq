import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { retrySpec } from '../src/core/lifecycle/retry.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { installFakeValidator } from './helpers.js';

const VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

async function writeTask(specFolder: string): Promise<void> {
  const taskPath = path.join(specFolder, 'tasks', '1.md');
  const task = [
    '---',
    'title: When a retry is asked for, the event records whether it was automatic',
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

async function writeMarker(
  specFolder: string,
  kind: string,
  name: string,
  reason: string,
): Promise<void> {
  const dir = path.join(specFolder, '.run', kind);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), `---\nreason: ${reason}\n---\nmarker\n`, 'utf8');
}

async function readEvents(
  specFolder: string,
  target: string,
): Promise<{ type: string; data?: Record<string, unknown> }[]> {
  const raw = await fs
    .readFile(path.join(specFolder, '.run', 'events', `${target}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as { type: string; data?: Record<string, unknown> });
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

describe('automatic retry transition', () => {
  let tmpDir: string;
  let specFolder: string;
  let runDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-retry-automatic-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Automatic Retry');
    specFolder = spec.folderPath;
    runDir = path.join(specFolder, '.run');
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
    const proposalPath = path.join(specFolder, 'proposal.md');
    const proposal = await fs.readFile(proposalPath, 'utf8');
    await fs.writeFile(
      proposalPath,
      proposal.replace(/^verify:\s*.*$/m, `verify: ${VERIFY}`),
      'utf8',
    );
    await writeTask(specFolder);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('records automatic true when the watcher asks for the retry', async () => {
    await writeMarker(specFolder, 'dead', '1.md', 'verify_red');

    const result = await retrySpec(tmpDir, '001', '1', DEFAULT_CONFIG, { automatic: true });

    assert.equal(result.attempt, 2);
    assert.equal(result.reason, 'verify_red');
    assert.equal(await exists(path.join(runDir, 'dead', '1.md')), false);
    assert.equal(await exists(path.join(runDir, 'dead', '1.1.md')), true);

    const event = (await readEvents(specFolder, '1')).at(-1);
    assert.equal(event?.type, 'retry');
    assert.deepEqual(event?.data, {
      target: '1',
      reason: 'verify_red',
      attempt: 2,
      automatic: true,
    });
  });

  it('omits the automatic key when a human retries', async () => {
    await writeMarker(specFolder, 'dead', '1.md', 'verify_red');

    const result = await retrySpec(tmpDir, '001', '1', DEFAULT_CONFIG);

    assert.equal(result.attempt, 2);
    assert.equal(await exists(path.join(runDir, 'dead', '1.1.md')), true);

    const event = (await readEvents(specFolder, '1')).at(-1);
    assert.equal(event?.type, 'retry');
    const data = event?.data ?? {};
    assert.deepEqual(data, { target: '1', reason: 'verify_red', attempt: 2 });
    assert.equal('automatic' in data, false);
  });

  it('refuses an automatic retry when the approval hash no longer matches', async () => {
    await writeMarker(specFolder, 'dead', '1.md', 'verify_red');
    const taskPath = path.join(specFolder, 'tasks', '1.md');
    const content = await fs.readFile(taskPath, 'utf8');
    await fs.writeFile(taskPath, content.replace('## Acceptance', '## Acceptance notes'), 'utf8');

    await assert.rejects(
      () => retrySpec(tmpDir, '001', '1', DEFAULT_CONFIG, { automatic: true }),
      /osq approve 001/,
    );

    assert.equal(await exists(path.join(runDir, 'dead', '1.md')), true);
    assert.equal(
      (await readEvents(specFolder, '1')).some((event) => event.type === 'retry'),
      false,
    );
  });

  it('refuses an automatic retry while the task holds a running lock', async () => {
    await writeMarker(specFolder, 'dead', '1.md', 'verify_red');
    await fs.mkdir(path.join(runDir, 'running'), { recursive: true });
    await fs.writeFile(path.join(runDir, 'running', '1.pid'), '{"pid":1}', 'utf8');

    await assert.rejects(
      () => retrySpec(tmpDir, '001', '1', DEFAULT_CONFIG, { automatic: true }),
      /running/i,
    );

    assert.equal(await exists(path.join(runDir, 'dead', '1.md')), true);
    assert.equal(
      (await readEvents(specFolder, '1')).some((event) => event.type === 'retry'),
      false,
    );
  });

  it('never marks a recertification event automatic', async () => {
    const doneDir = path.join(runDir, 'done');
    await fs.mkdir(doneDir, { recursive: true });
    await fs.writeFile(
      path.join(doneDir, '1'),
      '---\nscope_hash: "sha256:old"\n---\nDONE\n',
      'utf8',
    );

    // A scope regression with an automated done marker is recertified by
    // re-running verify; a failing verify requeues it without a retry event.
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), 'process.exit(4);\n', 'utf8');
    const regressedDir = path.join(runDir, 'regressed');
    await fs.mkdir(regressedDir, { recursive: true });
    await fs.writeFile(
      path.join(regressedDir, '1.md'),
      '---\nreason: scope_regression\n---\n- src/a.ts (modified)\n',
      'utf8',
    );

    const result = await retrySpec(tmpDir, '001', '1', DEFAULT_CONFIG, { automatic: true });

    assert.equal(result.recertification, 'requeued');
    const event = (await readEvents(specFolder, '1')).at(-1);
    assert.equal(event?.type, 'recertification');
    assert.equal('automatic' in (event?.data ?? {}), false);
  });
});
