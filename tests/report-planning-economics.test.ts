import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { reportCommand } from '../src/cli/report.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import {
  type MetricsReport,
  formatMetricsReport,
  getMetricsReport,
} from '../src/core/report/report.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-economics-'));
  tmpDirs.push(root);
  await fs.mkdir(path.join(root, 'openspec', 'changes', 'archive'), { recursive: true });
  return root;
}

function nullUsage(): Record<string, number | null> {
  return {
    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
    reasoningTokens: null,
    cost: null,
  };
}

function started(sessionId: string, timestamp: string, source?: 'owned' | 'observed'): string {
  return JSON.stringify({
    type: 'plan_started',
    sessionId,
    timestamp,
    ...(source ? { source } : {}),
    data: { harness: 'opencode', model: 'model', osqVersion: '0.0.0', briefHash: 'sha256:x' },
  });
}

function exited(
  sessionId: string,
  timestamp: string,
  usage: Partial<Record<string, number | null>> = {},
  slice?: Record<string, unknown>,
): string {
  return JSON.stringify({
    type: 'plan_exited',
    sessionId,
    timestamp,
    data: {
      exitCode: 0,
      wallSeconds: 60,
      usage: { ...nullUsage(), ...usage },
      ...(slice ? { slice } : {}),
    },
  });
}

function slice(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    start: '2026-01-01T00:00:00.000Z',
    end: '2026-01-01T00:30:00.000Z',
    approvedAt: '2026-01-01T01:00:00.000Z',
    lastEditAt: '2026-01-01T00:50:00.000Z',
    turns: 3,
    activeMinutes: 5,
    tokens: { input: 100, output: 20, cacheRead: 30, cacheWrite: 5, reasoning: 7 },
    costSource: 'harness',
    ...overrides,
  };
}

async function changeFolder(
  root: string,
  location: 'active' | 'archive',
  name: string,
): Promise<string> {
  const folder = path.join(
    root,
    'openspec',
    'changes',
    ...(location === 'archive' ? ['archive'] : []),
    name,
  );
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  return folder;
}

async function writePlanLog(folder: string, lines: string[]): Promise<void> {
  await fs.mkdir(path.join(folder, '.run'), { recursive: true });
  await fs.writeFile(path.join(folder, '.run', 'plan.jsonl'), `${lines.join('\n')}\n`, 'utf8');
}

async function writeTaskEvents(folder: string, task: string, events: unknown[]): Promise<void> {
  const eventsDir = path.join(folder, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  await fs.writeFile(
    path.join(eventsDir, `${task}.jsonl`),
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
    'utf8',
  );
}

async function writeTaskFile(folder: string, task: string): Promise<void> {
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(folder, 'tasks', `${task}.md`),
    `---\ntitle: Task ${task}\nverify: node -e "process.exit(0)"\nscope: []\nentry: []\nskills: []\n---\n## Acceptance\n- [ ] x\n`,
    'utf8',
  );
}

function measures(phase: 'start' | 'end', fields: Record<string, unknown>): unknown {
  return { type: 'measures', timestamp: '2026-01-01T00:00:00.000Z', data: { phase, ...fields } };
}

describe('report planning economics', () => {
  describe('sliced and legacy records with measures', () => {
    it('sums slices, falls back to legacy usage, and derives spec economics', async () => {
      const root = await makeProject();
      const sliced = await changeFolder(root, 'active', '001-sliced');
      await writePlanLog(sliced, [
        started('s1', '2026-01-01T00:00:00.000Z'),
        exited(
          's1',
          '2026-01-01T00:30:00.000Z',
          { cost: 0.3 },
          slice({ approvedAt: '2026-01-01T01:00:00.000Z', lastEditAt: '2026-01-01T00:50:00.000Z' }),
        ),
        started('s2', '2026-01-01T02:00:00.000Z'),
        exited('s2', '2026-01-01T02:05:00.000Z', {
          inputTokens: 10,
          outputTokens: 2,
          cachedTokens: 4,
          reasoningTokens: 1,
          cost: 0.2,
        }),
      ]);
      await writeTaskEvents(sliced, '1', [
        measures('start', { proposalWords: 50, taskWords: 10 }),
        measures('end', { changedLines: 20 }),
      ]);
      await writeTaskEvents(sliced, '2', [
        measures('start', { proposalWords: 50, taskWords: 5 }),
        measures('end', { changedLines: 10 }),
      ]);

      const legacy = await changeFolder(root, 'active', '002-legacy');
      await writePlanLog(legacy, [
        started('s3', '2026-01-02T00:00:00.000Z'),
        exited('s3', '2026-01-02T00:05:00.000Z', {
          inputTokens: 5,
          outputTokens: 5,
          cachedTokens: 9,
          reasoningTokens: 5,
          cost: 0.1,
        }),
      ]);

      const report = await getMetricsReport(root, DEFAULT_CONFIG);
      const byChange = report.planning.byChange;

      assert.deepEqual(byChange['001-sliced'], {
        sessions: 2,
        tokens: {
          input: 110,
          output: 22,
          cacheRead: 30,
          cacheWrite: 5,
          reasoning: 8,
        },
        activeMinutes: 5,
        cost: 0.5,
        specWords: 65,
        changedLines: 30,
        specWordsPerChangedLine: 2.17,
        minutesLastEditToApproval: 10,
      });
      assert.deepEqual(byChange['002-legacy'], {
        sessions: 1,
        tokens: {
          input: 5,
          output: 5,
          cacheRead: null,
          cacheWrite: null,
          reasoning: 5,
        },
        activeMinutes: null,
        cost: 0.1,
        specWords: null,
        changedLines: null,
        specWordsPerChangedLine: null,
        minutesLastEditToApproval: null,
      });

      const text = formatMetricsReport(report);
      assert.ok(text.includes('Planning by change:'), text);
      assert.ok(
        text.includes(
          '  001-sliced: sessions 2, active 5 min, tokens in 110 out 22 cache-read 30 cache-write 5 reasoning 8, cost $0.50, spec words 65, changed lines 30 (2.17 words/line), last edit to approval 10 min',
        ),
        text,
      );
      assert.ok(
        text.includes(
          '  002-legacy: sessions 1, active unavailable min, tokens in 5 out 5 cache-read unavailable cache-write unavailable reasoning 5, cost $0.10, spec words unavailable, changed lines unavailable (unavailable words/line), last edit to approval unavailable min',
        ),
        text,
      );
    });
  });

  describe('comparison totals', () => {
    it('compares planning and executor tokens and costs', async () => {
      const root = await makeProject();
      const folder = await changeFolder(root, 'active', '001-compare');
      await writePlanLog(folder, [
        started('s1', '2026-01-01T00:00:00.000Z'),
        exited(
          's1',
          '2026-01-01T00:30:00.000Z',
          {
            inputTokens: 1000,
            outputTokens: 200,
            cachedTokens: 500,
            reasoningTokens: 50,
            cost: 0.25,
          },
          slice({
            tokens: { input: 1000, output: 200, cacheRead: 500, cacheWrite: 0, reasoning: 50 },
          }),
        ),
      ]);
      await writeTaskFile(folder, '1');
      await writeTaskEvents(folder, '1', [
        { type: 'started', timestamp: '2026-01-01T02:00:00.000Z', data: {} },
        {
          type: 'tokens',
          timestamp: '2026-01-01T02:00:01.000Z',
          data: { input: 111, output: 22, cachedTokens: 33, reasoning: 4, cost: 0.5 },
        },
      ]);

      const report = await getMetricsReport(root, DEFAULT_CONFIG);

      assert.deepEqual(report.planning.comparison, {
        planning: { input: 1000, output: 200, cached: 500, reasoning: 50, cost: 0.25 },
        execution: { input: 111, output: 22, cached: 33, reasoning: 4, cost: 0.5 },
      });

      const text = formatMetricsReport(report);
      assert.ok(text.includes('Planning vs execution:'), text);
      assert.ok(text.includes('  Input tokens: planning 1000, execution 111'), text);
      assert.ok(text.includes('  Output tokens: planning 200, execution 22'), text);
      assert.ok(text.includes('  Cached tokens: planning 500, execution 33'), text);
      assert.ok(text.includes('  Reasoning tokens: planning 50, execution 4'), text);
      assert.ok(text.includes('  Cost: planning $0.25, execution $0.50'), text);
    });

    it('reads not reported when sessions report tokens but no cost', async () => {
      const root = await makeProject();
      const folder = await changeFolder(root, 'active', '001-nocost');
      await writePlanLog(folder, [
        started('s1', '2026-01-01T00:00:00.000Z'),
        exited('s1', '2026-01-01T00:05:00.000Z', {
          inputTokens: 5,
          outputTokens: 5,
          reasoningTokens: 5,
        }),
      ]);

      const report = await getMetricsReport(root, DEFAULT_CONFIG);

      assert.equal(report.planning.cost.total, 0);
      assert.equal(report.planning.cost.formattedTotal, 'not reported');
      assert.equal(report.planning.comparison.planning.cost, null);
      assert.equal(report.planning.comparison.execution.cost, null);
      assert.equal(report.planning.byChange['001-nocost'].cost, null);

      const text = formatMetricsReport(report);
      assert.ok(text.includes('  Cost: planning not reported, execution not reported'), text);
      assert.ok(text.includes('  Harness-reported cost: not reported'), text);
    });

    it('keeps a reported zero cost distinct from an unreported one', async () => {
      const root = await makeProject();
      const folder = await changeFolder(root, 'active', '001-zero');
      await writePlanLog(folder, [
        started('s1', '2026-01-01T00:00:00.000Z'),
        exited('s1', '2026-01-01T00:05:00.000Z', {
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          reasoningTokens: 0,
          cost: 0,
        }),
      ]);

      const report = await getMetricsReport(root, DEFAULT_CONFIG);

      assert.equal(report.planning.cost.formattedTotal, '$0.0000');
      assert.equal(report.planning.comparison.planning.cost, 0);
      assert.equal(report.planning.byChange['001-zero'].cost, 0);
    });
  });

  describe('spec word ratio', () => {
    it('is null when changed lines are zero or unknown', async () => {
      const root = await makeProject();
      const zero = await changeFolder(root, 'active', '001-zero-lines');
      await writePlanLog(zero, [
        started('s1', '2026-01-01T00:00:00.000Z'),
        exited('s1', '2026-01-01T00:05:00.000Z', { inputTokens: 1 }),
      ]);
      await writeTaskEvents(zero, '1', [
        measures('start', { proposalWords: 40, taskWords: 5 }),
        measures('end', { changedLines: 0 }),
      ]);

      const unknown = await changeFolder(root, 'active', '002-unknown-lines');
      await writePlanLog(unknown, [
        started('s2', '2026-01-02T00:00:00.000Z'),
        exited('s2', '2026-01-02T00:05:00.000Z', { inputTokens: 1 }),
      ]);
      await writeTaskEvents(unknown, '1', [measures('start', { proposalWords: 40, taskWords: 5 })]);

      const report = await getMetricsReport(root, DEFAULT_CONFIG);

      assert.equal(report.planning.byChange['001-zero-lines'].specWords, 45);
      assert.equal(report.planning.byChange['001-zero-lines'].changedLines, 0);
      assert.equal(report.planning.byChange['001-zero-lines'].specWordsPerChangedLine, null);
      assert.equal(report.planning.byChange['002-unknown-lines'].changedLines, null);
      assert.equal(report.planning.byChange['002-unknown-lines'].specWordsPerChangedLine, null);
    });

    it('sums only the last end changed lines of each task', async () => {
      const root = await makeProject();
      const folder = await changeFolder(root, 'active', '001-repeat');
      await writePlanLog(folder, [
        started('s1', '2026-01-01T00:00:00.000Z'),
        exited('s1', '2026-01-01T00:05:00.000Z', { inputTokens: 1 }),
      ]);
      await writeTaskEvents(folder, '1', [
        measures('start', { proposalWords: 10, taskWords: 1 }),
        measures('end', { changedLines: 3 }),
        measures('end', { changedLines: 8 }),
      ]);

      const report = await getMetricsReport(root, DEFAULT_CONFIG);

      assert.equal(report.planning.byChange['001-repeat'].specWords, 11);
      assert.equal(report.planning.byChange['001-repeat'].changedLines, 8);
      assert.equal(report.planning.byChange['001-repeat'].specWordsPerChangedLine, 1.38);
    });
  });

  describe('report --json', () => {
    it('emits byChange and comparison through the stable metrics', async () => {
      const root = await makeProject();
      const folder = await changeFolder(root, 'active', '001-json');
      await writePlanLog(folder, [
        started('s1', '2026-01-01T00:00:00.000Z'),
        exited('s1', '2026-01-01T00:05:00.000Z', { inputTokens: 7, cost: 0.2 }),
      ]);

      const raw = await reportCommand({
        cwd: root,
        config: DEFAULT_CONFIG,
        json: true,
        stdout: () => {},
      });
      const parsed = JSON.parse(raw) as MetricsReport;

      assert.deepEqual(Object.keys(parsed.planning).sort(), [
        'byChange',
        'changesWithPlanningRecords',
        'comparison',
        'cost',
        'coverage',
        'sessions',
        'tokens',
        'wallSeconds',
        'wallSecondsByChange',
      ]);
      assert.equal(parsed.planning.byChange['001-json'].tokens.input, 7);
      assert.equal(parsed.planning.byChange['001-json'].cost, 0.2);
      assert.deepEqual(parsed.planning.comparison.planning, {
        input: 7,
        output: null,
        cached: null,
        reasoning: null,
        cost: 0.2,
      });
      assert.deepEqual(parsed.planning.comparison.execution, {
        input: 0,
        output: 0,
        cached: 0,
        reasoning: 0,
        cost: null,
      });
    });
  });
});
