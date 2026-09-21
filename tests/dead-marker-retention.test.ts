import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { createNewSpec } from '../src/core/new.js';
import { retrySpec } from '../src/core/retry.js';
import { MockAdapter } from '../src/harness/mock.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const PASSING_VERIFY = 'node -e "process.exit(0)"';
const FAILING_VERIFY = 'node -e "process.exit(1)"';

async function writeTask(specFolder: string, verify: string): Promise<void> {
  const taskPath = path.join(specFolder, 'tasks', '1.md');
  const task = [
    '---',
    'title: When a task fails and is retried, diagnostics are retained',
    `verify: ${verify}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] should be observed',
  ].join('\n');
  await fs.writeFile(taskPath, `${task}\n`, 'utf8');
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

describe('Failure marker retention across approval and retry', () => {
  let tmpDir: string;
  let specFolder: string;
  let adapter: MockAdapter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-dead-retention-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Dead Retention');
    specFolder = spec.folderPath;
    adapter = new MockAdapter();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('leaves active dead and regressed markers untouched when approval re-seals', async () => {
    await writeTask(specFolder, FAILING_VERIFY);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    adapter.resetBehavior();

    const first = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(first.success, false);
    assert.equal(first.reason, 'verify_red');
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), true);

    const regressedDir = path.join(specFolder, '.run', 'regressed');
    await fs.mkdir(regressedDir, { recursive: true });
    await fs.writeFile(
      path.join(regressedDir, '1.md'),
      '---\nreason: verify_red\n---\nprior regression\n',
      'utf8',
    );

    // Re-approval refreshes the seal and manifest but never retires failures.
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.1.md')), false);
    assert.equal(await exists(path.join(specFolder, '.run', 'regressed', '1.md')), true);
  });

  it('retains dead/1.1.md alongside done/1 after an explicit retry and successful rerun', async () => {
    await writeTask(specFolder, FAILING_VERIFY);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    adapter.resetBehavior();

    const failed = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(failed.success, false);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), true);

    // The rerun needs a passing verify, so re-seal; retry retires the marker.
    await writeTask(specFolder, PASSING_VERIFY);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    await retrySpec(tmpDir, '001', '1', DEFAULT_CONFIG);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.1.md')), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), false);

    const passed = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(passed.success, true);

    assert.equal(await exists(path.join(specFolder, '.run', 'done', '1')), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.1.md')), true);
  });

  it('preserves an active dead marker when a task succeeds without re-approval', async () => {
    await writeTask(specFolder, PASSING_VERIFY);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    adapter.resetBehavior();

    await fs.mkdir(path.join(specFolder, '.run', 'dead'), { recursive: true });
    await fs.writeFile(
      path.join(specFolder, '.run', 'dead', '1.md'),
      '---\nreason: verify_red\n---\nprior failure\n',
      'utf8',
    );

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.success, true);

    assert.equal(await exists(path.join(specFolder, '.run', 'done', '1')), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), true);
  });
});
