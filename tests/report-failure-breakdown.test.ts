import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { formatMetricsReport, getMetricsReport } from '../src/core/report/report.js';

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

async function writeDeadMarker(
  specFolderPath: string,
  taskNumber: string,
  reason: string,
): Promise<void> {
  const deadDir = path.join(specFolderPath, '.run', 'dead');
  await fs.mkdir(deadDir, { recursive: true });
  await fs.writeFile(
    path.join(deadDir, `${taskNumber}.md`),
    `---\nreason: ${reason}\n---\nTask failed\n`,
    'utf8',
  );
}

async function writeEvent(
  specFolderPath: string,
  taskNumber: string,
  event: Record<string, unknown>,
): Promise<void> {
  const eventsDir = path.join(specFolderPath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  await fs.appendFile(
    path.join(eventsDir, `${taskNumber}.jsonl`),
    `${JSON.stringify(event)}\n`,
    'utf8',
  );
}

function deadEvent(task: string, reason: string): Record<string, unknown> {
  return {
    type: 'dead',
    timestamp: '2026-09-17T00:00:00.000Z',
    data: { task, reason },
  };
}

describe('report failure breakdown', () => {
  describe('fixture/report', () => {
    it('retains the historical crashed failure of a retried task while reporting zero current dead tasks', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);

      assert.equal(report.now.dead, 0);
      assert.equal(report.history.deadByReason.crashed, 1);
    });

    it('formats the historical dead reasons per reason', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);
      const formatted = formatMetricsReport(report);

      assert.ok(formatted.includes('History:'), formatted);
      assert.ok(formatted.includes('Dead by reason:\n    crashed: 1'), formatted);
    });
  });

  describe('event history', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-failure-breakdown-'));
      await scaffoldProject(tmpDir);
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('counts every dead event in history grouped by reason', async () => {
      const spec = await createNewSpec(tmpDir, 'History Spec');
      await writeTask(spec.folderPath, '1');
      await writeTask(spec.folderPath, '2');
      await writeTask(spec.folderPath, '3');

      await writeEvent(spec.folderPath, '1', deadEvent('1', 'crashed'));
      await writeEvent(spec.folderPath, '2', deadEvent('2', 'timeout'));
      await writeEvent(spec.folderPath, '3', deadEvent('3', 'crashed'));

      const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

      assert.deepEqual(report.history.deadByReason, { crashed: 2, timeout: 1 });
    });

    it('retains dead events for tasks that are later retried and completed', async () => {
      const spec = await createNewSpec(tmpDir, 'Retry Spec');
      await writeTask(spec.folderPath, '1');

      await writeEvent(spec.folderPath, '1', deadEvent('1', 'crashed'));
      await writeEvent(spec.folderPath, '1', {
        type: 'done',
        timestamp: '2026-09-17T00:00:01.000Z',
        data: { task: '1' },
      });
      await writeEvent(spec.folderPath, '1', deadEvent('1', 'crashed'));
      await writeEvent(spec.folderPath, '1', {
        type: 'done',
        timestamp: '2026-09-17T00:00:02.000Z',
        data: { task: '1' },
      });

      await fs.mkdir(path.join(spec.folderPath, '.run', 'done'), { recursive: true });
      await fs.writeFile(path.join(spec.folderPath, '.run', 'done', '1'), '', 'utf8');

      const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

      assert.equal(report.now.done, 1);
      assert.equal(report.now.dead, 0);
      assert.equal(report.history.deadByReason.crashed, 2);
    });

    it('defaults a dead event without a reason to unknown', async () => {
      const spec = await createNewSpec(tmpDir, 'Reasonless Spec');
      await writeTask(spec.folderPath, '1');

      await writeEvent(spec.folderPath, '1', {
        type: 'dead',
        timestamp: '2026-09-17T00:00:00.000Z',
        data: { task: '1' },
      });

      const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

      assert.deepEqual(report.history.deadByReason, { unknown: 1 });
    });
  });

  describe('marker independence', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-failure-breakdown-'));
      await scaffoldProject(tmpDir);
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('counts dead markers in current state without inventing history', async () => {
      const spec = await createNewSpec(tmpDir, 'Legacy Spec');
      await writeTask(spec.folderPath, '1');
      await writeTask(spec.folderPath, '2');

      await writeDeadMarker(spec.folderPath, '1', 'verify_red');
      await writeDeadMarker(spec.folderPath, '2', 'timeout');

      const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

      assert.equal(report.now.dead, 2);
      assert.deepEqual(report.history.deadByReason, {});
    });

    it('ignores dead markers even when some tasks have dead events', async () => {
      const spec = await createNewSpec(tmpDir, 'Mixed Spec');
      await writeTask(spec.folderPath, '1');
      await writeTask(spec.folderPath, '2');

      await writeEvent(spec.folderPath, '1', deadEvent('1', 'crashed'));
      await writeDeadMarker(spec.folderPath, '2', 'verify_red');

      const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

      assert.equal(report.history.deadByReason.verify_red, undefined);
      assert.deepEqual(report.history.deadByReason, { crashed: 1 });
      assert.equal(report.now.dead, 1);
    });
  });

  describe('formatting', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-failure-breakdown-'));
      await scaffoldProject(tmpDir);
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('prints (none) when there are no dead events', async () => {
      const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);
      const formatted = formatMetricsReport(report);

      assert.deepEqual(report.history.deadByReason, {});
      assert.ok(formatted.includes('Dead by reason:\n    (none)'), formatted);
    });
  });
});
