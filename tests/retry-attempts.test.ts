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
import { MockAdapter, type SpawnTaskOptions } from '../src/harness/index.js';
import { readRetryContext } from '../src/watcher/attempt.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

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
    'verify: node -e "process.exit(0)"',
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
    assert.deepEqual(context, { attempt: 2, reason: 'verify_red' });

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
