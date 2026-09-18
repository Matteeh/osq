import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createProgram } from '../src/cli/index.js';
import { reportCommand, serializeSortedJson } from '../src/cli/report.js';
import { type MetricsReport, formatMetricsReport } from '../src/core/report.js';

const fixtureReportRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixture',
  'report',
);

const STABLE_TOP_LEVEL_KEYS = [
  'completionRate',
  'cost',
  'durations',
  'failureBreakdown',
  'fileChanges',
  'specs',
  'tasks',
  'tokens',
] as const;

function sortedKeys(value: object): string[] {
  return Object.keys(value).sort();
}

describe('serializeSortedJson', () => {
  it('recursively sorts object keys and preserves array order', () => {
    const value = {
      zeta: 1,
      alpha: {
        delta: [{ zulu: 1, alpha: 2 }],
        charlie: 3,
      },
    };

    assert.equal(
      serializeSortedJson(value),
      JSON.stringify({ alpha: { charlie: 3, delta: [{ alpha: 2, zulu: 1 }] }, zeta: 1 }, null, 2),
    );
  });

  it('is deterministic across repeated calls', () => {
    const value = { b: 2, a: { d: 4, c: 3 } };
    assert.equal(serializeSortedJson(value), serializeSortedJson(value));
  });

  it('passes through primitives and null unchanged', () => {
    assert.equal(serializeSortedJson(null), 'null');
    assert.equal(serializeSortedJson(7), '7');
    assert.equal(serializeSortedJson('text'), '"text"');
    assert.equal(serializeSortedJson(true), 'true');
  });
});

describe('report --json', () => {
  it('emits a single valid JSON document with the stable MetricsReport keys', async () => {
    let captured = '';
    const returned = await reportCommand({
      cwd: fixtureReportRoot,
      json: true,
      stdout: (msg) => {
        captured = msg;
      },
    });

    const raw = captured || returned;
    // Exactly one JSON document, no prefixes, suffixes, or extra lines.
    assert.ok(raw.startsWith('{'), `expected JSON object, got: ${raw.slice(0, 40)}`);
    assert.ok(raw.endsWith('}'), `expected JSON object, got: ${raw.slice(-40)}`);

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsed), [...STABLE_TOP_LEVEL_KEYS]);
  });

  it('orders the emitted top-level keys alphabetically in the raw text', async () => {
    const raw = await reportCommand({
      cwd: fixtureReportRoot,
      json: true,
      stdout: () => {},
    });

    let previous = -1;
    for (const key of [...STABLE_TOP_LEVEL_KEYS].sort()) {
      const index = raw.indexOf(`"${key}"`);
      assert.ok(index > previous, `${key} should appear after the previous sorted key`);
      previous = index;
    }
  });

  it('matches the structured MetricsReport shape without compatibility aliases', async () => {
    const raw = await reportCommand({
      cwd: fixtureReportRoot,
      json: true,
      stdout: () => {},
    });
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;

    assert.deepEqual(sortedKeys(parsed.specs), ['active', 'archived', 'total']);
    assert.deepEqual(sortedKeys(parsed.tasks), ['dead', 'done', 'pending', 'running', 'total']);
    assert.deepEqual(sortedKeys(parsed.durations), [
      'avgMs',
      'avgSeconds',
      'formattedAvg',
      'formattedTotal',
      'totalMs',
      'totalSeconds',
    ]);
    assert.deepEqual(sortedKeys(parsed.fileChanges), [
      'totalChanges',
      'uniqueCount',
      'uniqueFiles',
    ]);
    assert.deepEqual(sortedKeys(parsed.tokens), [
      'cacheSharePercent',
      'cached_input',
      'input',
      'output',
      'reasoning',
      'total',
    ]);
    assert.deepEqual(sortedKeys(parsed.cost), ['formattedTotal', 'perSpec', 'total']);

    // No legacy aliases leak into the machine-readable output.
    for (const legacyKey of [
      'totalSpecs',
      'activeSpecs',
      'archivedSpecs',
      'totalTasks',
      'doneTasks',
      'deadTasks',
      'runningTasks',
      'pendingTasks',
      'completionPercentage',
      'completionRatio',
      'deadBreakdown',
    ]) {
      assert.equal(legacyKey in parsed, false, `${legacyKey} should not be serialized`);
    }
    for (const legacyTokenKey of [
      'promptTokens',
      'candidateTokens',
      'totalTokens',
      'prompt',
      'candidate',
    ]) {
      assert.equal(
        legacyTokenKey in parsed.tokens,
        false,
        `${legacyTokenKey} should not be serialized`,
      );
    }
    assert.equal('totalEvents' in parsed.fileChanges, false);
  });

  it('keeps the non-JSON path rendering the formatted report', async () => {
    const text = await reportCommand({
      cwd: fixtureReportRoot,
      stdout: () => {},
    });

    assert.ok(text.includes('osq Delivery Metrics Report'));
    assert.ok(!text.trimStart().startsWith('{'));
  });
});

describe('formatMetricsReport', () => {
  it('renders exclusively from the values held by the MetricsReport object', () => {
    const report = {
      completionRate: 12.5,
      durations: {
        totalMs: 1234,
        totalSeconds: 1,
        avgMs: 617,
        avgSeconds: 1,
        formattedTotal: 'TOTAL-X',
        formattedAvg: 'AVG-Y',
      },
      failureBreakdown: { 'reason-z': 7 },
      fileChanges: {
        totalChanges: 42,
        uniqueCount: 3,
        uniqueFiles: ['a.ts', 'b.ts', 'c.ts'],
      },
      specs: { total: 9, active: 4, archived: 5 },
      tasks: { total: 11, done: 5, dead: 1, running: 2, pending: 3 },
      tokens: {
        input: 111,
        cached_input: 222,
        output: 333,
        reasoning: 444,
        total: 1110,
        cacheSharePercent: 66.6,
      },
    } as unknown as MetricsReport;

    const formatted = formatMetricsReport(report);

    assert.ok(formatted.includes('Total specs: 9 (4 active, 5 archived)'));
    assert.ok(formatted.includes('Completion rate: 12.5%'));
    assert.ok(formatted.includes('reason-z: 7'));
    assert.ok(formatted.includes('Total duration: TOTAL-X'));
    assert.ok(formatted.includes('Average duration: AVG-Y'));
    assert.ok(formatted.includes('Input: 111'));
    assert.ok(formatted.includes('Cached input: 222 (66.6% cache share)'));
    assert.ok(formatted.includes('Output: 333'));
    assert.ok(formatted.includes('Reasoning: 444'));
    assert.ok(formatted.includes('Total tokens: 1110'));
    assert.ok(formatted.includes('Total change events: 42'));
    assert.ok(formatted.includes('Unique files modified: 3'));
    assert.ok(!formatted.includes('Cost:'));
  });
});

describe('osq report CLI flag', () => {
  it('registers --json so commander parses it to options.json', () => {
    const program = createProgram();
    const reportCmd = program.commands.find((cmd) => cmd.name() === 'report');
    assert.ok(reportCmd, 'report command should be registered');

    const jsonOption = reportCmd.options.find((option) => option.long === '--json');
    assert.ok(jsonOption, 'report command should declare --json');

    reportCmd.parseOptions(['--json']);
    assert.equal(reportCmd.opts().json, true);
  });
});
