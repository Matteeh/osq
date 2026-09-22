import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { reportCommand } from '../src/cli/report.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { formatMetricsReport, getMetricsReport } from '../src/core/report/report.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-now-'));
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

async function doneMarker(changePath: string, taskNumber: string, frontmatter = ''): Promise<void> {
  await fs.mkdir(path.join(changePath, '.run', 'done'), { recursive: true });
  await fs.writeFile(path.join(changePath, '.run', 'done', taskNumber), frontmatter, 'utf8');
}

async function deadMarker(changePath: string, taskNumber: string, reason: string): Promise<void> {
  await fs.mkdir(path.join(changePath, '.run', 'dead'), { recursive: true });
  await fs.writeFile(
    path.join(changePath, '.run', 'dead', `${taskNumber}.md`),
    `---\nreason: ${reason}\n---\nfailed\n`,
    'utf8',
  );
}

async function marker(changePath: string, kind: string, taskNumber: string): Promise<void> {
  await fs.mkdir(path.join(changePath, '.run', kind), { recursive: true });
  await fs.writeFile(path.join(changePath, '.run', kind, `${taskNumber}.md`), '', 'utf8');
}

async function runningMarker(changePath: string, taskNumber: string): Promise<void> {
  await fs.mkdir(path.join(changePath, '.run', 'running'), { recursive: true });
  await fs.writeFile(path.join(changePath, '.run', 'running', `${taskNumber}.pid`), '1', 'utf8');
}

describe('report current state', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeProject();
  });

  it('derives all eight task counts from markers and separates manual from verified', async () => {
    const change = await createChange(root, '001-states', ['1', '2', '3', '4', '5', '6']);
    await doneMarker(change, '1', '---\nmanual: true\nreason: nope\n---\n');
    await doneMarker(change, '2');
    await deadMarker(change, '3', 'verify_red');
    await runningMarker(change, '4');
    await marker(change, 'regressed', '5');

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.deepEqual(report.now, {
      total: 6,
      done: 2,
      verified: 1,
      manual: 1,
      dead: 1,
      regressed: 1,
      running: 1,
      pending: 1,
    });
  });

  it('always includes zero-valued verified and manual counts in JSON and text', async () => {
    await createChange(root, '001-empty', ['1']);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);
    assert.equal(report.now.verified, 0);
    assert.equal(report.now.manual, 0);

    const text = formatMetricsReport(report);
    assert.ok(text.includes('Verified done: 0'), text);
    assert.ok(text.includes('Manual done: 0'), text);

    const raw = await reportCommand({
      cwd: root,
      config: DEFAULT_CONFIG,
      json: true,
      stdout: () => {},
    });
    const parsed = JSON.parse(raw) as { now: { verified: number; manual: number } };
    assert.equal(parsed.now.verified, 0);
    assert.equal(parsed.now.manual, 0);
  });

  it('keeps a historical dead event out of current dead when the marker is done', async () => {
    const change = await createChange(root, '001-retried', ['1']);
    await doneMarker(change, '1');
    const eventsDir = path.join(change, '.run', 'events');
    await fs.mkdir(eventsDir, { recursive: true });
    await fs.writeFile(
      path.join(eventsDir, '1.jsonl'),
      `${JSON.stringify({
        type: 'dead',
        timestamp: '2026-09-17T00:00:00.000Z',
        data: { task: '1', reason: 'crashed' },
      })}\n`,
      'utf8',
    );

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.equal(report.now.dead, 0);
    assert.equal(report.now.done, 1);
    assert.equal(report.history.deadByReason.crashed, 1);
  });

  it('does not treat a done event as a current completion', async () => {
    const change = await createChange(root, '001-event-only', ['1']);
    const eventsDir = path.join(change, '.run', 'events');
    await fs.mkdir(eventsDir, { recursive: true });
    await fs.writeFile(
      path.join(eventsDir, '1.jsonl'),
      `${JSON.stringify({
        type: 'done',
        timestamp: '2026-09-17T00:00:00.000Z',
        data: { task: '1' },
      })}\n`,
      'utf8',
    );

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.equal(report.now.done, 0);
    assert.equal(report.now.pending, 1);
  });
});
