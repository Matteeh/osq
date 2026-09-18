import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { type MetricsReport, formatMetricsReport, getMetricsReport } from '../src/core/report.js';

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

function tokenEvent(data: Record<string, unknown>): Record<string, unknown> {
  return { type: 'tokens', timestamp: '2026-09-17T00:00:00.000Z', data };
}

async function reportForTokenEvents(events: Record<string, unknown>[]): Promise<MetricsReport> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-tokens-'));
  tmpDirs.push(tmpDir);

  const specDir = path.join(tmpDir, 'specs', 'archive', '001-token-spec');
  await fs.mkdir(path.join(specDir, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(specDir, 'spec.md'),
    '---\ntitle: Token Spec\nfeatures:\n  reads: []\n  writes: []\n---\n## Goal\nx\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(specDir, 'tasks', '1.md'),
    '---\ntitle: Token Task\nverify: node -e "process.exit(0)"\nscope: []\nentry: []\nskills: []\n---\n## Acceptance\n- [ ] x\n',
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

describe('report token metrics', () => {
  describe('fixture/report', () => {
    it('sums neutral token categories and cache share across all specs', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);

      assert.equal(report.tokens.input, 290061);
      assert.equal(report.tokens.cached_input, 9036195);
      assert.equal(report.tokens.output, 60368);
      assert.equal(report.tokens.reasoning, 0);
      assert.equal(report.tokens.total, 9386624);
      assert.equal(report.tokens.cacheSharePercent, 96.9);
      // The neutral breakdown always adds back up to the reported total.
      assert.equal(
        report.tokens.total,
        report.tokens.input +
          report.tokens.cached_input +
          report.tokens.output +
          report.tokens.reasoning,
      );
    });

    it('exposes the neutral TokenMetrics fields alongside backward compatibility aliases', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);
      const tokens = report.tokens as unknown as Record<string, unknown>;

      for (const key of [
        'input',
        'cached_input',
        'output',
        'reasoning',
        'total',
        'cacheSharePercent',
      ]) {
        assert.equal(typeof tokens[key], 'number', `${key} should be a number`);
      }

      assert.equal(report.tokens.promptTokens, report.tokens.input);
      assert.equal(report.tokens.candidateTokens, report.tokens.output);
      assert.equal(report.tokens.totalTokens, report.tokens.total);
      assert.equal(report.tokens.prompt, report.tokens.input);
      assert.equal(report.tokens.candidate, report.tokens.output);
    });

    it('formats the neutral token labels with the cache share percentage', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);
      const formatted = formatMetricsReport(report);

      assert.ok(formatted.includes('Token Usage:\n  Input: 290061'), formatted);
      assert.ok(formatted.includes('  Cached input: 9036195 (96.9% cache share)'), formatted);
      assert.ok(formatted.includes('  Output: 60368'), formatted);
      assert.ok(formatted.includes('  Reasoning: 0'), formatted);
      assert.ok(formatted.includes('  Total tokens: 9386624'), formatted);
      assert.ok(!formatted.includes('Prompt tokens:'), formatted);
      assert.ok(!formatted.includes('Candidate tokens:'), formatted);
    });
  });

  describe('event mapping', () => {
    it('maps opencode cache.read to cached_input and reasoning to reasoning', async () => {
      const report = await reportForTokenEvents([
        tokenEvent({ input: 100, output: 20, reasoning: 5, cache: { read: 50 }, total: 175 }),
      ]);

      assert.equal(report.tokens.input, 100);
      assert.equal(report.tokens.cached_input, 50);
      assert.equal(report.tokens.output, 20);
      assert.equal(report.tokens.reasoning, 5);
      assert.equal(report.tokens.total, 175);
      assert.equal(report.tokens.cacheSharePercent, 33.3);
    });

    it('maps Antigravity usage fields to neutral categories', async () => {
      const report = await reportForTokenEvents([
        tokenEvent({
          input_tokens: 200,
          output_tokens: 30,
          thinking_tokens: 10,
          cache_read_tokens: 80,
          total_tokens: 320,
        }),
      ]);

      assert.equal(report.tokens.input, 200);
      assert.equal(report.tokens.cached_input, 80);
      assert.equal(report.tokens.output, 30);
      assert.equal(report.tokens.reasoning, 10);
      assert.equal(report.tokens.total, 320);
      assert.equal(report.tokens.cacheSharePercent, 28.6);
    });

    it('derives the total from the neutral categories when no total is reported', async () => {
      const report = await reportForTokenEvents([
        tokenEvent({ input: 100, cached_input: 40, output: 10, reasoning: 5 }),
      ]);

      assert.equal(report.tokens.input, 100);
      assert.equal(report.tokens.cached_input, 40);
      assert.equal(report.tokens.output, 10);
      assert.equal(report.tokens.reasoning, 5);
      assert.equal(report.tokens.total, 155);
      assert.equal(report.tokens.total, 100 + 40 + 10 + 5);
      assert.equal(report.tokens.cacheSharePercent, 28.6);
    });

    it('reconciles a reported total by deriving the remaining cached input', async () => {
      const report = await reportForTokenEvents([
        tokenEvent({ promptTokens: 100, candidateTokens: 20, totalTokens: 150 }),
      ]);

      assert.equal(report.tokens.input, 100);
      assert.equal(report.tokens.output, 20);
      assert.equal(report.tokens.cached_input, 30);
      assert.equal(report.tokens.total, 150);
      assert.equal(
        report.tokens.total,
        report.tokens.input +
          report.tokens.cached_input +
          report.tokens.output +
          report.tokens.reasoning,
      );
    });

    it('defaults cache share percent to zero when there is no input at all', async () => {
      const report = await reportForTokenEvents([tokenEvent({ output: 25, total: 25 })]);

      assert.equal(report.tokens.cacheSharePercent, 0);
    });
  });
});
