import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { type MetricsReport, formatMetricsReport, getMetricsReport } from '../src/core/report.js';
import { extractAgyTokens, processAgyStdoutLine } from '../src/harness/agy.js';
import { extractOpencodeTokens, processOpencodeStdoutLine } from '../src/harness/opencode.js';

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

async function emittedEventsFor(
  writeLine: (specFolderPath: string) => Promise<void>,
): Promise<Record<string, unknown>[]> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-tokens-'));
  tmpDirs.push(tmpDir);

  const specDir = path.join(tmpDir, 'spec');
  await fs.mkdir(specDir, { recursive: true });
  await writeLine(specDir);

  const content = await fs.readFile(path.join(specDir, '.run', 'events', '1.jsonl'), 'utf8');
  return content
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('report token metrics', () => {
  describe('fixture/report', () => {
    it('sums neutral token categories and cache share across all specs', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);

      assert.equal(report.tokens.input, 290061);
      assert.equal(report.tokens.cached_input, 8958336);
      assert.equal(report.tokens.output, 60368);
      assert.equal(report.tokens.reasoning, 0);
      assert.equal(report.tokens.total, 9386624);
      assert.equal(report.tokens.cacheSharePercent, 96.9);
    });

    it('exposes only the canonical neutral TokenMetrics fields', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);
      const tokens = report.tokens as unknown as Record<string, unknown>;

      assert.deepEqual(Object.keys(tokens).sort(), [
        'cacheSharePercent',
        'cached_input',
        'input',
        'output',
        'reasoning',
        'total',
      ]);

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

      for (const legacyKey of [
        'promptTokens',
        'candidateTokens',
        'totalTokens',
        'prompt',
        'candidate',
      ]) {
        assert.equal(legacyKey in tokens, false, `${legacyKey} should not be present`);
      }
    });

    it('formats the neutral token labels with the cache share percentage', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);
      const formatted = formatMetricsReport(report);

      assert.ok(formatted.includes('Token Usage:\n  Input: 290061'), formatted);
      assert.ok(formatted.includes('  Cached input: 8958336 (96.9% cache share)'), formatted);
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

    it('derives the remaining cached input only when no cache field is reported', async () => {
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

    it('prefers reported cached tokens over the remainder when a cache field exists', async () => {
      const report = await reportForTokenEvents([
        tokenEvent({
          promptTokens: 100,
          candidateTokens: 20,
          totalTokens: 150,
          cachedTokens: 30,
          reasoningTokens: 5,
        }),
      ]);

      // Remainder would be 150 - 100 - 20 - 5 = 25; the reported counter wins.
      assert.equal(report.tokens.cached_input, 30);
      assert.equal(report.tokens.reasoning, 5);
      assert.equal(report.tokens.total, 150);
    });

    it('uses real-world opencode counts where reasoning is not counted as cache', async () => {
      const report = await reportForTokenEvents([
        tokenEvent({
          promptTokens: 3625,
          candidateTokens: 154,
          totalTokens: 9964,
          cachedTokens: 6144,
          reasoningTokens: 41,
        }),
      ]);

      assert.equal(report.tokens.input, 3625);
      assert.equal(report.tokens.output, 154);
      assert.equal(report.tokens.total, 9964);
      assert.equal(report.tokens.cached_input, 6144);
      assert.equal(report.tokens.reasoning, 41);
      // Reasoning is its own category, so it never inflates the cache counter.
      assert.notEqual(report.tokens.cached_input, 9964 - 3625 - 154);
    });

    it('defaults cache share percent to zero when there is no input at all', async () => {
      const report = await reportForTokenEvents([tokenEvent({ output: 25, total: 25 })]);

      assert.equal(report.tokens.cacheSharePercent, 0);
    });
  });

  describe('adapter token extraction', () => {
    it('extracts opencode reasoning tokens from reasoning or reasoningTokens', () => {
      const fromReasoning = extractOpencodeTokens({
        type: 'step_finish',
        part: { tokens: { input: 10, output: 2, reasoning: 7 } },
      });
      assert.ok(fromReasoning);
      assert.equal(fromReasoning.reasoningTokens, 7);

      const fromReasoningTokens = extractOpencodeTokens({
        type: 'step_finish',
        part: { tokens: { input: 10, output: 2, reasoningTokens: 9 } },
      });
      assert.ok(fromReasoningTokens);
      assert.equal(fromReasoningTokens.reasoningTokens, 9);
    });

    it('extracts agy reasoning tokens from thinking_tokens or reasoning_tokens', () => {
      const fromThinkingTokens = extractAgyTokens({
        event: 'step_update',
        step_update: { usage: { input_tokens: 10, output_tokens: 2, thinking_tokens: 7 } },
      });
      assert.ok(fromThinkingTokens);
      assert.equal(fromThinkingTokens.reasoningTokens, 7);

      const fromReasoningTokens = extractAgyTokens({
        event: 'step_update',
        step_update: { usage: { input_tokens: 10, output_tokens: 2, reasoning_tokens: 9 } },
      });
      assert.ok(fromReasoningTokens);
      assert.equal(fromReasoningTokens.reasoningTokens, 9);
    });

    it('emits reasoningTokens on opencode tokens events', async () => {
      const events = await emittedEventsFor((specFolderPath) =>
        processOpencodeStdoutLine(
          JSON.stringify({
            type: 'step_finish',
            part: { tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 50 } } },
          }),
          specFolderPath,
          '1',
        ),
      );

      const tokensEvent = events.find((event) => event.type === 'tokens');
      assert.ok(tokensEvent, 'expected a tokens event');
      assert.equal((tokensEvent.data as Record<string, unknown>).reasoningTokens, 5);
    });

    it('emits reasoningTokens on agy tokens events', async () => {
      const events = await emittedEventsFor((specFolderPath) =>
        processAgyStdoutLine(
          JSON.stringify({
            event: 'step_update',
            step_update: {
              step_type: 'agent_response',
              usage: {
                input_tokens: 100,
                output_tokens: 20,
                thinking_tokens: 5,
                cache_read_tokens: 50,
              },
            },
          }),
          specFolderPath,
          '1',
        ),
      );

      const tokensEvent = events.find((event) => event.type === 'tokens');
      assert.ok(tokensEvent, 'expected a tokens event');
      assert.equal((tokensEvent.data as Record<string, unknown>).reasoningTokens, 5);
    });
  });
});
