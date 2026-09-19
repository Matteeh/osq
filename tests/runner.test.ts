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

describe('Task Runner and Verification Gate', () => {
  let tmpDir: string;
  let specFolder: string;
  let mockAdapter: MockAdapter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-runner-test-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Runner Spec');
    specFolder = spec.folderPath;
    mockAdapter = new MockAdapter();
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('fails with reason: spec_conflict if folder is modified after approval', async () => {
    // Tamper with task file after approval
    const taskPath = path.join(specFolder, 'tasks', '1.md');
    await fs.appendFile(taskPath, '\n<!-- tampered -->\n', 'utf8');

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, mockAdapter);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'spec_conflict');

    // Check dead marker
    const deadPath = path.join(specFolder, '.run', 'dead', '1.md');
    const deadContent = await fs.readFile(deadPath, 'utf8');
    assert.ok(deadContent.includes('reason: spec_conflict'));
  });

  it('fails with reason: no_result if agent exits without writing .run/results/<n>.md', async () => {
    // Re-approve to ensure clean hash
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    mockAdapter.setBehavior({ writeResult: false });
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, mockAdapter);

    assert.equal(result.success, false);
    assert.equal(result.reason, 'no_result');

    const deadPath = path.join(specFolder, '.run', 'dead', '1.md');
    const deadContent = await fs.readFile(deadPath, 'utf8');
    assert.ok(deadContent.includes('reason: no_result'));
  });

  it('fails with reason: timeout if agent times out', async () => {
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    mockAdapter.setBehavior({ timedOut: true });
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, mockAdapter);

    assert.equal(result.success, false);
    assert.equal(result.reason, 'timeout');

    const deadPath = path.join(specFolder, '.run', 'dead', '1.md');
    const deadContent = await fs.readFile(deadPath, 'utf8');
    assert.ok(deadContent.includes('reason: timeout'));
  });

  it('fails with reason: verify_red if task verify fails', async () => {
    // Write task with failing verify command
    const taskPath = path.join(specFolder, 'tasks', '1.md');
    const failingTaskContent = [
      '---',
      'title: When test fails, verify_red is triggered',
      'verify: node -e "process.exit(1)"',
      'scope: []',
      'entry: []',
      'skills: []',
      '---',
      '## Acceptance',
      '- [ ] should fail',
    ].join('\n');
    await fs.writeFile(taskPath, `${failingTaskContent}\n`, 'utf8');
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    mockAdapter.resetBehavior();
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, mockAdapter);

    assert.equal(result.success, false);
    assert.equal(result.reason, 'verify_red');

    const deadPath = path.join(specFolder, '.run', 'dead', '1.md');
    const deadContent = await fs.readFile(deadPath, 'utf8');
    assert.ok(deadContent.includes('reason: verify_red'));
  });

  it('fails with reason: verify_red and timed_out: true if task verify hangs', async () => {
    const taskPath = path.join(specFolder, 'tasks', '1.md');
    const hangingTaskContent = [
      '---',
      'title: When test hangs, verify_red with timed_out is triggered',
      'verify: node -e "setInterval(()=>{}, 1000)"',
      'scope: []',
      'entry: []',
      'skills: []',
      '---',
      '## Acceptance',
      '- [ ] should hang',
    ].join('\n');
    await fs.writeFile(taskPath, `${hangingTaskContent}\n`, 'utf8');
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    mockAdapter.resetBehavior();
    const shortTimeoutConfig = {
      ...DEFAULT_CONFIG,
      timeouts: {
        ...DEFAULT_CONFIG.timeouts,
        verifyTimeoutSeconds: 1,
      },
    };

    const result = await runTask(tmpDir, specFolder, '1', shortTimeoutConfig, mockAdapter);

    assert.equal(result.success, false);
    assert.equal(result.reason, 'verify_red');

    const deadPath = path.join(specFolder, '.run', 'dead', '1.md');
    const deadContent = await fs.readFile(deadPath, 'utf8');
    assert.ok(deadContent.includes('reason: verify_red'));
    assert.ok(deadContent.includes('timed_out: true'));
  });

  it('succeeds, creates .run/done/<n>, and ticks checkbox on valid task and passing verify', async () => {
    // Task with passing verify
    const taskPath = path.join(specFolder, 'tasks', '1.md');
    const passingTaskContent = [
      '---',
      'title: When test passes, done is recorded',
      'verify: node -e "process.exit(0)"',
      'scope: []',
      'entry: []',
      'skills: []',
      '---',
      '## Acceptance',
      '- [ ] should pass',
    ].join('\n');
    await fs.writeFile(taskPath, `${passingTaskContent}\n`, 'utf8');
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    mockAdapter.resetBehavior();
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, mockAdapter);

    assert.equal(result.success, true);

    // Verify .run/done/1 exists
    const donePath = path.join(specFolder, '.run', 'done', '1');
    const doneStat = await fs.stat(donePath);
    assert.ok(doneStat);

    // Verify tasks.md has ticked box
    const tasksMdPath = path.join(specFolder, 'tasks.md');
    const tasksContent = await fs.readFile(tasksMdPath, 'utf8');
    assert.ok(tasksContent.includes('- [x] 1.'));
  });
});
