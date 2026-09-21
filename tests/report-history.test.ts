import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { getMetricsReport } from '../src/core/report.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-history-'));
  tmpDirs.push(root);
  await scaffoldProject(root);
  return root;
}

async function createChange(root: string, folder: string, tasks: string[]): Promise<string> {
  const folderPath = path.join(root, 'openspec', 'changes', folder);
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

async function writeEvents(
  changePath: string,
  taskNumber: string,
  events: Record<string, unknown>[],
): Promise<void> {
  const eventsDir = path.join(changePath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  await fs.writeFile(
    path.join(eventsDir, `${taskNumber}.jsonl`),
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
    'utf8',
  );
}

async function writeRawEvents(changePath: string, name: string, content: string): Promise<void> {
  const eventsDir = path.join(changePath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  await fs.writeFile(path.join(eventsDir, name), content, 'utf8');
}

function started(timestamp = '2026-09-17T00:00:00.000Z'): Record<string, unknown> {
  return { type: 'started', timestamp, data: {} };
}

describe('report execution history', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeProject();
  });

  it('counts every started event as an attempt and lists tasks with multiple attempts', async () => {
    const change = await createChange(root, '001-history', ['1', '2', '3']);
    await writeEvents(change, '1', [started(), started(), started()]);
    await writeEvents(change, '2', [started()]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.equal(report.history.attempts.total, 4);
    assert.deepEqual(report.history.attempts.byTask, {
      '001-history/1': 3,
      '001-history/2': 1,
      '001-history/3': 0,
    });
    assert.deepEqual(report.history.attempts.multipleAttempts, ['001-history/1']);
  });

  it('identifies started events with no intervening dead or regressed event', async () => {
    const change = await createChange(root, '001-reruns', ['1', '2', '3', '4']);
    await writeEvents(change, '1', [started(), started(), started()]);
    await writeEvents(change, '2', [
      started(),
      {
        type: 'dead',
        timestamp: '2026-09-17T00:00:01.000Z',
        data: { task: '2', reason: 'crashed' },
      },
      started(),
    ]);
    await writeEvents(change, '3', [
      started(),
      { type: 'regressed', timestamp: '2026-09-17T00:00:01.000Z', data: {} },
      started(),
    ]);
    await writeEvents(change, '4', [started()]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.equal(report.history.unexplainedReruns.total, 2);
    assert.deepEqual(report.history.unexplainedReruns.byTask, { '001-reruns/1': 2 });
  });

  it('groups dead events by reason and treats an absent reason as unknown', async () => {
    const change = await createChange(root, '001-deads', ['1', '2', '3']);
    await writeEvents(change, '1', [
      {
        type: 'dead',
        timestamp: '2026-09-17T00:00:00.000Z',
        data: { task: '1', reason: 'crashed' },
      },
    ]);
    await writeEvents(change, '2', [
      { type: 'dead', timestamp: '2026-09-17T00:00:00.000Z', data: { task: '2', reason: '   ' } },
    ]);
    await writeEvents(change, '3', [
      {
        type: 'dead',
        timestamp: '2026-09-17T00:00:00.000Z',
        data: { task: '3', reason: 'crashed' },
      },
    ]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.deepEqual(report.history.deadByReason, { crashed: 2, unknown: 1 });
  });

  it('records ordered verify exit codes and counts missing exit codes', async () => {
    const change = await createChange(root, '001-verifies', ['1']);
    await writeEvents(change, '1', [
      { type: 'verify_ran', timestamp: '2026-09-17T00:00:00.000Z', data: { exitCode: 0 } },
      { type: 'verify_ran', timestamp: '2026-09-17T00:00:01.000Z', data: { command: 'x' } },
      { type: 'verify_ran', timestamp: '2026-09-17T00:00:02.000Z', data: { exitCode: 2 } },
      { type: 'verify_ran', timestamp: '2026-09-17T00:00:03.000Z', data: { exitCode: 'nope' } },
    ]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.equal(report.history.verifyRuns.total, 4);
    assert.equal(report.history.verifyRuns.missingExitCode, 2);
    assert.deepEqual(report.history.verifyRuns.byTask, { '001-verifies/1': [0, null, 2, null] });
  });

  it('attributes cost to attempts and counts an attempt at most once', async () => {
    const change = await createChange(root, '001-costs', ['1', '2']);
    await writeEvents(change, '1', [
      started(),
      { type: 'tokens', timestamp: '2026-09-17T00:00:01.000Z', data: { cost: 0.1 } },
      { type: 'tokens', timestamp: '2026-09-17T00:00:02.000Z', data: { cost: 0.2 } },
      started(),
      { type: 'tokens', timestamp: '2026-09-17T00:00:03.000Z', data: { cost: 0.3 } },
    ]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.ok(Math.abs(report.history.cost.total - 0.6) <= 1e-9);
    assert.equal(report.history.cost.coverage.reportedAttempts, 2);
    assert.equal(report.history.cost.coverage.totalAttempts, 2);
    assert.equal(report.history.cost.provenance, 'harness-reported');
  });

  it('does not associate cost with an attempt when no started event precedes it', async () => {
    const change = await createChange(root, '001-costless-attempt', ['1']);
    await writeEvents(change, '1', [
      { type: 'tokens', timestamp: '2026-09-17T00:00:00.000Z', data: { cost: 0.25 } },
    ]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.equal(report.history.cost.total, 0.25);
    assert.equal(report.history.cost.coverage.reportedAttempts, 0);
    assert.equal(report.history.cost.coverage.totalAttempts, 0);
  });

  it('ignores change.jsonl for task attempts and coverage', async () => {
    const change = await createChange(root, '001-change-scope', ['1', '2']);
    await writeRawEvents(
      change,
      'change.jsonl',
      `${JSON.stringify(started())}\n${JSON.stringify({
        type: 'tokens',
        timestamp: '2026-09-17T00:00:00.000Z',
        data: { input: 10, cost: 0.5 },
      })}\n`,
    );

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.equal(report.history.attempts.total, 0);
    assert.equal(report.coverage.withEvents, 0);
    assert.equal(report.coverage.withoutEvents, 2);
    // Unrelated token aggregation still reads every event stream.
    assert.equal(report.tokens.input, 10);
  });

  it('parses malformed lines defensively', async () => {
    const change = await createChange(root, '001-malformed', ['1']);
    await writeRawEvents(
      change,
      '1.jsonl',
      `${JSON.stringify(started())}\nnot json\n${JSON.stringify({
        type: 'dead',
        timestamp: '2026-09-17T00:00:01.000Z',
        data: { task: '1', reason: 'timeout' },
      })}\n`,
    );

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.equal(report.history.attempts.total, 1);
    assert.deepEqual(report.history.deadByReason, { timeout: 1 });
  });
});
