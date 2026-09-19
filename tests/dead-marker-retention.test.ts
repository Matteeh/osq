import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { createNewSpec } from '../src/core/new.js';
import { MockAdapter } from '../src/harness/mock.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const PASSING_VERIFY = 'node -e "process.exit(0)"';
const FAILING_VERIFY = 'node -e "process.exit(1)"';

async function writeTask(specFolder: string, verify: string): Promise<void> {
  const taskPath = path.join(specFolder, 'tasks', '1.md');
  const task = [
    '---',
    'title: When a task fails and is re-approved, diagnostics are retained',
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

describe('Dead marker retention across re-approval', () => {
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

  it('renames dead/1.md to dead/1.1.md then dead/1.2.md across re-approvals', async () => {
    await writeTask(specFolder, FAILING_VERIFY);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    adapter.resetBehavior();

    const first = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(first.success, false);
    assert.equal(first.reason, 'verify_red');
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), true);

    // First re-approval renames the active marker to attempt 1.
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.1.md')), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), false);

    // Second failure recreates the active marker; the next re-approval derives attempt 2.
    const second = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(second.success, false);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), true);

    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.2.md')), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.1.md')), true);
    assert.equal(await exists(path.join(specFolder, '.run', 'dead', '1.md')), false);
  });

  it('retains dead/1.1.md alongside done/1 after a successful rerun', async () => {
    await writeTask(specFolder, FAILING_VERIFY);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    adapter.resetBehavior();

    const failed = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(failed.success, false);

    // Re-approve with a passing verify so the rerun can complete.
    await writeTask(specFolder, PASSING_VERIFY);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
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
