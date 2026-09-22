import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import {
  type MetricsReport,
  formatMetricsReport,
  getMetricsReport,
} from '../src/core/report/report.js';

const fixtureReportRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixture',
  'report',
);

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-cycle-'));
  tmpDirs.push(root);
  await fs.mkdir(path.join(root, 'openspec', 'changes', 'archive'), { recursive: true });
  return root;
}

interface Lifecycle {
  briefDate?: string | null;
  approvedAt?: string | null;
  firstTaskStart?: string | null;
  archivedAt?: string | null;
  changeStreamStartedAt?: string | null;
}

async function createArchivedChange(
  root: string,
  name: string,
  lifecycle: Lifecycle,
): Promise<string> {
  const folder = path.join(root, 'openspec', 'changes', 'archive', name);
  const eventsDir = path.join(folder, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });

  if (lifecycle.briefDate !== undefined && lifecycle.briefDate !== null) {
    await fs.writeFile(
      path.join(folder, 'brief.md'),
      `---\ntitle: ${name}\ndate: ${lifecycle.briefDate}\n---\n## Goal\nx\n`,
      'utf8',
    );
  }

  if (lifecycle.approvedAt !== undefined && lifecycle.approvedAt !== null) {
    await fs.writeFile(
      path.join(folder, '.run', 'manifest.json'),
      `${JSON.stringify({ approvedAt: lifecycle.approvedAt }, null, 2)}\n`,
      'utf8',
    );
  }

  if (lifecycle.firstTaskStart !== undefined && lifecycle.firstTaskStart !== null) {
    await fs.writeFile(
      path.join(eventsDir, '2.jsonl'),
      `${JSON.stringify({
        type: 'started',
        timestamp: lifecycle.firstTaskStart,
        data: { taskTitle: 'task' },
      })}\n`,
      'utf8',
    );
  }

  const changeStream: string[] = [];
  if (lifecycle.changeStreamStartedAt) {
    changeStream.push(
      JSON.stringify({ type: 'started', timestamp: lifecycle.changeStreamStartedAt, data: {} }),
    );
  }
  if (lifecycle.archivedAt !== undefined && lifecycle.archivedAt !== null) {
    changeStream.push(
      JSON.stringify({
        type: 'archived',
        timestamp: lifecycle.archivedAt,
        data: { archivePath: name },
      }),
    );
  }
  if (changeStream.length > 0) {
    await fs.writeFile(
      path.join(eventsDir, 'change.jsonl'),
      `${changeStream.join('\n')}\n`,
      'utf8',
    );
  }

  return folder;
}

describe('report cycle metrics', () => {
  describe('fixture/report', () => {
    it('emits one sorted row per archived change with nullable phases', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);

      assert.deepEqual(report.cycle.byChange, [
        {
          change: '008-opencode-harness-adapter',
          briefToApprovalSeconds: null,
          approvalToFirstTaskSeconds: null,
          firstTaskToArchiveSeconds: null,
          totalSeconds: null,
        },
        {
          change: '009-watcher-observability',
          briefToApprovalSeconds: 72000,
          approvalToFirstTaskSeconds: 5866,
          firstTaskToArchiveSeconds: 8534,
          totalSeconds: 86400,
        },
        {
          change: '010-report-history-state',
          briefToApprovalSeconds: 82800,
          approvalToFirstTaskSeconds: 3600,
          firstTaskToArchiveSeconds: 3600,
          totalSeconds: 90000,
        },
      ]);
    });

    it('aggregates each phase over only its covered changes', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);

      assert.deepEqual(report.cycle.phases, {
        briefToApproval: {
          totalSeconds: 154800,
          averageSeconds: 77400,
          coveredChanges: 2,
          totalChanges: 3,
        },
        approvalToFirstTask: {
          totalSeconds: 9466,
          averageSeconds: 4733,
          coveredChanges: 2,
          totalChanges: 3,
        },
        firstTaskToArchive: {
          totalSeconds: 12134,
          averageSeconds: 6067,
          coveredChanges: 2,
          totalChanges: 3,
        },
        total: {
          totalSeconds: 176400,
          averageSeconds: 88200,
          coveredChanges: 2,
          totalChanges: 3,
        },
      });
    });

    it('prints only aggregate phase lines with the coverage phrase', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);
      const text = formatMetricsReport(report);

      assert.ok(text.includes('Cycle:'), text);
      assert.ok(text.includes('Brief to approval:'), text);
      assert.ok(text.includes('Approval to first task:'), text);
      assert.ok(text.includes('First task to archive:'), text);
      assert.ok(text.includes('2 of 3 archived changes'), text);
      // Aggregate cycle view is text; per-change cycle rows stay JSON-only.
      assert.ok(!text.includes('briefToApprovalSeconds'), text);
      assert.ok(!text.includes('approvalToFirstTaskSeconds'), text);
      assert.ok(!text.includes('firstTaskToArchiveSeconds'), text);
    });
  });

  describe('phase derivation', () => {
    it('derives a complete lifecycle and its total in seconds', async () => {
      const root = await makeProject();
      await createArchivedChange(root, '050-complete', {
        briefDate: '2026-01-01',
        approvedAt: '2026-01-01T01:00:00.000Z',
        firstTaskStart: '2026-01-01T02:00:00.000Z',
        archivedAt: '2026-01-01T03:00:00.000Z',
      });

      const report = await getMetricsReport(root, DEFAULT_CONFIG);

      assert.deepEqual(report.cycle.byChange, [
        {
          change: '050-complete',
          briefToApprovalSeconds: 3600,
          approvalToFirstTaskSeconds: 3600,
          firstTaskToArchiveSeconds: 3600,
          totalSeconds: 10800,
        },
      ]);
      assert.deepEqual(report.cycle.phases.total, {
        totalSeconds: 10800,
        averageSeconds: 10800,
        coveredChanges: 1,
        totalChanges: 1,
      });
    });

    it('keeps missing, invalid, and reversed endpoints null', async () => {
      const root = await makeProject();
      // Missing brief and archive event: only the middle phase survives.
      await createArchivedChange(root, '051-missing', {
        approvedAt: '2026-02-01T01:00:00.000Z',
        firstTaskStart: '2026-02-01T02:00:00.000Z',
      });
      // Invalid brief date.
      await createArchivedChange(root, '052-invalid', {
        briefDate: 'not-a-date',
        approvedAt: '2026-03-01T01:00:00.000Z',
        firstTaskStart: '2026-03-01T02:00:00.000Z',
        archivedAt: '2026-03-01T03:00:00.000Z',
      });
      // Approval precedes the brief date.
      await createArchivedChange(root, '053-reversed-approval', {
        briefDate: '2026-04-02',
        approvedAt: '2026-04-01T00:00:00.000Z',
        firstTaskStart: '2026-04-02T00:00:00.000Z',
        archivedAt: '2026-04-03T00:00:00.000Z',
      });
      // First task start precedes approval.
      await createArchivedChange(root, '054-reversed-task', {
        briefDate: '2026-05-01',
        approvedAt: '2026-05-01T02:00:00.000Z',
        firstTaskStart: '2026-05-01T01:00:00.000Z',
        archivedAt: '2026-05-01T03:00:00.000Z',
      });
      // Archive precedes the first task start.
      await createArchivedChange(root, '055-reversed-archive', {
        briefDate: '2026-06-01',
        approvedAt: '2026-06-01T01:00:00.000Z',
        firstTaskStart: '2026-06-01T02:00:00.000Z',
        archivedAt: '2026-06-01T01:30:00.000Z',
      });

      const report = await getMetricsReport(root, DEFAULT_CONFIG);
      const rows = Object.fromEntries(report.cycle.byChange.map((row) => [row.change, row]));

      assert.deepEqual(rows['051-missing'], {
        change: '051-missing',
        briefToApprovalSeconds: null,
        approvalToFirstTaskSeconds: 3600,
        firstTaskToArchiveSeconds: null,
        totalSeconds: null,
      });
      assert.equal(rows['052-invalid'].briefToApprovalSeconds, null);
      assert.equal(rows['052-invalid'].totalSeconds, null);
      assert.equal(rows['053-reversed-approval'].briefToApprovalSeconds, null);
      assert.equal(rows['054-reversed-task'].approvalToFirstTaskSeconds, null);
      assert.equal(rows['055-reversed-archive'].firstTaskToArchiveSeconds, null);

      // 054 and 055 keep a valid brief-to-approval phase; only their other
      // phases are reversed/missing.
      assert.deepEqual(report.cycle.phases.briefToApproval, {
        totalSeconds: 10800,
        averageSeconds: 5400,
        coveredChanges: 2,
        totalChanges: 5,
      });
      assert.deepEqual(report.cycle.phases.approvalToFirstTask, {
        totalSeconds: 97200,
        averageSeconds: 24300,
        coveredChanges: 4,
        totalChanges: 5,
      });
      assert.deepEqual(report.cycle.phases.firstTaskToArchive, {
        totalSeconds: 97200,
        averageSeconds: 32400,
        coveredChanges: 3,
        totalChanges: 5,
      });
      assert.deepEqual(report.cycle.phases.total, {
        totalSeconds: 0,
        averageSeconds: 0,
        coveredChanges: 0,
        totalChanges: 5,
      });
    });

    it('excludes active changes from cycle rows', async () => {
      const root = await makeProject();
      const activeFolder = path.join(root, 'openspec', 'changes', '060-active');
      await fs.mkdir(path.join(activeFolder, '.run', 'events'), { recursive: true });
      await fs.writeFile(
        path.join(activeFolder, 'brief.md'),
        '---\ndate: 2026-07-01\n---\n## Goal\nx\n',
        'utf8',
      );
      await fs.writeFile(
        path.join(activeFolder, '.run', 'manifest.json'),
        `${JSON.stringify({ approvedAt: '2026-07-01T01:00:00.000Z' })}\n`,
        'utf8',
      );
      await fs.writeFile(
        path.join(activeFolder, '.run', 'events', '2.jsonl'),
        `${JSON.stringify({ type: 'started', timestamp: '2026-07-01T02:00:00.000Z', data: {} })}\n`,
        'utf8',
      );
      await fs.writeFile(
        path.join(activeFolder, '.run', 'events', 'change.jsonl'),
        `${JSON.stringify({
          type: 'archived',
          timestamp: '2026-07-01T03:00:00.000Z',
          data: {},
        })}\n`,
        'utf8',
      );

      const report = await getMetricsReport(root, DEFAULT_CONFIG);

      assert.deepEqual(report.cycle.byChange, []);
      assert.equal(report.cycle.phases.total.totalChanges, 0);
    });

    it('uses only numeric task streams for first start and excludes change.jsonl spans', async () => {
      const root = await makeProject();
      const folder = await createArchivedChange(root, '070-streams', {
        briefDate: '2026-08-01',
        approvedAt: '2026-07-31T23:00:00.000Z',
        firstTaskStart: '2026-08-01T00:00:00.000Z',
        archivedAt: '2026-08-01T02:00:00.000Z',
        changeStreamStartedAt: '2026-08-01T00:30:00.000Z',
      });
      // Give task 2 a finite execution span so a legacy duration scan can see
      // change.jsonl's wider span if it were wrongly included.
      await fs.appendFile(
        path.join(folder, '.run', 'events', '2.jsonl'),
        `${JSON.stringify({
          type: 'exited',
          timestamp: '2026-08-01T00:00:10.000Z',
          data: { exitCode: 0 },
        })}\n`,
        'utf8',
      );

      const report = await getMetricsReport(root, DEFAULT_CONFIG);
      const row = report.cycle.byChange[0];

      // firstTaskStart is 00:00, not the later change.jsonl started event.
      assert.equal(row.firstTaskToArchiveSeconds, 7200);
      // Legacy execution durations ignore the change-level stream span.
      assert.equal(report.durations.totalMs, 10000);
    });
  });

  describe('JSON contract', () => {
    it('exposes cycle phases and rows on the MetricsReport object', async () => {
      const report = (await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG)) as MetricsReport;

      assert.deepEqual(Object.keys(report.cycle).sort(), ['byChange', 'phases']);
      assert.deepEqual(Object.keys(report.cycle.phases).sort(), [
        'approvalToFirstTask',
        'briefToApproval',
        'firstTaskToArchive',
        'total',
      ]);
    });
  });
});
