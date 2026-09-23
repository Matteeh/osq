import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { formatMetricsReport, getMetricsReport } from '../src/core/report/report.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-pre-spawn-'));
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

describe('report pre-spawn verify history', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeProject();
  });

  it('counts pre-spawn runs and mismatches apart from verification runs', async () => {
    const change = await createChange(root, '001-pre-spawn', ['1']);
    await writeEvents(change, '1', [
      {
        type: 'verify_ran',
        timestamp: '2026-09-18T00:00:00.000Z',
        data: { command: 'x', phase: 'pre_spawn', expected: 'red', mismatch: false, exitCode: 1 },
      },
      {
        type: 'verify_ran',
        timestamp: '2026-09-18T00:00:01.000Z',
        data: { command: 'x', phase: 'pre_spawn', expected: 'red', mismatch: true, exitCode: 0 },
      },
      { type: 'started', timestamp: '2026-09-18T00:00:02.000Z', data: {} },
      { type: 'verify_ran', timestamp: '2026-09-18T00:00:03.000Z', data: { exitCode: 0 } },
    ]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.equal(report.history.preSpawnVerify.runs, 2);
    assert.equal(report.history.preSpawnVerify.mismatches, 1);
    assert.deepEqual(report.history.preSpawnVerify.mismatchedTasks, ['001-pre-spawn/1']);
    // Only the post-spawn gate enters verification history.
    assert.equal(report.history.verifyRuns.total, 1);
    assert.deepEqual(report.history.verifyRuns.byTask, { '001-pre-spawn/1': [0] });
    assert.equal(report.history.attempts.total, 1);

    const text = formatMetricsReport(report);
    assert.ok(text.includes('Pre-spawn verify mismatches: 1 of 2 runs'), text);
  });
});
