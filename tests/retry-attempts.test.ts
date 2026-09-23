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
import { MockAdapter, type SpawnTaskOptions } from '../src/harness/index.js';
import { readRetryContext } from '../src/watcher/attempt.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

class RecordingAdapter extends MockAdapter {
  readonly spawns: SpawnTaskOptions[] = [];

  override async spawn(options: SpawnTaskOptions) {
    this.spawns.push(options);
    return super.spawn(options);
  }
}

async function writeTask(specFolder: string): Promise<void> {
  const taskPath = path.join(specFolder, 'tasks', '1.md');
  const task = [
    '---',
    'title: When a task is retried, the next start carries the attempt',
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

async function startedEvents(specFolder: string): Promise<Record<string, unknown>[]> {
  const raw = await fs.readFile(path.join(specFolder, '.run', 'events', '1.jsonl'), 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((event) => event.type === 'started');
}

describe('retry attempt numbering', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-retry-attempts-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Retry Attempts');
    specFolder = spec.folderPath;
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

  it('records attempt 1 on an initial execution', async () => {
    const adapter = new RecordingAdapter();
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.success, true);

    const started = await startedEvents(specFolder);
    assert.equal(started.length, 1);
    assert.equal((started[0].data as { attempt?: number }).attempt, 1);
    assert.equal(adapter.spawns[0]?.attempt, 1);
    assert.equal(adapter.spawns[0]?.priorFailureReason, undefined);
  });

  it('matches the preceding retry attempt and carries the failure reason', async () => {
    const deadDir = path.join(specFolder, '.run', 'dead');
    await fs.mkdir(deadDir, { recursive: true });
    await fs.writeFile(
      path.join(deadDir, '1.md'),
      '---\nreason: verify_red\n---\nprior failure\n',
      'utf8',
    );

    const retry = await retrySpec(tmpDir, '001', '1', DEFAULT_CONFIG);
    assert.equal(retry.attempt, 2);

    // A fresh adapter holds no in-memory retry state: the context is rebuilt
    // purely from the retained markers and the append-only retry event.
    const context = await readRetryContext(specFolder, '1');
    assert.deepEqual(context, { attempt: 2, reason: 'verify_red', output: 'prior failure\n' });

    const adapter = new RecordingAdapter();
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.success, true);

    const started = await startedEvents(specFolder);
    const last = started.at(-1);
    assert.equal((last?.data as { attempt?: number }).attempt, 2);
    assert.equal(adapter.spawns[0]?.attempt, 2);
    assert.equal(adapter.spawns[0]?.priorFailureReason, 'verify_red');
  });
});
