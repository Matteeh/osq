import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import {
  type CostMetrics,
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
    it('sums cost reported in event data per spec and in total', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);

      assert.ok(report.cost, 'cost metrics should be present when events carry cost');
      assert.ok(
        Math.abs(report.cost.total - 0.1533) <= 0.0001,
        `expected total of ~0.1533, got ${report.cost.total}`,
      );
      assert.equal(typeof report.cost.perSpec['009-watcher-observability'], 'number');
      assert.ok(
        Math.abs(report.cost.perSpec['009-watcher-observability'] - 0.1533) <= 0.0001,
        `expected 009 per-spec cost of ~0.1533, got ${report.cost.perSpec['009-watcher-observability']}`,
      );
      // Specs whose events never report cost are left out of the breakdown.
      assert.equal(report.cost.perSpec['008-opencode-harness-adapter'], undefined);

      const perSpecSum = Object.values(report.cost.perSpec).reduce((sum, value) => sum + value, 0);
      assert.ok(Math.abs(perSpecSum - report.cost.total) <= 0.0001);
    });

    it('formats the total as a currency string', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);

      assert.equal(report.cost?.formattedTotal, '$0.15');
    });

    it('exposes total, perSpec, and formattedTotal on CostMetrics', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);
      const cost = report.cost as CostMetrics;

      assert.deepEqual(Object.keys(cost).sort(), ['formattedTotal', 'perSpec', 'total']);
      assert.equal(typeof cost.total, 'number');
      assert.equal(typeof cost.formattedTotal, 'string');
      assert.equal(typeof cost.perSpec, 'object');
    });

    it('prints the reported cost line when events carry cost', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);
      const formatted = formatMetricsReport(report);

      assert.ok(formatted.includes('Reported cost: $0.15'), formatted);
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

      assert.ok(report.cost);
      assert.equal(report.cost.total, 0.0012);
      assert.equal(report.cost.formattedTotal, '$0.0012');
    });
  });

  describe('cost-free project', () => {
    it('omits cost metrics and the reported cost line when no event carries cost', async () => {
      const report = await reportForEvents([
        {
          type: 'tokens',
          timestamp: '2026-09-17T00:00:00.000Z',
          data: { input: 100, output: 20 },
        },
      ]);

      assert.equal(report.cost, undefined);

      const formatted = formatMetricsReport(report);
      assert.ok(!formatted.includes('Reported cost'), formatted);
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
