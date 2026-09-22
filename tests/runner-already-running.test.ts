import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createLogger } from '../src/core/foundation/logger.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { formatMetricsReport, getMetricsReport } from '../src/core/report/report.js';
import { acquireLock } from '../src/core/run/lock.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { AgyAdapter } from '../src/harness/agy/agy.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

async function readEvents(specFolder: string, taskNumber: string): Promise<ParsedEvent[]> {
  const eventFilePath = path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`);
  let raw = '';
  try {
    raw = await fs.readFile(eventFilePath, 'utf8');
  } catch {
    return [];
  }
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

async function fileExists(filePath: string): Promise<boolean> {
  return fs
    .stat(filePath)
    .then(() => true)
    .catch(() => false);
}

async function captureStderr(fn: () => Promise<void>): Promise<string> {
  const originalWrite = process.stderr.write;
  let stderr = '';
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stderr.write;

  try {
    await fn();
  } finally {
    process.stderr.write = originalWrite;
  }

  return stderr;
}

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

async function writePassingTask(specFolder: string): Promise<void> {
  const taskPath = path.join(specFolder, 'tasks', '1.md');
  const task = [
    '---',
    'title: When a lock collision occurs, no dead marker is written',
    `verify: ${PASSING_VERIFY}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] should not be attempted',
  ].join('\n');
  await fs.writeFile(taskPath, `${task}\n`, 'utf8');
}

/**
 * Real on-disk agy binary emitting a completed result message. The lock
 * collision aborts before spawn, but the test still drives the real
 * `AgyAdapter` against a fake harness binary rather than a mock adapter.
 */
const FAKE_AGY_SCRIPT = `#!/usr/bin/env node
const line = JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'finished' } });
process.stdout.write(line + '\\n');
process.exit(0);
`;

/**
 * Real on-disk agy binary that stays silent and writes no result file, forcing
 * the runner's `no_result` marker path.
 */
const FAKE_AGY_SILENT_SCRIPT = `#!/usr/bin/env node
process.exit(0);
`;

describe('Runner already_running lock collision', () => {
  let tmpDir: string;
  let specFolder: string;
  let fakeAgyBin: string;
  let silentAgyBin: string;
  let originalAgyPath: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-already-running-test-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Already Running');
    specFolder = spec.folderPath;
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
    const seededProposalPath = path.join(specFolder, 'proposal.md');
    const seededProposal = await fs.readFile(seededProposalPath, 'utf8').catch(() => null);
    if (seededProposal !== null) {
      await fs.writeFile(
        seededProposalPath,
        seededProposal.replace(/^verify:.*$/m, `verify: ${PASSING_VERIFY}`),
        'utf8',
      );
    }
    await writePassingTask(specFolder);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    fakeAgyBin = path.join(tmpDir, 'fake-agy.mjs');
    silentAgyBin = path.join(tmpDir, 'fake-agy-silent.mjs');
    await fs.writeFile(fakeAgyBin, FAKE_AGY_SCRIPT, { mode: 0o755 });
    await fs.writeFile(silentAgyBin, FAKE_AGY_SILENT_SCRIPT, { mode: 0o755 });

    originalAgyPath = process.env.AGY_PATH;
    process.env.AGY_PATH = fakeAgyBin;
  });

  afterEach(async () => {
    if (originalAgyPath === undefined) {
      Reflect.deleteProperty(process.env, 'AGY_PATH');
    } else {
      process.env.AGY_PATH = originalAgyPath;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('aborts with already_running without a dead marker or dead event', async () => {
    await acquireLock(path.join(specFolder, '.run'), '1');

    const adapter = new AgyAdapter();
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);

    assert.equal(result.success, false);
    assert.equal(result.reason, 'already_running');
    assert.equal(result.error, 'Task is already running');

    // No dead marker file may be written for a lock collision.
    assert.equal(await fileExists(path.join(specFolder, '.run', 'dead', '1.md')), false);

    // The append-only event stream must remain free of dead events.
    const events = await readEvents(specFolder, '1');
    const deadEvents = events.filter((event) => event.type === 'dead');
    assert.equal(deadEvents.length, 0);

    // The collision is an in-flight task, so the held lock is left untouched.
    assert.equal(await fileExists(path.join(specFolder, '.run', 'running', '1.pid')), true);
  });

  it('logs the already_running outcome summary to stderr', async () => {
    await acquireLock(path.join(specFolder, '.run'), '1');

    const adapter = new AgyAdapter();
    const logger = createLogger('normal');

    let reason = '';
    const stderr = await captureStderr(async () => {
      const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter, logger);
      reason = result.reason ?? '';
    });

    assert.equal(reason, 'already_running');
    assert.match(stderr, /task 1 dead \(reason: already_running/);
  });

  it('does not report the lock collision as a task failure in osq report', async () => {
    await acquireLock(path.join(specFolder, '.run'), '1');

    const adapter = new AgyAdapter();
    await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);

    const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

    assert.equal(report.now.dead, 0);
    assert.equal(report.history.deadByReason.already_running, undefined);
    assert.ok(!formatMetricsReport(report).includes('already_running'));
  });

  it('only writes a dead event when an explicit dead marker is written', async () => {
    // Positive control: a real `no_result` failure writes a dead marker and,
    // with it, exactly one matching dead event.
    process.env.AGY_PATH = silentAgyBin;

    const adapter = new AgyAdapter();
    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);

    assert.equal(result.reason, 'no_result');
    assert.equal(await fileExists(path.join(specFolder, '.run', 'dead', '1.md')), true);

    const deadEvents = (await readEvents(specFolder, '1')).filter((event) => event.type === 'dead');
    assert.equal(deadEvents.length, 1);
    assert.deepEqual(deadEvents[0].data, { task: '1', reason: 'no_result' });
  });
});
