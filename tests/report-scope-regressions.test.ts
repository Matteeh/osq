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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-scope-'));
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
  return { type: 'started', timestamp: ts, data: { task: '1' } };
}

function scopeRegressed(exitCode?: unknown): Record<string, unknown> {
  return {
    type: 'regressed',
    timestamp: ts,
    data: {
      task: '1',
      reason: 'scope_regression',
      ...(exitCode === undefined ? {} : { exitCode }),
    },
  };
}

function archiveRegressed(): Record<string, unknown> {
  return { type: 'regressed', timestamp: ts, data: { task: '1', exitCode: 1 } };
}

function recertification(outcome?: unknown): Record<string, unknown> {
  return {
    type: 'recertification',
    timestamp: ts,
    data: { task: '1', ...(outcome === undefined ? {} : { outcome }) },
  };
}

describe('report scope-regression history', () => {
  it('always exposes the five counters as integers even when no scope events exist', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-plain', [{ events: [started()] }]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.deepEqual(report.history.scopeRegressions, {
      detected: 0,
      verificationPassedAtDetection: 0,
      verificationFailedAtDetection: 0,
      recertifiedByHuman: 0,
      recertifiedAutomatically: 0,
      requeuedForAgent: 0,
    });
    for (const value of Object.values(report.history.scopeRegressions)) {
      assert.ok(Number.isInteger(value), `expected an integer, got ${value}`);
    }
  });

  it('counts detection only for typed scope regressions and classifies finite exit codes', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-detections', [
      {
        events: [
          scopeRegressed(0),
          scopeRegressed(1),
          scopeRegressed(-3),
          scopeRegressed(undefined),
          scopeRegressed('1'),
          scopeRegressed(null),
          archiveRegressed(),
        ],
      },
    ]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    // Six typed scope detections; the archive regression is not scope history.
    assert.equal(report.history.scopeRegressions.detected, 6);
    assert.equal(report.history.scopeRegressions.verificationPassedAtDetection, 1);
    // Finite non-zero exits are 1 and -3; missing/string/null exits are unclassified.
    assert.equal(report.history.scopeRegressions.verificationFailedAtDetection, 2);
  });

  it('classifies only exact recertification outcomes without guessing malformed ones', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-recertified', [
      {
        events: [
          recertification('passed'),
          recertification('passed'),
          recertification('requeued'),
          recertification('PASSED'),
          recertification('passed '),
          recertification(undefined),
          recertification(7),
        ],
      },
    ]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.equal(report.history.scopeRegressions.recertifiedByHuman, 2);
    assert.equal(report.history.scopeRegressions.requeuedForAgent, 1);
  });

  it('aggregates active and archived numbered streams only, never markers, results, or rejected folders', async () => {
    const root = await tempRoot();
    const active = await writeChange(root, '001-active', [
      { events: [scopeRegressed(1), recertification('passed')] },
    ]);
    await writeChange(root, 'archive/010-archived', [
      { events: [scopeRegressed(0), recertification('requeued')] },
    ]);

    // Active marker, retained marker history, and a result must not invent history.
    const runDir = path.join(active, '.run');
    await fs.mkdir(path.join(runDir, 'regressed'), { recursive: true });
    await fs.writeFile(
      path.join(runDir, 'regressed', '1.md'),
      '---\nreason: scope_regression\n---\n- src/a.ts\n',
      'utf8',
    );
    await fs.writeFile(path.join(runDir, 'regressed', '1.1.md'), 'history', 'utf8');
    await fs.mkdir(path.join(runDir, 'results'), { recursive: true });
    await fs.writeFile(path.join(runDir, 'results', '1.md'), 'result', 'utf8');

    // A rejected folder containing its own streams is preserved, not counted.
    await writeChange(root, 'rejected/020-rejected', [
      { events: [scopeRegressed(0), recertification('passed')] },
    ]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.deepEqual(report.history.scopeRegressions, {
      detected: 2,
      verificationPassedAtDetection: 1,
      verificationFailedAtDetection: 1,
      recertifiedByHuman: 1,
      recertifiedAutomatically: 0,
      requeuedForAgent: 1,
    });
  });

  it('does not add attempts, unexplained reruns, dead reasons, or cost coverage', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-attempts', [
      {
        events: [
          started(),
          scopeRegressed(1),
          recertification('requeued'),
          // An eventual agent start after requeue keeps ordinary attempt accounting.
          started(),
        ],
      },
      {
        events: [started(), scopeRegressed(0), recertification('passed')],
      },
    ]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.deepEqual(report.history.attempts.byTask, { '001-attempts/1': 2, '001-attempts/2': 1 });
    assert.deepEqual(report.history.attempts.multipleAttempts, ['001-attempts/1']);
    assert.equal(report.history.unexplainedReruns.total, 0);
    assert.deepEqual(report.history.deadByReason, {});
    assert.equal(report.history.cost.total, 0);
    assert.deepEqual(report.history.cost.coverage, { reportedAttempts: 0, totalAttempts: 3 });
    assert.equal(report.history.verifyRuns.total, 0);
    assert.deepEqual(report.history.scopeRegressions, {
      detected: 2,
      verificationPassedAtDetection: 1,
      verificationFailedAtDetection: 1,
      recertifiedByHuman: 1,
      recertifiedAutomatically: 0,
      requeuedForAgent: 1,
    });
  });

  it('leaves current-state regression counts to markers alone', async () => {
    const root = await tempRoot();
    const folder = await writeChange(root, '001-markers', [
      { events: [scopeRegressed(1), scopeRegressed(0)] },
    ]);
    const runDir = path.join(folder, '.run');
    await fs.mkdir(path.join(runDir, 'regressed'), { recursive: true });
    await fs.writeFile(
      path.join(runDir, 'regressed', '1.md'),
      '---\nreason: scope_regression\n---\n- src/a.ts\n',
      'utf8',
    );

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.equal(report.now.regressed, 1);
    assert.equal(report.history.scopeRegressions.detected, 2);
  });

  it('renders the history block in text and the counters in stable JSON', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-output', [
      { events: [scopeRegressed(2), recertification('passed'), recertification('requeued')] },
    ]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);
    const text = formatMetricsReport(report);
    assert.ok(text.includes('Scope regressions:'));
    assert.ok(text.includes('Detected: 1'));
    assert.ok(text.includes('Verification passed at detection: 0'));
    assert.ok(text.includes('Verification failed at detection: 1'));
    assert.ok(text.includes('Recertified by human: 1'));
    assert.ok(text.includes('Requeued for agent: 1'));

    const raw = await reportCommand({ cwd: root, json: true, stdout: () => {} });
    const parsed = JSON.parse(raw) as {
      history: Record<string, unknown> & {
        scopeRegressions: Record<string, number>;
      };
    };
    assert.deepEqual(Object.keys(parsed.history).sort(), [
      'attempts',
      'cost',
      'deadByReason',
      'preSpawnVerify',
      'rejections',
      'retries',
      'scopeRegressions',
      'sizes',
      'unexplainedReruns',
      'verifyRuns',
    ]);
    assert.deepEqual(parsed.history.scopeRegressions, {
      detected: 1,
      verificationPassedAtDetection: 0,
      verificationFailedAtDetection: 1,
      recertifiedByHuman: 1,
      recertifiedAutomatically: 0,
      requeuedForAgent: 1,
    });
  });
});
