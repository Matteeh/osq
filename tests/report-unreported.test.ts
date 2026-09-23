import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { reportCommand } from '../src/cli/report.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-unreported-'));
  tmpDirs.push(root);
  await scaffoldProject(root);
  return root;
}

async function createChange(
  root: string,
  location: 'active' | 'archive',
  folder: string,
  tasks: string[],
): Promise<string> {
  const folderPath = path.join(
    root,
    'openspec',
    'changes',
    ...(location === 'archive' ? ['archive'] : []),
    folder,
  );
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(folderPath, 'proposal.md'),
    `---\ntitle: ${folder}\nfeatures:\n  reads: []\n---\n## Goal\nx\n`,
    'utf8',
  );
  for (const taskNumber of tasks) {
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${taskNumber}.md`),
      `---\ntitle: Task ${taskNumber}\nverify: node -e "process.exit(0)"\nscope: []\nentry: []\nskills: []\n---\n## Acceptance\n- [ ] x\n`,
      'utf8',
    );
  }
  return folderPath;
}

async function writeJsonl(target: string, lines: unknown[]): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, 'utf8');
}

function planStarted(sessionId: string, timestamp: string): unknown {
  return {
    type: 'plan_started',
    sessionId,
    timestamp,
    data: { harness: 'opencode', model: 'model', osqVersion: '0.0.0', briefHash: 'sha256:x' },
  };
}

function planExited(
  sessionId: string,
  timestamp: string,
  wallSeconds: number,
  cost: number | null,
): unknown {
  return {
    type: 'plan_exited',
    sessionId,
    timestamp,
    data: {
      exitCode: 0,
      wallSeconds,
      usage: {
        inputTokens: null,
        outputTokens: null,
        cachedTokens: null,
        reasoningTokens: null,
        cost,
      },
    },
  };
}

async function reportJson(root: string): Promise<MetricsReport> {
  const raw = await reportCommand({
    cwd: root,
    config: DEFAULT_CONFIG,
    json: true,
    stdout: () => {},
  });
  return JSON.parse(raw) as MetricsReport;
}

describe('report unmarked tasks and unreported costs', () => {
  it('counts archived markerless tasks as unmarked beside an active pending task', async () => {
    const root = await makeProject();
    await createChange(root, 'active', '001-active', ['1']);
    await createChange(root, 'archive', '002-archived', ['1', '2']);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.equal(report.now.total, 3);
    assert.equal(report.now.pending, 1);
    assert.equal(report.now.unmarked, 2);
    assert.equal(report.now.done, 0);
    assert.equal(
      report.now.done +
        report.now.dead +
        report.now.regressed +
        report.now.running +
        report.now.pending +
        report.now.unmarked,
      report.now.total,
    );

    const text = formatMetricsReport(report);
    assert.ok(text.includes('  Pending: 1\n  Unmarked: 2'), text);

    const parsed = await reportJson(root);
    assert.equal(parsed.now.pending, 1);
    assert.equal(parsed.now.unmarked, 2);
    assert.equal(parsed.now.total, 3);
  });

  it('labels costs no attempt or session reported as not reported in JSON and text', async () => {
    const root = await makeProject();
    const change = await createChange(root, 'active', '001-unreported', ['1']);
    await writeJsonl(path.join(change, '.run', 'events', '1.jsonl'), [
      { type: 'started', timestamp: '2026-09-17T00:00:00.000Z', data: {} },
      { type: 'tokens', timestamp: '2026-09-17T00:00:01.000Z', data: { input: 100, output: 20 } },
    ]);
    await writeJsonl(path.join(change, '.run', 'plan.jsonl'), [
      planStarted('s1', '2026-09-17T00:00:00.000Z'),
      planExited('s1', '2026-09-17T00:01:00.000Z', 60, null),
    ]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    // Execution attempts exist but none reported cost.
    assert.equal(report.history.cost.total, 0);
    assert.equal(report.history.cost.formattedTotal, 'not reported');
    assert.deepEqual(report.history.cost.coverage, { reportedAttempts: 0, totalAttempts: 1 });

    // A planning session exists but reported no cost.
    assert.equal(report.planning.cost.total, 0);
    assert.equal(report.planning.cost.formattedTotal, 'not reported');
    assert.deepEqual(report.planning.coverage, { reportedSessions: 0, totalSessions: 1 });

    const text = formatMetricsReport(report);
    assert.ok(
      text.includes('Harness-reported cost: not reported (0 of 1 attempts reported cost)'),
      text,
    );
    assert.ok(text.includes('Harness-reported cost: not reported'), text);

    const parsed = await reportJson(root);
    assert.equal(parsed.history.cost.formattedTotal, 'not reported');
    assert.equal(parsed.history.cost.total, 0);
    assert.equal(parsed.planning.cost.formattedTotal, 'not reported');
    assert.equal(parsed.planning.cost.total, 0);
  });

  it('keeps the reported sum when one attempt among several reports cost', async () => {
    const root = await makeProject();
    const change = await createChange(root, 'active', '001-partial', ['1']);
    await writeJsonl(path.join(change, '.run', 'events', '1.jsonl'), [
      { type: 'started', timestamp: '2026-09-17T00:00:00.000Z', data: {} },
      { type: 'tokens', timestamp: '2026-09-17T00:00:01.000Z', data: { input: 10, cost: 0.5 } },
      { type: 'dead', timestamp: '2026-09-17T00:00:02.000Z', data: { reason: 'verify_red' } },
      { type: 'started', timestamp: '2026-09-17T00:00:03.000Z', data: {} },
      { type: 'tokens', timestamp: '2026-09-17T00:00:04.000Z', data: { input: 10 } },
    ]);
    await writeJsonl(path.join(change, '.run', 'plan.jsonl'), [
      planStarted('s1', '2026-09-17T00:00:00.000Z'),
      planExited('s1', '2026-09-17T00:01:00.000Z', 60, 0.25),
      planStarted('s2', '2026-09-17T00:02:00.000Z'),
      planExited('s2', '2026-09-17T00:03:00.000Z', 60, null),
    ]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.equal(report.history.cost.total, 0.5);
    assert.equal(report.history.cost.formattedTotal, '$0.50');
    assert.deepEqual(report.history.cost.coverage, { reportedAttempts: 1, totalAttempts: 2 });

    assert.equal(report.planning.cost.total, 0.25);
    assert.equal(report.planning.cost.formattedTotal, '$0.25');
    assert.deepEqual(report.planning.coverage, { reportedSessions: 1, totalSessions: 2 });

    const text = formatMetricsReport(report);
    assert.ok(text.includes('Harness-reported cost: $0.50 (1 of 2 attempts reported cost)'), text);
    assert.ok(text.includes('Harness-reported cost: $0.25'), text);

    const parsed = await reportJson(root);
    assert.equal(parsed.history.cost.formattedTotal, '$0.50');
    assert.equal(parsed.planning.cost.formattedTotal, '$0.25');
  });
});
