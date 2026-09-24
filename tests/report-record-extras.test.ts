import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { reportCommand } from '../src/cli/report.js';
import { DEFAULT_PLANNING_CONFIG } from '../src/core/foundation/config-planning.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { resolveSliceCost } from '../src/core/report/planning-slice-measures.js';
import type { PlanningTurn } from '../src/core/report/planning-slice.js';
import { formatMetricsReport, getMetricsReport } from '../src/core/report/report.js';

const tmpDirs: string[] = [];
const ts = '2026-09-18T00:00:00.000Z';
const PRICES = { 'claude-opus-5-5': { input: 2, output: 3, cacheRead: 0, cacheWrite: 0 } };

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-extras-'));
  tmpDirs.push(root);
  await fs.mkdir(path.join(root, 'openspec', 'changes'), { recursive: true });
  return root;
}

interface ChangeFixture {
  readonly fixes?: readonly string[];
  readonly manifest?: Record<string, unknown>;
  readonly results?: Record<string, string>;
  readonly plan?: readonly string[];
}

/** One active or archived change folder with a proposal, task, and run records. */
async function writeChange(
  root: string,
  relative: string,
  fixture: ChangeFixture = {},
): Promise<string> {
  const folderPath = path.join(root, 'openspec', 'changes', relative);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  const fixes = fixture.fixes
    ? `fixes: [${fixture.fixes.map((id) => JSON.stringify(id)).join(', ')}]\n`
    : '';
  await fs.writeFile(
    path.join(folderPath, 'proposal.md'),
    `---\ntitle: ${relative}\n${fixes}---\n## Goal\n\nFixture.\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(folderPath, 'tasks', '1.md'),
    '---\ntitle: Task 1\n---\n## Acceptance\n- [ ] x\n',
    'utf8',
  );

  const runDir = path.join(folderPath, '.run');
  await fs.mkdir(runDir, { recursive: true });
  if (fixture.manifest) {
    await fs.writeFile(
      path.join(runDir, 'manifest.json'),
      JSON.stringify(fixture.manifest),
      'utf8',
    );
  }
  if (fixture.results) {
    await fs.mkdir(path.join(runDir, 'results'), { recursive: true });
    for (const [file, content] of Object.entries(fixture.results)) {
      await fs.writeFile(path.join(runDir, 'results', file), content, 'utf8');
    }
  }
  if (fixture.plan) {
    await fs.writeFile(path.join(runDir, 'plan.jsonl'), `${fixture.plan.join('\n')}\n`, 'utf8');
  }
  return folderPath;
}

function planStarted(sessionId: string, model: string): string {
  return JSON.stringify({
    type: 'plan_started',
    sessionId,
    timestamp: ts,
    data: { harness: 'opencode', model, osqVersion: '0.0.0', briefHash: 'sha256:x' },
  });
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

function planExited(
  sessionId: string,
  usage: Record<string, unknown>,
  slice?: Record<string, unknown>,
): string {
  return JSON.stringify({
    type: 'plan_exited',
    sessionId,
    timestamp: ts,
    data: { exitCode: 0, wallSeconds: 60, usage, ...(slice ? { slice } : {}) },
  });
}

function measuredSlice(
  input: number,
  output: number,
  costSource: 'harness' | 'price_table' | null,
): Record<string, unknown> {
  return {
    start: ts,
    end: ts,
    approvedAt: ts,
    lastEditAt: null,
    turns: 1,
    activeMinutes: 0,
    tokens: { input, output, cacheRead: null, cacheWrite: null, reasoning: null },
    costSource,
  };
}

describe('report rework, disclosures, and planning estimates', () => {
  it('derives rework without rejected fixers and counts it as flag trouble', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-fixed', {
      manifest: {
        approvedAt: ts,
        approvalFlags: { ids: ['sensitive_path', 'removed_requirement'], mode: 'shown' },
      },
    });
    await writeChange(root, '002-fixer', { fixes: ['001'] });
    // A rejected fixer never contributes, whatever it names.
    await writeChange(root, 'rejected/003-rejected', { fixes: ['001', '005'] });
    await writeChange(root, '005-untouched');

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.deepEqual(report.history.rework, [{ change: '001', fixedBy: ['002'] }]);
    assert.deepEqual(report.approvalFlags.byFlag.sensitive_path, {
      shown: { fired: 1, troubled: 1 },
      confirmed: { fired: 0, troubled: 0 },
    });
    assert.deepEqual(report.approvalFlags.byFlag.removed_requirement, {
      shown: { fired: 1, troubled: 1 },
      confirmed: { fired: 0, troubled: 0 },
    });
    assert.deepEqual(report.approvalFlags.troubledChanges, [
      {
        change: '001',
        flags: ['sensitive_path', 'removed_requirement'],
        kinds: ['rework'],
        fixedBy: ['002'],
      },
    ]);

    const text = formatMetricsReport(report);
    assert.ok(text.includes('Rework:'), text);
    assert.ok(text.includes('  001: fixed by 002'), text);
    assert.ok(
      text.includes('001 (sensitive_path, removed_requirement): rework (fixed by 002)'),
      text,
    );
    assert.equal(text.includes('003: fixed by'), false, text);
    assert.equal(text.includes('005: fixed by'), false, text);

    const raw = await reportCommand({
      cwd: root,
      config: DEFAULT_CONFIG,
      json: true,
      stdout: () => {},
    });
    const parsed = JSON.parse(raw) as {
      history: { rework: unknown };
      approvalFlags: { troubledChanges: unknown };
    };
    assert.deepEqual(parsed.history.rework, [{ change: '001', fixedBy: ['002'] }]);
    assert.deepEqual(parsed.approvalFlags.troubledChanges, [
      { change: '001', flags: ['sensitive_path', 'removed_requirement'], kinds: ['rework'] },
    ]);
  });

  it('counts real disclosures and estimates only priced sliced sessions', async () => {
    const root = await tempRoot();
    await writeChange(root, '003-disclosed', {
      results: {
        '1.md':
          '## Changed\n\nstuff\n\n## deviated:\n\nChanged course.\n\n## Outside scope\n\nFound a bug.\n',
        '2.md': '## Missing context\n\nThe task lacked a path.\n',
      },
    });
    await writeChange(root, '004-estimated', {
      plan: [
        planStarted('e1', 'claude-opus-5-5'),
        planExited('e1', nullUsage(), measuredSlice(1_000_000, 2_000_000, 'price_table')),
        planStarted('e2', 'unpriced-model'),
        planExited('e2', nullUsage(), measuredSlice(5_000_000, 5_000_000, 'price_table')),
        planStarted('e3', 'claude-opus-5-5'),
        planExited('e3', { ...nullUsage(), inputTokens: 10, cost: 0.4 }),
      ],
    });

    const priced: OsqConfig = {
      ...DEFAULT_CONFIG,
      planning: { ...DEFAULT_PLANNING_CONFIG, prices: PRICES },
    };

    const report = await getMetricsReport(root, priced);

    assert.deepEqual(report.history.disclosures, [
      { change: '003', deviated: 1, missingContext: 1, outsideScope: 1 },
    ]);

    const turn: PlanningTurn = {
      timestamp: ts,
      model: 'claude-opus-5-5',
      inputTokens: 1_000_000,
      outputTokens: 2_000_000,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      reasoningTokens: null,
      cost: null,
      edits: [],
    };
    const expected = resolveSliceCost([turn], false, null, PRICES).cost;
    assert.equal(expected, 8);
    assert.equal(report.planning.cost.bySource.reportEstimate.sessions, 1);
    assert.equal(report.planning.cost.bySource.reportEstimate.total, expected);
    // The unpriced model stays unestimated; only the recorded harness cost counts.
    assert.equal(report.planning.cost.bySource.harness.sessions, 1);
    assert.equal(report.planning.cost.bySource.harness.total, 0.4);
    assert.equal(report.planning.cost.bySource.totalWithEstimates, 8.4);
    assert.equal(report.planning.cost.total, 0.4);

    const text = formatMetricsReport(report, priced);
    assert.ok(text.includes('Executor disclosures:'), text);
    assert.ok(text.includes('  003: deviated 1, missing context 1, outside scope 1'), text);
    assert.ok(text.includes('Estimated from planning.prices: $8.00 (1 sessions)'), text);
    assert.ok(text.includes('Planning cost with estimates: $8.40 ($8.00 estimated)'), text);

    const raw = await reportCommand({ cwd: root, config: priced, json: true, stdout: () => {} });
    const parsed = JSON.parse(raw) as {
      history: { disclosures: unknown };
      planning: {
        cost: {
          bySource: {
            reportEstimate: { total: number; sessions: number };
            totalWithEstimates: number;
          };
        };
      };
    };
    assert.deepEqual(parsed.history.disclosures, [
      { change: '003', deviated: 1, missingContext: 1, outsideScope: 1 },
    ]);
    assert.equal(parsed.planning.cost.bySource.reportEstimate.total, expected);
    assert.equal(parsed.planning.cost.bySource.totalWithEstimates, 8.4);
  });

  it('prints empty sections honestly when nothing reworked or disclosed', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-plain');

    const report = await getMetricsReport(root, DEFAULT_CONFIG);
    const text = formatMetricsReport(report);

    assert.ok(text.includes('Rework:'), text);
    assert.ok(text.includes('Executor disclosures:'), text);
    assert.ok(text.includes('  (none)'), text);
    assert.deepEqual(report.history.rework, []);
    assert.deepEqual(report.history.disclosures, []);
  });
});
