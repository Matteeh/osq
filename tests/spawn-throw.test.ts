import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { MockAdapter } from '../src/harness/mock.js';
import type { SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runTask } from '../src/watcher/runner.js';
import { spawnOrCrash } from '../src/watcher/spawn-guard.js';
import { installFakeValidator } from './helpers.js';

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

/** Mock adapter whose `spawn` throws synchronously, like Node's E2BIG. */
class ThrowingAdapter extends MockAdapter {
  override spawn(_options: SpawnTaskOptions): Promise<SpawnResult> {
    throw new Error('spawn E2BIG');
  }
}

/** Mock adapter whose `spawn` rejects asynchronously. */
class RejectingAdapter extends MockAdapter {
  override async spawn(): Promise<SpawnResult> {
    throw new Error('async boom');
  }
}

async function writeTask(specFolder: string, verify: string): Promise<void> {
  const taskPath = path.join(specFolder, 'tasks', '1.md');
  const task = [
    '---',
    'title: When a spawn throws the task dies as crashed',
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

describe('spawnOrCrash', () => {
  it('returns the adapter spawn result when it resolves', async () => {
    const adapter = new MockAdapter();
    const expected: SpawnResult = { exitCode: 3, error: 'nope' };
    adapter.spawn = async () => expected;

    const result = await spawnOrCrash(adapter, {} as SpawnTaskOptions);
    assert.deepEqual(result, expected);
  });

  it('turns a synchronous throw into exit code -1 and the message', async () => {
    const result = await spawnOrCrash(new ThrowingAdapter(), {} as SpawnTaskOptions);
    assert.equal(result.exitCode, -1);
    assert.equal(result.error, 'spawn E2BIG');
  });

  it('turns a rejected spawn into exit code -1 and the message', async () => {
    const result = await spawnOrCrash(new RejectingAdapter(), {} as SpawnTaskOptions);
    assert.equal(result.exitCode, -1);
    assert.equal(result.error, 'async boom');
  });
});

describe('throwing spawn kills the task', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-spawn-throw-test-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Spawn Throw');
    specFolder = spec.folderPath;
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
    const proposalPath = path.join(specFolder, 'proposal.md');
    const proposal = await fs.readFile(proposalPath, 'utf8').catch(() => null);
    if (proposal !== null) {
      await fs.writeFile(
        proposalPath,
        proposal.replace(/^verify:.*$/m, `verify: ${PASSING_VERIFY}`),
        'utf8',
      );
    }
    await writeTask(specFolder, PASSING_VERIFY);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes a crashed dead marker with the thrown message and returns a failed result', async () => {
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, new ThrowingAdapter());

    assert.equal(result.success, false);
    assert.equal(result.reason, 'crashed');
    assert.match(result.error ?? '', /spawn E2BIG/);

    const deadContent = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.ok(deadContent.includes('reason: crashed'));
    assert.ok(deadContent.includes('spawn E2BIG'));
  });
});
