import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { reportCommand } from '../src/cli/report.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { formatMetricsReport, getMetricsReport } from '../src/core/report/report.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-retries-'));
  tmpDirs.push(root);
  await fs.mkdir(path.join(root, 'openspec', 'changes'), { recursive: true });
  return root;
}

interface TaskFixture {
  readonly events?: Record<string, unknown>[];
}

/** One change folder with numbered task files and optional numbered event streams. */
async function writeChange(
  root: string,
  folder: string,
  tasks: readonly TaskFixture[],
): Promise<string> {
  const folderPath = path.join(root, 'openspec', 'changes', folder);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(folderPath, 'proposal.md'),
    `---\ntitle: ${folder}\nfeatures:\n  reads: []\n---\n## Goal\n\nFixture change.\n`,
    'utf8',
  );
  for (let i = 0; i < tasks.length; i++) {
    const taskNumber = String(i + 1);
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${taskNumber}.md`),
      `---\ntitle: Task ${taskNumber}\nverify: node -e "process.exit(0)"\nscope: []\nentry: []\nskills: []\n---\n## Acceptance\n- [ ] x\n`,
      'utf8',
    );
    const task = tasks[i];
    if (!task.events) continue;
    const eventsDir = path.join(folderPath, '.run', 'events');
    await fs.mkdir(eventsDir, { recursive: true });
    const content = `${task.events.map((event) => JSON.stringify(event)).join('\n')}\n`;
    await fs.writeFile(path.join(eventsDir, `${taskNumber}.jsonl`), content, 'utf8');
  }
  return folderPath;
}

const ts = '2026-09-18T00:00:00.000Z';

function started(): Record<string, unknown> {
  return { type: 'started', timestamp: ts, data: { task: '1', attempt: 1 } };
}

function retry(automatic: boolean): Record<string, unknown> {
  return {
    type: 'retry',
    timestamp: ts,
    data: {
      target: '1',
      reason: 'verify_red',
      attempt: 2,
      ...(automatic ? { automatic: true } : {}),
    },
  };
}

function done(): Record<string, unknown> {
  return { type: 'done', timestamp: ts, data: { task: '1' } };
}

function dead(): Record<string, unknown> {
  return { type: 'dead', timestamp: ts, data: { task: '1', reason: 'verify_red' } };
}

function stuck(): Record<string, unknown> {
  return { type: 'stuck', timestamp: ts, data: { task: '1', fingerprint: 'sha256:abc' } };
}

function cost(value: number): Record<string, unknown> {
  return {
    type: 'tokens',
    timestamp: ts,
    data: { promptTokens: 1, candidateTokens: 1, cost: value },
  };
}

describe('report retry history', () => {
  it('splits automatic and manual retries, tracks done and cost, and counts stuck events', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-retries', [
      {
        // A pre-retry cost is outside every retry-opened attempt.
        events: [started(), cost(5), retry(true), started(), cost(0.1), done()],
      },
      { events: [started(), retry(false), started(), dead(), stuck()] },
      { events: [started(), done()] },
    ]);
    await writeChange(root, '002-plain', [{ events: [started(), done(), cost(2)] }]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.deepEqual(report.history.retries.automatic, {
      count: 1,
      reachedDone: 1,
      cost: 0.1,
      costReportedAttempts: 1,
    });
    assert.deepEqual(report.history.retries.manual, {
      count: 1,
      reachedDone: 0,
      cost: 0,
      costReportedAttempts: 0,
    });
    assert.equal(report.history.retries.stuck, 1);

    const text = formatMetricsReport(report);
    assert.ok(text.includes('Automatic retries:'), text);
    assert.ok(
      text.includes(
        '  automatic: 1 retries, 1 reached done, cost $0.10 (1 of 1 attempts reported cost)',
      ),
      text,
    );
    assert.ok(
      text.includes(
        '  manual: 1 retries, 0 reached done, cost not reported (0 of 1 attempts reported cost)',
      ),
      text,
    );
    assert.ok(text.includes('  Stuck: 1'), text);
    assert.ok(
      text.indexOf('Automatic retries:') > text.indexOf('Verification runs missing exit code:'),
      text,
    );

    const raw = await reportCommand({ cwd: root, json: true, stdout: () => {} });
    const parsed = JSON.parse(raw) as {
      history: { retries: typeof report.history.retries };
    };
    assert.deepEqual(parsed.history.retries, report.history.retries);
  });

  it('reports zero counts and not reported costs when no stream holds a retry', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-plain', [{ events: [started(), done(), cost(1)] }]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.deepEqual(report.history.retries, {
      automatic: { count: 0, reachedDone: 0, cost: 0, costReportedAttempts: 0 },
      manual: { count: 0, reachedDone: 0, cost: 0, costReportedAttempts: 0 },
      stuck: 0,
    });

    const text = formatMetricsReport(report);
    assert.ok(text.includes('Automatic retries:'), text);
    assert.ok(
      text.includes(
        '  automatic: 0 retries, 0 reached done, cost not reported (0 of 0 attempts reported cost)',
      ),
      text,
    );
    assert.ok(
      text.includes(
        '  manual: 0 retries, 0 reached done, cost not reported (0 of 0 attempts reported cost)',
      ),
      text,
    );
    assert.ok(text.includes('  Stuck: 0'), text);
  });
});
