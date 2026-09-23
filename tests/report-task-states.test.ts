import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { getMetricsReport } from '../src/core/report/report.js';
import { deriveSpecState } from '../src/core/status/state.js';

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
  const folderPath = path.join(projectRoot, 'openspec', 'changes', 'archive', folderName);
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

async function writeMarker(
  specFolderPath: string,
  kind: 'done' | 'dead' | 'regressed' | 'running',
  taskNumber: string,
): Promise<void> {
  if (kind === 'done') {
    await fs.mkdir(path.join(specFolderPath, '.run', 'done'), { recursive: true });
    await fs.writeFile(path.join(specFolderPath, '.run', 'done', taskNumber), '', 'utf8');
    return;
  }
  if (kind === 'running') {
    await fs.mkdir(path.join(specFolderPath, '.run', 'running'), { recursive: true });
    await fs.writeFile(
      path.join(specFolderPath, '.run', 'running', `${taskNumber}.pid`),
      '1',
      'utf8',
    );
    return;
  }
  const dir = kind === 'dead' ? 'dead' : 'regressed';
  await fs.mkdir(path.join(specFolderPath, '.run', dir), { recursive: true });
  const body =
    kind === 'dead' ? '---\nreason: verify_red\n---\nfailed\n' : '---\nreason: regressed\n---\n';
  await fs.writeFile(path.join(specFolderPath, '.run', dir, `${taskNumber}.md`), body, 'utf8');
}

describe('report task states', () => {
  describe('fixture/report', () => {
    it('contains archived specs 008, 009, and 010 with the expected event shapes', async () => {
      const spec8 = path.join(
        fixtureReportRoot,
        'specs',
        'archive',
        '008-opencode-harness-adapter',
      );
      const spec9 = path.join(fixtureReportRoot, 'specs', 'archive', '009-watcher-observability');
      const spec10 = path.join(fixtureReportRoot, 'specs', 'archive', '010-report-history-state');

      assert.ok((await fs.stat(spec8)).isDirectory());
      assert.ok((await fs.stat(spec9)).isDirectory());
      assert.ok((await fs.stat(spec10)).isDirectory());

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

      // Missing coverage for task 1, an unexplained re-run for task 2, and a
      // historical dead event for task 3.
      assert.equal(
        await fs
          .stat(path.join(spec10, '.run', 'events', '1.jsonl'))
          .then(() => true)
          .catch(() => false),
        false,
      );
      const rerun = await fs.readFile(path.join(spec10, '.run', 'events', '2.jsonl'), 'utf8');
      const rerunTypes = rerun
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line).type as string);
      assert.deepEqual(rerunTypes, ['started', 'started', 'verify_ran']);

      const dead = await fs.readFile(path.join(spec10, '.run', 'events', '3.jsonl'), 'utf8');
      assert.ok(dead.includes('"type":"dead"'));
    });

    it('reports 17 total tasks with current state derived from markers', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);

      assert.equal(report.specs.total, 3);
      assert.equal(report.specs.active, 0);
      assert.equal(report.specs.archived, 3);

      assert.equal(report.now.total, 17);
      assert.equal(report.now.done, 17);
      assert.equal(report.now.verified, 17);
      assert.equal(report.now.manual, 0);
      assert.equal(report.now.dead, 0);
      assert.equal(report.now.regressed, 0);
      assert.equal(report.now.running, 0);
      assert.equal(report.now.pending, 0);
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
      await writeTask(spec.folderPath, '5');

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

      await fs.mkdir(path.join(runDir, 'regressed'), { recursive: true });
      await fs.writeFile(
        path.join(runDir, 'regressed', '5.md'),
        '---\nreason: regressed\n---\n',
        'utf8',
      );

      const specState = await deriveSpecState(tmpDir, spec.folderPath);
      const expected = { done: 0, dead: 0, running: 0, pending: 0, regressed: 0 };
      for (const task of specState.tasks) {
        expected[task.status] += 1;
      }

      const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

      assert.equal(report.now.total, specState.tasks.length);
      assert.equal(report.now.done, expected.done);
      assert.equal(report.now.dead, expected.dead);
      assert.equal(report.now.running, expected.running);
      assert.equal(report.now.regressed, expected.regressed);
      assert.equal(report.now.pending, expected.pending);
      assert.equal(report.now.done, 1);
      assert.equal(report.now.dead, 1);
      assert.equal(report.now.running, 1);
      assert.equal(report.now.regressed, 1);
      assert.equal(report.now.pending, 1);
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

    it('derives current state from markers, not terminal events', async () => {
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

      // No markers exist, and the change is archived, so current state is
      // unmarked despite terminal events.
      assert.equal(report.now.total, 2);
      assert.equal(report.now.done, 0);
      assert.equal(report.now.dead, 0);
      assert.equal(report.now.pending, 0);
      assert.equal(report.now.unmarked, 2);

      // History still records the events.
      assert.equal(report.history.deadByReason.timeout, 1);
      assert.equal(report.history.deadByReason.crashed, 1);
    });

    it('derives archived task status from done and dead markers', async () => {
      const folderPath = await createArchivedSpec(tmpDir, '002-markers-spec', ['1', '2']);
      await writeMarker(folderPath, 'done', '1');
      await writeMarker(folderPath, 'dead', '2');

      const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

      assert.equal(report.now.total, 2);
      assert.equal(report.now.done, 1);
      assert.equal(report.now.dead, 1);
      assert.equal(report.now.pending, 0);
      assert.equal(report.now.unmarked, 0);
      assert.equal(report.now.running, 0);
      assert.deepEqual(report.history.deadByReason, {});
    });

    it('reports archived tasks with no markers as unmarked', async () => {
      await createArchivedSpec(tmpDir, '003-legacy-spec', ['1', '2']);

      const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

      assert.equal(report.now.total, 2);
      assert.equal(report.now.done, 0);
      assert.equal(report.now.dead, 0);
      assert.equal(report.now.running, 0);
      assert.equal(report.now.pending, 0);
      assert.equal(report.now.unmarked, 2);
      assert.equal(report.completionRate, 0);
    });

    it('does not count a done event as a current completion', async () => {
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

      assert.equal(report.now.done, 0);
      assert.equal(report.now.dead, 0);
      assert.equal(report.now.pending, 0);
      assert.equal(report.now.unmarked, 1);
    });
  });
});
