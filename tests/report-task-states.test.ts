import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { createNewSpec } from '../src/core/new.js';
import { getMetricsReport } from '../src/core/report.js';
import { deriveSpecState } from '../src/core/state.js';

const fixtureReportRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixture',
  'report',
);

async function writeTask(specFolderPath: string, taskNumber: string): Promise<void> {
  await fs.mkdir(path.join(specFolderPath, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(specFolderPath, 'tasks', `${taskNumber}.md`),
    `---
title: Task ${taskNumber}
verify: node -e "process.exit(0)"
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] Criteria ${taskNumber}
`,
    'utf8',
  );
}

async function createArchivedSpec(
  projectRoot: string,
  folderName: string,
  taskNumbers: string[],
): Promise<string> {
  const folderPath = path.join(projectRoot, 'specs', 'archive', folderName);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(folderPath, 'spec.md'),
    `---
title: ${folderName}
features:
  reads: []
  writes: []
---
## Goal
Archived spec
`,
    'utf8',
  );
  for (const taskNumber of taskNumbers) {
    await writeTask(folderPath, taskNumber);
  }
  return folderPath;
}

describe('report task states', () => {
  describe('fixture/report', () => {
    it('contains archived specs 008 and 009 with a dead-then-retried task in 009 events', async () => {
      const spec8 = path.join(
        fixtureReportRoot,
        'specs',
        'archive',
        '008-opencode-harness-adapter',
      );
      const spec9 = path.join(fixtureReportRoot, 'specs', 'archive', '009-watcher-observability');

      assert.ok((await fs.stat(spec8)).isDirectory());
      assert.ok((await fs.stat(spec9)).isDirectory());

      const events = await fs.readFile(path.join(spec9, '.run', 'events', '1.jsonl'), 'utf8');
      const types = events
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line).type as string);

      const deadIndex = types.indexOf('dead');
      const doneIndex = types.indexOf('done');
      assert.notEqual(deadIndex, -1, 'task 1 should have a dead event');
      assert.notEqual(doneIndex, -1, 'task 1 should have a done event');
      assert.ok(deadIndex < doneIndex, 'dead event should precede the done retry event');
    });

    it('reports 14 total tasks and 14 done with no pending or running tasks', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);

      assert.equal(report.specs.total, 2);
      assert.equal(report.specs.active, 0);
      assert.equal(report.specs.archived, 2);

      assert.equal(report.tasks.total, 14);
      assert.equal(report.tasks.done, 14);
      assert.equal(report.tasks.dead, 0);
      assert.equal(report.tasks.running, 0);
      assert.equal(report.tasks.pending, 0);
      assert.equal(report.completionRate, 100);
    });
  });

  describe('active specs', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-task-states-'));
      await scaffoldProject(tmpDir);
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('tallies task states from deriveSpecState', async () => {
      const spec = await createNewSpec(tmpDir, 'Active Spec');
      const runDir = path.join(spec.folderPath, '.run');

      await writeTask(spec.folderPath, '2');
      await writeTask(spec.folderPath, '3');
      await writeTask(spec.folderPath, '4');

      await fs.mkdir(path.join(runDir, 'done'), { recursive: true });
      await fs.writeFile(path.join(runDir, 'done', '1'), '', 'utf8');

      await fs.mkdir(path.join(runDir, 'dead'), { recursive: true });
      await fs.writeFile(
        path.join(runDir, 'dead', '2.md'),
        '---\nreason: verify_red\n---\nfailed\n',
        'utf8',
      );

      await fs.mkdir(path.join(runDir, 'running'), { recursive: true });
      await fs.writeFile(path.join(runDir, 'running', '3.pid'), '1234\n', 'utf8');

      const specState = await deriveSpecState(tmpDir, spec.folderPath);
      const expected = { done: 0, dead: 0, running: 0, pending: 0 };
      for (const task of specState.tasks) {
        expected[task.status] += 1;
      }

      const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

      assert.equal(report.tasks.total, specState.tasks.length);
      assert.equal(report.tasks.done, expected.done);
      assert.equal(report.tasks.dead, expected.dead);
      assert.equal(report.tasks.running, expected.running);
      assert.equal(report.tasks.pending, expected.pending);
      assert.equal(report.tasks.done, 1);
      assert.equal(report.tasks.dead, 1);
      assert.equal(report.tasks.running, 1);
      assert.equal(report.tasks.pending, 1);
    });
  });

  describe('archived specs', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-task-states-'));
      await scaffoldProject(tmpDir);
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('derives task status from done and dead events in events.jsonl', async () => {
      const folderPath = await createArchivedSpec(tmpDir, '001-events-spec', ['1', '2']);
      const eventsDir = path.join(folderPath, '.run', 'events');
      await fs.mkdir(eventsDir, { recursive: true });

      await fs.writeFile(
        path.join(eventsDir, '1.jsonl'),
        [
          JSON.stringify({ type: 'started', timestamp: '2026-09-17T00:00:00.000Z' }),
          JSON.stringify({
            type: 'dead',
            timestamp: '2026-09-17T00:00:01.000Z',
            data: { task: '1', reason: 'crashed' },
          }),
          JSON.stringify({
            type: 'done',
            timestamp: '2026-09-17T00:00:02.000Z',
            data: { task: '1' },
          }),
        ].join('\n'),
        'utf8',
      );
      await fs.writeFile(
        path.join(eventsDir, '2.jsonl'),
        [
          JSON.stringify({ type: 'started', timestamp: '2026-09-17T00:01:00.000Z' }),
          JSON.stringify({
            type: 'dead',
            timestamp: '2026-09-17T00:01:01.000Z',
            data: { task: '2', reason: 'timeout' },
          }),
        ].join('\n'),
        'utf8',
      );

      const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

      assert.equal(report.tasks.total, 2);
      assert.equal(report.tasks.done, 1);
      assert.equal(report.tasks.dead, 1);
      assert.equal(report.tasks.pending, 0);
      assert.equal(report.tasks.running, 0);
      assert.equal(report.failureBreakdown.timeout, 1);
    });

    it('falls back to done and dead markers when no events exist', async () => {
      const folderPath = await createArchivedSpec(tmpDir, '002-markers-spec', ['1', '2']);

      await fs.mkdir(path.join(folderPath, '.run', 'done'), { recursive: true });
      await fs.writeFile(path.join(folderPath, '.run', 'done', '1'), '', 'utf8');

      await fs.mkdir(path.join(folderPath, '.run', 'dead'), { recursive: true });
      await fs.writeFile(
        path.join(folderPath, '.run', 'dead', '2.md'),
        '---\nreason: verify_red\n---\nfailed\n',
        'utf8',
      );

      const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

      assert.equal(report.tasks.total, 2);
      assert.equal(report.tasks.done, 1);
      assert.equal(report.tasks.dead, 1);
      assert.equal(report.tasks.pending, 0);
      assert.equal(report.tasks.running, 0);
      assert.equal(report.failureBreakdown.verify_red, 1);
    });

    it('never reports pending or running tasks when markers are absent', async () => {
      const folderPath = await createArchivedSpec(tmpDir, '003-legacy-spec', ['1', '2']);

      // A stale running lock must not make an archived spec report a running task.
      await fs.mkdir(path.join(folderPath, '.run', 'running'), { recursive: true });
      await fs.writeFile(path.join(folderPath, '.run', 'running', '1.pid'), '999999\n', 'utf8');

      const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

      assert.equal(report.tasks.total, 2);
      assert.equal(report.tasks.done, 2);
      assert.equal(report.tasks.dead, 0);
      assert.equal(report.tasks.running, 0);
      assert.equal(report.tasks.pending, 0);
      assert.equal(report.completionRate, 100);
    });

    it('counts a task with a done event as done even when no markers exist', async () => {
      const folderPath = await createArchivedSpec(tmpDir, '004-event-only-spec', ['1']);
      const eventsDir = path.join(folderPath, '.run', 'events');
      await fs.mkdir(eventsDir, { recursive: true });
      await fs.writeFile(
        path.join(eventsDir, '1.jsonl'),
        JSON.stringify({
          type: 'done',
          timestamp: '2026-09-17T00:00:00.000Z',
          data: { task: '1' },
        }),
        'utf8',
      );

      const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

      assert.equal(report.tasks.done, 1);
      assert.equal(report.tasks.dead, 0);
      assert.equal(report.tasks.pending, 0);
      assert.equal(report.tasks.running, 0);
    });
  });
});
