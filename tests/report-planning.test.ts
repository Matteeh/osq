import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { reportCommand } from '../src/cli/report.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import type { PlanningUsage } from '../src/core/report/planning.js';
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-planning-'));
  tmpDirs.push(root);
  await fs.mkdir(path.join(root, 'openspec', 'changes', 'archive'), { recursive: true });
  return root;
}

function nullUsage(): PlanningUsage {
  return {
    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
    reasoningTokens: null,
    cost: null,
  };
}

function started(
  sessionId: string,
  timestamp: string,
  harness = 'opencode',
  source?: 'owned' | 'observed',
  model: string | null = 'model',
): string {
  return JSON.stringify({
    type: 'plan_started',
    sessionId,
    timestamp,
    ...(source ? { source } : {}),
    data: { harness, model, osqVersion: '0.0.0', briefHash: 'sha256:x' },
  });
}

function exited(
  sessionId: string,
  timestamp: string,
  wallSeconds: number,
  usage: Partial<PlanningUsage> = {},
  source?: 'owned' | 'observed',
): string {
  return JSON.stringify({
    type: 'plan_exited',
    sessionId,
    timestamp,
    ...(source ? { source } : {}),
    data: { exitCode: 0, wallSeconds, usage: { ...nullUsage(), ...usage } },
  });
}

async function writePlanLog(
  root: string,
  location: 'active' | 'archive',
  name: string,
  lines: string[],
): Promise<void> {
  const folder = path.join(
    root,
    'openspec',
    'changes',
    ...(location === 'archive' ? ['archive'] : []),
    name,
  );
  const runDir = path.join(folder, '.run');
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'plan.jsonl'), `${lines.join('\n')}\n`, 'utf8');
}

describe('report planning metrics', () => {
  describe('fixture/report', () => {
    it('aggregates correlated sessions across active and archived changes', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);

      assert.equal(report.planning.sessions, 6);
      assert.equal(report.planning.wallSeconds, 660);
      assert.deepEqual(report.planning.wallSecondsByChange, {
        '008-opencode-harness-adapter': 180,
        '009-watcher-observability': 450,
        '010-report-history-state': 30,
      });
      assert.deepEqual(report.planning.tokens, {
        input: 1250,
        output: 200,
        cached: 500,
        reasoning: 50,
      });
      assert.equal(report.planning.cost.provenance, 'harness-reported');
      assert.equal(report.planning.cost.formattedTotal, '$0.35');
      assert.ok(Math.abs(report.planning.cost.total - 0.35) <= 1e-9);
      assert.deepEqual(report.planning.coverage, {
        reportedSessions: 3,
        totalSessions: 6,
      });
      // Three distinct archived changes carry a planning start.
      assert.equal(report.planning.changesWithPlanningRecords, 3);
    });

    it('renders the planning totals and the exact coverage phrase in text', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);
      const text = formatMetricsReport(report);

      assert.ok(text.includes('Planning:'), text);
      assert.ok(text.includes('Total wall time: 11m'), text);
      assert.ok(text.includes('009-watcher-observability: 7m 30s'), text);
      assert.ok(text.includes('Input tokens: 1250'), text);
      assert.ok(text.includes('Output tokens: 200'), text);
      assert.ok(text.includes('Cached tokens: 500'), text);
      assert.ok(text.includes('Reasoning tokens: 50'), text);
      assert.ok(text.includes('Harness-reported cost: $0.35'), text);
      assert.ok(text.includes('3 of 6 sessions reported usage'), text);
      assert.ok(text.includes('3 changes have a planning record'), text);
    });
  });

  describe('aggregation rules', () => {
    it('counts every valid start once, sums matched exits, and never estimates nulls', async () => {
      const root = await makeProject();
      await writePlanLog(root, 'active', '001-active', [
        started('s1', '2026-01-01T00:00:00.000Z'),
        exited('s1', '2026-01-01T00:01:40.000Z', 100, {
          inputTokens: 10,
          outputTokens: 20,
          cachedTokens: 30,
          reasoningTokens: 40,
          cost: 0.5,
        }),
        started('s2', '2026-01-01T00:02:00.000Z'),
        exited('s2', '2026-01-01T00:02:50.000Z', 50),
        started('s3', '2026-01-01T00:03:00.000Z'),
        // Orphan exit with no valid start: not a session and not aggregated.
        exited('orphan', '2026-01-01T00:04:00.000Z', 999, {
          inputTokens: 5000,
          cost: 9.99,
        }),
        'not json at all',
        JSON.stringify({ type: 'unknown', sessionId: 'x', timestamp: '2026-01-01T00:00:00.000Z' }),
      ]);
      await writePlanLog(root, 'archive', '002-archived', [
        started('s4', '2026-01-01T05:00:00.000Z', 'codex'),
        exited('s4', '2026-01-01T05:00:25.000Z', 25, { inputTokens: 7 }),
        started('s5', '2026-01-01T06:00:00.000Z', 'agy'),
        exited('s5', '2026-01-01T06:00:05.000Z', 5, {
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          reasoningTokens: 0,
          cost: 0,
        }),
      ]);

      const report = await getMetricsReport(root, DEFAULT_CONFIG);

      assert.equal(report.planning.sessions, 5);
      assert.equal(report.planning.wallSeconds, 180);
      assert.deepEqual(report.planning.wallSecondsByChange, {
        '001-active': 150,
        '002-archived': 30,
      });
      assert.deepEqual(report.planning.tokens, {
        input: 17,
        output: 20,
        cached: 30,
        reasoning: 40,
      });
      assert.ok(Math.abs(report.planning.cost.total - 0.5) <= 1e-9);
      // Complete, partial, and observed-zero sessions all count exactly once.
      assert.deepEqual(report.planning.coverage, {
        reportedSessions: 3,
        totalSessions: 5,
      });
    });

    it('treats missing, empty, and malformed logs as zero without throwing', async () => {
      const root = await makeProject();
      await fs.mkdir(path.join(root, 'openspec', 'changes', '001-missing', '.run'), {
        recursive: true,
      });
      await writePlanLog(root, 'archive', '002-malformed', ['{ broken', '{"type":"plan_exited"}']);

      const report = await getMetricsReport(root, DEFAULT_CONFIG);

      assert.equal(report.planning.sessions, 0);
      assert.equal(report.planning.wallSeconds, 0);
      assert.deepEqual(report.planning.wallSecondsByChange, {});
      assert.deepEqual(report.planning.tokens, { input: 0, output: 0, cached: 0, reasoning: 0 });
      assert.equal(report.planning.cost.total, 0);
      assert.equal(report.planning.cost.formattedTotal, 'not reported');
      assert.deepEqual(report.planning.coverage, { reportedSessions: 0, totalSessions: 0 });

      const text = formatMetricsReport(report);
      assert.ok(text.includes('Harness-reported cost: not reported'), text);
      assert.ok(text.includes('0 of 0 sessions reported usage'), text);
    });
  });

  describe('mixed sources', () => {
    it('treats observed, explicit owned, and source-less legacy starts identically', async () => {
      const root = await makeProject();
      await writePlanLog(root, 'active', '001-mixed', [
        // Legacy record without a source field reads as owned.
        started('legacy', '2026-01-01T00:00:00.000Z'),
        exited('legacy', '2026-01-01T00:01:00.000Z', 60, { inputTokens: 10 }),
        // Explicit owned record.
        started('owned', '2026-01-01T00:02:00.000Z', 'opencode', 'owned'),
        exited('owned', '2026-01-01T00:02:30.000Z', 30, { outputTokens: 20 }, 'owned'),
        // Observed record with a nullable model.
        started('observed', '2026-01-01T00:03:00.000Z', 'claude', 'observed', null),
        exited(
          'observed',
          '2026-01-01T00:03:20.000Z',
          20,
          { cachedTokens: 30, cost: 0.5 },
          'observed',
        ),
      ]);
      await writePlanLog(root, 'archive', '002-observed', [
        started('observed-2', '2026-01-02T00:00:00.000Z', 'codex', 'observed', 'gpt'),
        exited('observed-2', '2026-01-02T00:00:15.000Z', 15, { reasoningTokens: 40 }, 'observed'),
      ]);

      const report = await getMetricsReport(root, DEFAULT_CONFIG);

      assert.equal(report.planning.sessions, 4);
      assert.equal(report.planning.wallSeconds, 125);
      assert.deepEqual(report.planning.tokens, {
        input: 10,
        output: 20,
        cached: 30,
        reasoning: 40,
      });
      assert.ok(Math.abs(report.planning.cost.total - 0.5) <= 1e-9);
      assert.deepEqual(report.planning.coverage, {
        reportedSessions: 4,
        totalSessions: 4,
      });
      // Two distinct changes each carry at least one valid start.
      assert.equal(report.planning.changesWithPlanningRecords, 2);
    });

    it('counts each covered change once and excludes exit-only and malformed lines', async () => {
      const root = await makeProject();
      await writePlanLog(root, 'active', '001-multi', [
        started('a', '2026-01-01T00:00:00.000Z', 'opencode', 'owned'),
        exited('a', '2026-01-01T00:00:30.000Z', 30, {}, 'owned'),
        // Incomplete owned start with no matched exit still covers the change.
        started('b', '2026-01-01T00:01:00.000Z', 'opencode', 'owned'),
      ]);
      await writePlanLog(root, 'active', '002-exit-only', [
        exited('orphan', '2026-01-01T02:00:00.000Z', 10, { cost: 1 }, 'observed'),
        '{ not json',
      ]);
      await writePlanLog(root, 'archive', '003-malformed', ['not json at all']);

      const report = await getMetricsReport(root, DEFAULT_CONFIG);

      assert.equal(report.planning.sessions, 2);
      assert.equal(report.planning.changesWithPlanningRecords, 1);
    });
  });

  describe('reportCommand JSON', () => {
    it('exposes the planning block deterministically through the report command', async () => {
      const raw = await reportCommand({
        cwd: fixtureReportRoot,
        json: true,
        stdout: () => {},
      });
      const parsed = JSON.parse(raw) as MetricsReport;

      assert.deepEqual(Object.keys(parsed.planning).sort(), [
        'changesWithPlanningRecords',
        'cost',
        'coverage',
        'sessions',
        'tokens',
        'wallSeconds',
        'wallSecondsByChange',
      ]);
      assert.equal(parsed.planning.sessions, 6);
      assert.equal(parsed.planning.changesWithPlanningRecords, 3);
      assert.ok(Math.abs(parsed.planning.cost.total - 0.35) <= 1e-9);
      assert.equal(
        JSON.stringify(parsed.planning.wallSecondsByChange),
        JSON.stringify({
          '008-opencode-harness-adapter': 180,
          '009-watcher-observability': 450,
          '010-report-history-state': 30,
        }),
      );
    });
  });
});
