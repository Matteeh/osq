import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import {
  type CostHistory,
  type MetricsReport,
  formatMetricsReport,
  getMetricsReport,
} from '../src/core/report.js';

const fixtureReportRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixture',
  'report',
);

const readmePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'README.md');

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function reportForEvents(events: Record<string, unknown>[]): Promise<MetricsReport> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-cost-'));
  tmpDirs.push(tmpDir);

  const specDir = path.join(tmpDir, 'openspec', 'changes', 'archive', '001-cost-spec');
  await fs.mkdir(path.join(specDir, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(specDir, 'spec.md'),
    '---\ntitle: Cost Spec\nfeatures:\n  reads: []\n  writes: []\n---\n## Goal\nx\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(specDir, 'tasks', '1.md'),
    '---\ntitle: Cost Task\nverify: node -e "process.exit(0)"\nscope: []\nentry: []\nskills: []\n---\n## Acceptance\n- [ ] x\n',
    'utf8',
  );

  const eventsDir = path.join(specDir, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  await fs.writeFile(
    path.join(eventsDir, '1.jsonl'),
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
    'utf8',
  );

  return getMetricsReport(tmpDir, DEFAULT_CONFIG);
}

describe('report cost metrics', () => {
  describe('fixture/report', () => {
    it('sums cost reported in event data per spec and in total under history', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);
      const cost = report.history.cost;

      assert.ok(
        Math.abs(cost.total - 0.1533) <= 0.0001,
        `expected total of ~0.1533, got ${cost.total}`,
      );
      assert.equal(typeof cost.perSpec['009-watcher-observability'], 'number');
      assert.ok(
        Math.abs(cost.perSpec['009-watcher-observability'] - 0.1533) <= 0.0001,
        `expected 009 per-spec cost of ~0.1533, got ${cost.perSpec['009-watcher-observability']}`,
      );
      // Specs whose events never report cost are left out of the breakdown.
      assert.equal(cost.perSpec['008-opencode-harness-adapter'], undefined);

      const perSpecSum = Object.values(cost.perSpec).reduce((sum, value) => sum + value, 0);
      assert.ok(Math.abs(perSpecSum - cost.total) <= 0.0001);
    });

    it('identifies harness-reported provenance and attempt coverage', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);
      const cost = report.history.cost;

      assert.equal(cost.provenance, 'harness-reported');
      assert.equal(cost.coverage.reportedAttempts, 8);
      assert.equal(cost.coverage.totalAttempts, report.history.attempts.total);
      assert.equal(cost.coverage.totalAttempts, 19);
    });

    it('formats the total as a currency string', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);

      assert.equal(report.history.cost.formattedTotal, '$0.15');
    });

    it('exposes total, perSpec, formattedTotal, provenance, and coverage on CostHistory', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);
      const cost = report.history.cost as CostHistory;

      assert.deepEqual(Object.keys(cost).sort(), [
        'coverage',
        'formattedTotal',
        'perSpec',
        'provenance',
        'total',
      ]);
      assert.equal(typeof cost.total, 'number');
      assert.equal(typeof cost.formattedTotal, 'string');
      assert.equal(typeof cost.perSpec, 'object');
    });

    it('prints the harness-reported cost line with attempt coverage', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);
      const formatted = formatMetricsReport(report);

      assert.ok(
        formatted.includes('Harness-reported cost: $0.15 (8 of 19 attempts reported cost)'),
        formatted,
      );
    });
  });

  describe('cost formatting', () => {
    it('uses four decimals for amounts below one cent', async () => {
      const report = await reportForEvents([
        {
          type: 'tokens',
          timestamp: '2026-09-17T00:00:00.000Z',
          data: { input: 10, cost: 0.0012 },
        },
      ]);

      assert.equal(report.history.cost.total, 0.0012);
      assert.equal(report.history.cost.formattedTotal, '$0.0012');
    });

    it('counts an attempt at most once even when several events report cost', async () => {
      const report = await reportForEvents([
        { type: 'started', timestamp: '2026-09-17T00:00:00.000Z', data: {} },
        {
          type: 'tokens',
          timestamp: '2026-09-17T00:00:01.000Z',
          data: { input: 10, cost: 0.001 },
        },
        {
          type: 'tokens',
          timestamp: '2026-09-17T00:00:02.000Z',
          data: { input: 10, cost: 0.002 },
        },
        { type: 'started', timestamp: '2026-09-17T00:00:03.000Z', data: {} },
      ]);

      assert.equal(report.history.cost.total, 0.003);
      assert.equal(report.history.cost.coverage.reportedAttempts, 1);
      assert.equal(report.history.cost.coverage.totalAttempts, 2);
    });
  });

  describe('cost-free project', () => {
    it('reports zero cost and zero coverage without estimating', async () => {
      const report = await reportForEvents([
        {
          type: 'started',
          timestamp: '2026-09-17T00:00:00.000Z',
          data: {},
        },
        {
          type: 'tokens',
          timestamp: '2026-09-17T00:00:01.000Z',
          data: { input: 100, output: 20 },
        },
      ]);

      assert.equal(report.history.cost.total, 0);
      assert.equal(report.history.cost.formattedTotal, '$0.0000');
      assert.deepEqual(report.history.cost.perSpec, {});
      assert.equal(report.history.cost.coverage.reportedAttempts, 0);
      assert.equal(report.history.cost.coverage.totalAttempts, 1);

      const formatted = formatMetricsReport(report);
      assert.ok(
        formatted.includes('Harness-reported cost: $0.0000 (0 of 1 attempts reported cost)'),
        formatted,
      );
      assert.ok(!formatted.includes('Cost:'), formatted);
    });
  });

  describe('README', () => {
    it('notes that reported cost reflects the harness price table rather than the invoice', async () => {
      const readme = await fs.readFile(readmePath, 'utf8');

      assert.ok(
        readme.includes(
          "Reported cost reflects the harness's internal price table rather than the invoice.",
        ),
        'README.md should document the reported cost disclaimer',
      );
    });
  });
});
