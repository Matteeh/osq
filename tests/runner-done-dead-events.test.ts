import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { acquireLock } from '../src/core/lock.js';
import { createNewSpec } from '../src/core/new.js';
import { MockAdapter } from '../src/harness/mock.js';
import type { DeadEventData, DoneEventData, HarnessEventType } from '../src/harness/types.js';
import { runTask } from '../src/watcher/runner.js';

// Compile-time acceptance: the union and payload interfaces must exist and have
// the documented shapes. These assertions run for real, so the imports are used.
const DONE_TYPE: HarnessEventType = 'done';
const DEAD_TYPE: HarnessEventType = 'dead';
const DONE_DATA: DoneEventData = { task: '1' };
const DEAD_DATA: DeadEventData = { task: '1', reason: 'no_result' };

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

async function readEvents(specFolder: string, taskNumber: string): Promise<ParsedEvent[]> {
  const eventFilePath = path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`);
  const raw = await fs.readFile(eventFilePath, 'utf8');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

async function writeTask(specFolder: string, verify: string): Promise<void> {
  const taskPath = path.join(specFolder, 'tasks', '1.md');
  const task = [
    '---',
    'title: When the runner writes a marker, a matching event is appended',
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

describe('Runner done and dead events', () => {
  let tmpDir: string;
  let specFolder: string;
  let adapter: MockAdapter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-done-dead-events-test-'));
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Done Dead Events');
    specFolder = spec.folderPath;
    adapter = new MockAdapter();
    await writeTask(specFolder, 'node -e "process.exit(0)"');
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    adapter.resetBehavior();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('defines the done and dead event payloads', () => {
    assert.equal(DONE_TYPE, 'done');
    assert.equal(DEAD_TYPE, 'dead');
    assert.equal(DONE_DATA.task, '1');
    assert.equal(DEAD_DATA.task, '1');
    assert.equal(DEAD_DATA.reason, 'no_result');
  });

  it('appends a done event alongside the done marker on success', async () => {
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.success, true);

    // The done marker exists...
    await fs.stat(path.join(specFolder, '.run', 'done', '1'));

    // ...and exactly one matching done event was appended.
    const doneEvents = (await readEvents(specFolder, '1')).filter((e) => e.type === 'done');
    assert.equal(doneEvents.length, 1);
    assert.deepEqual(doneEvents[0].data, { task: '1' });
    assert.ok(!Number.isNaN(Date.parse(doneEvents[0].timestamp)));
  });

  it('appends a dead event alongside the dead marker for no_result', async () => {
    adapter.setBehavior({ writeResult: false });
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.reason, 'no_result');

    const deadContent = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.ok(deadContent.includes('reason: no_result'));

    const deadEvents = (await readEvents(specFolder, '1')).filter((e) => e.type === 'dead');
    assert.equal(deadEvents.length, 1);
    assert.deepEqual(deadEvents[0].data, { task: '1', reason: 'no_result' });
  });

  it('appends a dead event alongside the dead marker for crashed', async () => {
    adapter.setBehavior({ exitCode: 7, error: 'boom' });
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.reason, 'crashed');

    const deadContent = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.ok(deadContent.includes('reason: crashed'));

    const deadEvents = (await readEvents(specFolder, '1')).filter((e) => e.type === 'dead');
    assert.equal(deadEvents.length, 1);
    assert.deepEqual(deadEvents[0].data, { task: '1', reason: 'crashed' });
  });

  it('appends a dead event alongside the dead marker for timeout', async () => {
    adapter.setBehavior({ timedOut: true });
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.reason, 'timeout');

    const deadContent = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.ok(deadContent.includes('reason: timeout'));

    const deadEvents = (await readEvents(specFolder, '1')).filter((e) => e.type === 'dead');
    assert.equal(deadEvents.length, 1);
    assert.deepEqual(deadEvents[0].data, { task: '1', reason: 'timeout' });
  });

  it('appends a dead event alongside the dead marker for verify_red', async () => {
    await writeTask(specFolder, 'node -e "process.exit(1)"');
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.reason, 'verify_red');

    const deadContent = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.ok(deadContent.includes('reason: verify_red'));

    const deadEvents = (await readEvents(specFolder, '1')).filter((e) => e.type === 'dead');
    assert.equal(deadEvents.length, 1);
    assert.deepEqual(deadEvents[0].data, { task: '1', reason: 'verify_red' });
  });

  it('appends a dead event alongside the dead marker for spec_conflict', async () => {
    await fs.appendFile(path.join(specFolder, 'tasks', '1.md'), '\n<!-- tampered -->\n', 'utf8');

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.reason, 'spec_conflict');

    const deadContent = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.ok(deadContent.includes('reason: spec_conflict'));

    const deadEvents = (await readEvents(specFolder, '1')).filter((e) => e.type === 'dead');
    assert.equal(deadEvents.length, 1);
    assert.deepEqual(deadEvents[0].data, { task: '1', reason: 'spec_conflict' });
  });

  it('appends a dead event for spec_conflict when approval is missing', async () => {
    await fs.rm(path.join(specFolder, '.run', 'approved'), { force: true });

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.reason, 'spec_conflict');

    const deadContent = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.ok(deadContent.includes('reason: spec_conflict'));

    const deadEvents = (await readEvents(specFolder, '1')).filter((e) => e.type === 'dead');
    assert.equal(deadEvents.length, 1);
    assert.deepEqual(deadEvents[0].data, { task: '1', reason: 'spec_conflict' });
  });

  it('does not append a dead event for already_running when the lock is held', async () => {
    await acquireLock(path.join(specFolder, '.run'), '1');

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.reason, 'already_running');

    let deadEvents: ParsedEvent[] = [];
    try {
      deadEvents = (await readEvents(specFolder, '1')).filter((e) => e.type === 'dead');
    } catch {
      // Event file may not exist if no events were appended
    }
    assert.equal(deadEvents.length, 0);
  });
});
