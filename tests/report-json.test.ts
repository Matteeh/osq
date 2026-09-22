import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
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
  'coverage',
  'cycle',
  'durations',
  'fileChanges',
  'history',
  'now',
  'planning',
  'queue',
  'specs',
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
      // Top-level keys are the only ones indented exactly two spaces.
      const index = raw.indexOf(`\n  "${key}"`);
      assert.ok(index > previous, `${key} should appear after the previous sorted key`);
      previous = index;
    }
  });

  it('matches the checked-in fixture byte for byte through the real report command', async () => {
    const raw = await reportCommand({
      cwd: fixtureReportRoot,
      json: true,
      stdout: () => {},
    });
    // The CLI prints the document with a trailing newline; compare that exact
    // stdout byte sequence against the checked-in expected JSON.
    const expected = await fs.readFile(path.join(fixtureReportRoot, 'expected.json'), 'utf8');
    assert.equal(`${raw}\n`, expected);
  });

  it('matches the structured MetricsReport shape without compatibility aliases', async () => {
    const raw = await reportCommand({
      cwd: fixtureReportRoot,
      json: true,
      stdout: () => {},
    });
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;

    assert.deepEqual(sortedKeys(parsed.specs), ['active', 'archived', 'total']);
    assert.deepEqual(sortedKeys(parsed.now), [
      'dead',
      'done',
      'manual',
      'pending',
      'regressed',
      'running',
      'total',
      'verified',
    ]);
    assert.deepEqual(sortedKeys(parsed.coverage), ['byChange', 'withEvents', 'withoutEvents']);
    assert.deepEqual(sortedKeys(parsed.history), [
      'attempts',
      'cost',
      'deadByReason',
      'rejections',
      'scopeRegressions',
      'sizes',
      'unexplainedReruns',
      'verifyRuns',
    ]);
    assert.deepEqual(sortedKeys(parsed.history.scopeRegressions as object), [
      'detected',
      'recertifiedByHuman',
      'requeuedForAgent',
      'verificationFailedAtDetection',
      'verificationPassedAtDetection',
    ]);
    assert.deepEqual(parsed.history.scopeRegressions, {
      detected: 0,
      verificationPassedAtDetection: 0,
      verificationFailedAtDetection: 0,
      recertifiedByHuman: 0,
      requeuedForAgent: 0,
    });
    assert.deepEqual(sortedKeys(parsed.history.sizes as object), [
      'byAcceptanceLines',
      'scopeFileSeries',
    ]);
    assert.deepEqual(sortedKeys(parsed.history.attempts as object), [
      'byTask',
      'multipleAttempts',
      'total',
    ]);
    assert.deepEqual(sortedKeys(parsed.history.verifyRuns as object), [
      'byTask',
      'missingExitCode',
      'total',
    ]);
    assert.deepEqual(sortedKeys(parsed.history.cost as object), [
      'coverage',
      'formattedTotal',
      'perSpec',
      'provenance',
      'total',
    ]);
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
    assert.deepEqual(sortedKeys(parsed.planning), [
      'changesWithPlanningRecords',
      'cost',
      'coverage',
      'sessions',
      'tokens',
      'wallSeconds',
      'wallSecondsByChange',
    ]);
    assert.deepEqual(sortedKeys(parsed.planning.tokens as object), [
      'cached',
      'input',
      'output',
      'reasoning',
    ]);
    assert.deepEqual(sortedKeys(parsed.planning.cost as object), [
      'formattedTotal',
      'provenance',
      'total',
    ]);
    assert.deepEqual(sortedKeys(parsed.planning.coverage as object), [
      'reportedSessions',
      'totalSessions',
    ]);
    assert.deepEqual(sortedKeys(parsed.cycle), ['byChange', 'phases']);
    assert.deepEqual(sortedKeys(parsed.cycle.phases as object), [
      'approvalToFirstTask',
      'briefToApproval',
      'firstTaskToArchive',
      'total',
    ]);
    assert.deepEqual(sortedKeys((parsed.cycle.phases as Record<string, object>).total), [
      'averageSeconds',
      'coveredChanges',
      'totalChanges',
      'totalSeconds',
    ]);
    assert.deepEqual(sortedKeys(parsed.queue as object), [
      'configured',
      'failures',
      'items',
      'landed',
      'planning',
      'rejections',
      'total',
    ]);
    assert.deepEqual(sortedKeys(parsed.queue.planning as object), [
      'cost',
      'costCoverageComplete',
      'sessions',
    ]);

    // The replaced projections are gone from the machine-readable output.
    for (const replacedKey of ['tasks', 'failureBreakdown', 'cost']) {
      assert.equal(replacedKey in parsed, false, `${replacedKey} should not be serialized`);
    }

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
      coverage: {
        withEvents: 2,
        withoutEvents: 1,
        byChange: {
          '001-spec': { withEvents: ['1'], withoutEvents: ['2'] },
        },
      },
      cycle: {
        phases: {
          briefToApproval: {
            totalSeconds: 10,
            averageSeconds: 5,
            coveredChanges: 2,
            totalChanges: 3,
          },
          approvalToFirstTask: {
            totalSeconds: 20,
            averageSeconds: 10,
            coveredChanges: 2,
            totalChanges: 3,
          },
          firstTaskToArchive: {
            totalSeconds: 30,
            averageSeconds: 15,
            coveredChanges: 2,
            totalChanges: 3,
          },
          total: { totalSeconds: 60, averageSeconds: 30, coveredChanges: 2, totalChanges: 3 },
        },
        byChange: [
          {
            change: '001-spec',
            briefToApprovalSeconds: 10,
            approvalToFirstTaskSeconds: 20,
            firstTaskToArchiveSeconds: 30,
            totalSeconds: 60,
          },
        ],
      },
      durations: {
        totalMs: 1234,
        totalSeconds: 1,
        avgMs: 617,
        avgSeconds: 1,
        formattedTotal: 'TOTAL-X',
        formattedAvg: 'AVG-Y',
      },
      fileChanges: {
        totalChanges: 42,
        uniqueCount: 3,
        uniqueFiles: ['a.ts', 'b.ts', 'c.ts'],
      },
      history: {
        attempts: { total: 7, byTask: { '001-spec/1': 7 }, multipleAttempts: ['001-spec/1'] },
        deadByReason: { 'reason-z': 7 },
        unexplainedReruns: { total: 2, byTask: { '001-spec/1': 2 } },
        verifyRuns: { total: 3, missingExitCode: 1, byTask: { '001-spec/1': [0, null, 1] } },
        cost: {
          total: 0.5,
          perSpec: { '001-spec': 0.5 },
          formattedTotal: 'COST-X',
          provenance: 'harness-reported',
          coverage: { reportedAttempts: 4, totalAttempts: 7 },
        },
        rejections: {
          total: 2,
          byPlannerModel: { 'opencode/big-pickle': 1, unknown: 1 },
        },
        sizes: {
          scopeFileSeries: [
            {
              resolver: 'legacy',
              startsAtChange: null,
              byScopeFiles: [
                {
                  bucket: '1-2',
                  tasks: 2,
                  firstAttemptPassRate: 0.5,
                  meanAttempts: 1.5,
                  medianDurationSeconds: 30,
                },
              ],
              largestFirstAttemptPass: null,
            },
            {
              resolver: 'resolver-2',
              startsAtChange: '001-spec',
              byScopeFiles: [],
              largestFirstAttemptPass: null,
            },
          ],
          byAcceptanceLines: [],
        },
        scopeRegressions: {
          detected: 4,
          verificationPassedAtDetection: 1,
          verificationFailedAtDetection: 2,
          recertifiedByHuman: 1,
          requeuedForAgent: 1,
        },
      },
      now: {
        total: 11,
        done: 5,
        verified: 4,
        manual: 1,
        dead: 1,
        regressed: 1,
        running: 2,
        pending: 1,
      },
      planning: {
        sessions: 9,
        changesWithPlanningRecords: 4,
        wallSeconds: 660,
        wallSecondsByChange: { '001-spec': 660 },
        tokens: { input: 11, output: 22, cached: 33, reasoning: 44 },
        cost: { total: 0.75, formattedTotal: 'PLAN-COST', provenance: 'harness-reported' },
        coverage: { reportedSessions: 3, totalSessions: 9 },
      },
      specs: { total: 9, active: 4, archived: 5 },
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
    assert.ok(formatted.includes('Now:'));
    assert.ok(formatted.includes('Verified done: 4'));
    assert.ok(formatted.includes('Manual done: 1'));
    assert.ok(formatted.includes('Regressed: 1'));
    assert.ok(formatted.includes('History:'));
    assert.ok(formatted.includes('reason-z: 7'));
    assert.ok(formatted.includes('Rejections: 2'));
    assert.ok(formatted.includes('Rejections by planner model:'));
    assert.ok(formatted.includes('opencode/big-pickle: 1'));
    assert.ok(formatted.includes('unknown: 1'));
    assert.ok(formatted.includes('Harness-reported cost: COST-X (4 of 7 attempts reported cost)'));
    assert.ok(formatted.includes('Coverage:'));
    assert.ok(formatted.includes('Tasks with event files: 2'));
    assert.ok(formatted.includes('Tasks without event files: 1'));
    assert.ok(formatted.includes('Planning:'));
    assert.ok(formatted.includes('Sessions: 9'));
    assert.ok(formatted.includes('Total wall time: 11m'));
    assert.ok(formatted.includes('Input tokens: 11'));
    assert.ok(formatted.includes('Harness-reported cost: PLAN-COST'));
    assert.ok(formatted.includes('3 of 9 sessions reported usage'));
    assert.ok(formatted.includes('4 changes have a planning record'));
    assert.ok(formatted.includes('Cycle:'));
    assert.ok(
      formatted.includes('Brief to approval: total 10s, average 5s (2 of 3 archived changes)'),
    );
    assert.ok(formatted.includes('Total duration: TOTAL-X'));
    assert.ok(formatted.includes('Average duration: AVG-Y'));
    assert.ok(formatted.includes('Input: 111'));
    assert.ok(formatted.includes('Cached input: 222 (66.6% cache share)'));
    assert.ok(formatted.includes('Output: 333'));
    assert.ok(formatted.includes('Reasoning: 444'));
    assert.ok(formatted.includes('Total tokens: 1110'));
    assert.ok(formatted.includes('Total change events: 42'));
    assert.ok(formatted.includes('Unique files modified: 3'));
    assert.ok(formatted.includes('Size by scope files (legacy):'));
    assert.ok(formatted.includes('Size by scope files (resolver-2):'));
    assert.ok(formatted.includes('Resolver 2 starts at: 001-spec'));
    assert.ok(formatted.includes('Size by acceptance lines:'));
    assert.ok(formatted.includes('1-2'));
    assert.ok(formatted.includes('Scope regressions:'));
    assert.ok(formatted.includes('Detected: 4'));
    assert.ok(formatted.includes('Verification passed at detection: 1'));
    assert.ok(formatted.includes('Verification failed at detection: 2'));
    assert.ok(formatted.includes('Recertified by human: 1'));
    assert.ok(formatted.includes('Requeued for agent: 1'));
  });

  it('always renders the historical cost line, including at zero', () => {
    const report = {
      completionRate: 0,
      coverage: { withEvents: 0, withoutEvents: 0, byChange: {} },
      cycle: {
        phases: {
          briefToApproval: {
            totalSeconds: 0,
            averageSeconds: 0,
            coveredChanges: 0,
            totalChanges: 0,
          },
          approvalToFirstTask: {
            totalSeconds: 0,
            averageSeconds: 0,
            coveredChanges: 0,
            totalChanges: 0,
          },
          firstTaskToArchive: {
            totalSeconds: 0,
            averageSeconds: 0,
            coveredChanges: 0,
            totalChanges: 0,
          },
          total: { totalSeconds: 0, averageSeconds: 0, coveredChanges: 0, totalChanges: 0 },
        },
        byChange: [],
      },
      durations: {
        totalMs: 0,
        totalSeconds: 0,
        avgMs: 0,
        avgSeconds: 0,
        formattedTotal: '0s',
        formattedAvg: '0s',
      },
      fileChanges: { totalChanges: 0, uniqueCount: 0, uniqueFiles: [] },
      history: {
        attempts: { total: 0, byTask: {}, multipleAttempts: [] },
        deadByReason: {},
        unexplainedReruns: { total: 0, byTask: {} },
        verifyRuns: { total: 0, missingExitCode: 0, byTask: {} },
        cost: {
          total: 0,
          perSpec: {},
          formattedTotal: '$0.0000',
          provenance: 'harness-reported',
          coverage: { reportedAttempts: 0, totalAttempts: 0 },
        },
        rejections: { total: 0, byPlannerModel: {} },
        sizes: {
          scopeFileSeries: [
            {
              resolver: 'legacy',
              startsAtChange: null,
              byScopeFiles: [],
              largestFirstAttemptPass: null,
            },
            {
              resolver: 'resolver-2',
              startsAtChange: null,
              byScopeFiles: [],
              largestFirstAttemptPass: null,
            },
          ],
          byAcceptanceLines: [],
        },
        scopeRegressions: {
          detected: 0,
          verificationPassedAtDetection: 0,
          verificationFailedAtDetection: 0,
          recertifiedByHuman: 0,
          requeuedForAgent: 0,
        },
      },
      now: {
        total: 0,
        done: 0,
        verified: 0,
        manual: 0,
        dead: 0,
        regressed: 0,
        running: 0,
        pending: 0,
      },
      planning: {
        sessions: 0,
        changesWithPlanningRecords: 0,
        wallSeconds: 0,
        wallSecondsByChange: {},
        tokens: { input: 0, output: 0, cached: 0, reasoning: 0 },
        cost: { total: 0, formattedTotal: '$0.0000', provenance: 'harness-reported' },
        coverage: { reportedSessions: 0, totalSessions: 0 },
      },
      specs: { total: 0, active: 0, archived: 0 },
      tokens: {
        input: 0,
        cached_input: 0,
        output: 0,
        reasoning: 0,
        total: 0,
        cacheSharePercent: 0,
      },
    } as unknown as MetricsReport;

    const formatted = formatMetricsReport(report);
    assert.ok(
      formatted.includes('Harness-reported cost: $0.0000 (0 of 0 attempts reported cost)'),
      formatted,
    );
    assert.ok(formatted.includes('Scope regressions:'), formatted);
    assert.ok(formatted.includes('Detected: 0'), formatted);
    assert.ok(formatted.includes('Verification passed at detection: 0'), formatted);
    assert.ok(formatted.includes('Verification failed at detection: 0'), formatted);
    assert.ok(formatted.includes('Recertified by human: 0'), formatted);
    assert.ok(formatted.includes('Requeued for agent: 0'), formatted);
    assert.ok(formatted.includes('0 changes have a planning record'), formatted);
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
