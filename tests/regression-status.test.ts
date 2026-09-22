import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { getRegressedMarkerPath } from '../src/core/status/layout.js';
import type { SpecState, TaskState } from '../src/core/status/state.js';
import {
  type StatusOverview,
  formatStatusLine,
  formatStatusOverview,
} from '../src/core/status/status.js';
import type { RegressedEventData } from '../src/harness/types.js';
import {
  formatTaskOutcomeLine,
  recordRegressedEvent,
  writeRegressedMarker,
} from '../src/watcher/outcome.js';

function regressedTask(): TaskState {
  return {
    taskNumber: '3',
    fileName: '3.md',
    title: 'Task three',
    status: 'regressed',
    verify: 'node -e "process.exit(0)"',
  };
}

function regressedSpec(): SpecState {
  return {
    id: '001',
    folderName: '001-regression',
    folderPath: '/does/not/exist/001-regression',
    title: 'Regression Spec',
    status: 'regressed',
    approvedHash: 'sha256:abc123',
    tasks: [regressedTask()],
    nextTask: null,
  };
}

describe('regressed status formatting', () => {
  it('formats a regressed task with the regressed indicator and label', () => {
    const line = formatStatusLine(regressedTask());
    assert.ok(line.includes('[!] 3.'), `expected [!] indicator, got: ${line}`);
    assert.ok(line.includes('[regressed]'), `expected [regressed] label, got: ${line}`);
    assert.ok(line.includes('Task three'));
  });

  it('formats an active spec overview with a regressed indicator', () => {
    const overview: StatusOverview = {
      specs: [regressedSpec()],
      rejected: [],
      archivedCount: 0,
      archivedChangeFolders: 0,
    };
    const output = formatStatusOverview(overview);
    assert.ok(output.includes('001-regression: Regression Spec [regressed] (approved)'));
    assert.ok(output.includes('[!] 3.'));
    assert.ok(output.includes('[regressed]'));
  });

  it('formats a regressed task outcome line with the fallback word', () => {
    const line = formatTaskOutcomeLine('3', false, 'regressed', 1.5, false, 'scope changed');
    assert.ok(line.startsWith('[regressed]'), `expected plain fallback, got: ${line}`);
    assert.ok(line.includes('task 3 regressed'));
    assert.ok(line.includes('scope changed'));
  });

  it('formats a regressed task outcome line with the unicode failure symbol', () => {
    const line = formatTaskOutcomeLine('3', false, 'regressed', 1.5, true);
    assert.ok(line.startsWith('? task 3 regressed'), `expected ? symbol, got: ${line}`);
    assert.ok(!line.includes('[regressed]'));
  });
});

describe('regressed marker and event writers', () => {
  let tmpDir: string;
  let specFolder: string;
  let runDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-regression-status-test-'));
    specFolder = path.join(tmpDir, 'openspec', 'changes', '001-regression');
    runDir = path.join(specFolder, '.run');
    await fs.mkdir(specFolder, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes a regressed marker under .run/regressed', async () => {
    const content = '---\nreason: scope_regression\n---\nTask 3 scope changed.\n';
    await writeRegressedMarker(runDir, '3', content);

    const markerPath = getRegressedMarkerPath(specFolder, '3');
    assert.equal(markerPath, path.join(runDir, 'regressed', '3.md'));
    assert.equal(await fs.readFile(markerPath, 'utf8'), content);
  });

  it('writes a change-level regressed marker for the change target', async () => {
    await writeRegressedMarker(runDir, 'change', '---\nreason: verify_regression\n---\n');
    const markerPath = getRegressedMarkerPath(specFolder, 'change');
    assert.equal(markerPath, path.join(runDir, 'regressed', 'change.md'));
    assert.ok(await fs.stat(markerPath));
  });

  it('appends a typed regressed event to the task event stream', async () => {
    const data: RegressedEventData = {
      reason: 'scope_regression',
      differingPaths: ['src/core/state.ts (modified)'],
    };
    await recordRegressedEvent(specFolder, '3', data);

    const raw = await fs.readFile(path.join(runDir, 'events', '3.jsonl'), 'utf8');
    const event = JSON.parse(raw.trim()) as {
      type: string;
      timestamp: string;
      data: Record<string, unknown>;
    };
    assert.equal(event.type, 'regressed');
    assert.equal(event.data.task, '3');
    assert.equal(event.data.reason, 'scope_regression');
    assert.deepEqual(event.data.differingPaths, ['src/core/state.ts (modified)']);
    assert.ok(!Number.isNaN(Date.parse(event.timestamp)));
  });

  it('lets event data override the default task and appends without clobbering', async () => {
    await recordRegressedEvent(specFolder, '3', { reason: 'first' });
    await recordRegressedEvent(specFolder, '3', { task: 'change', reason: 'second' });

    const raw = await fs.readFile(path.join(runDir, 'events', '3.jsonl'), 'utf8');
    const events = raw
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { type: string; data: Record<string, unknown> });
    assert.equal(events.length, 2);
    assert.equal(events[0].data.task, '3');
    assert.equal(events[1].data.task, 'change');
  });
});
