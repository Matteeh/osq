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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-auto-recert-'));
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

function recertification(outcome: unknown, automatic?: unknown): Record<string, unknown> {
  return {
    type: 'recertification',
    timestamp: ts,
    data: {
      task: '1',
      ...(outcome === undefined ? {} : { outcome }),
      ...(automatic === undefined ? {} : { automatic }),
    },
  };
}

function dead(reason: unknown): Record<string, unknown> {
  return { type: 'dead', timestamp: ts, data: { task: '1', reason } };
}

async function readJson(root: string): Promise<Record<string, unknown>> {
  const raw = await reportCommand({ cwd: root, json: true, stdout: () => {} });
  return JSON.parse(raw) as Record<string, unknown>;
}

describe('report automatic and human recertifications', () => {
  it('counts a passed automatic recertification apart from a human one in history, text, and JSON', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-recertified', [
      { events: [recertification('passed', true)] },
      { events: [recertification('passed')] },
    ]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);
    assert.equal(report.history.scopeRegressions.recertifiedAutomatically, 1);
    assert.equal(report.history.scopeRegressions.recertifiedByHuman, 1);

    const text = formatMetricsReport(report);
    assert.ok(text.includes('Recertified by human: 1'), text);
    assert.ok(text.includes('Recertified automatically: 1'), text);
    assert.ok(
      text.indexOf('Recertified automatically: 1') > text.indexOf('Recertified by human: 1'),
      text,
    );

    const parsed = await readJson(root);
    const scope = (parsed.history as Record<string, Record<string, number>>).scopeRegressions;
    assert.equal(scope.recertifiedAutomatically, 1);
    assert.equal(scope.recertifiedByHuman, 1);
  });

  it('keeps an automatic recertification out of the human counter and vice versa', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-only-automatic', [
      { events: [recertification('passed', true), recertification('passed', false)] },
    ]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);
    // `automatic: false` is not the automatic flag, so it counts as a human pass.
    assert.equal(report.history.scopeRegressions.recertifiedAutomatically, 1);
    assert.equal(report.history.scopeRegressions.recertifiedByHuman, 1);

    const parsed = await readJson(root);
    const scope = (parsed.history as Record<string, Record<string, number>>).scopeRegressions;
    assert.equal(scope.recertifiedAutomatically, 1);
    assert.equal(scope.recertifiedByHuman, 1);
  });
});

describe('report with no scope regression history', () => {
  it('exposes all six scope regression counters as zero in history, text, and JSON', async () => {
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

    const text = formatMetricsReport(report);
    for (const line of [
      'Detected: 0',
      'Verification passed at detection: 0',
      'Verification failed at detection: 0',
      'Recertified by human: 0',
      'Recertified automatically: 0',
      'Requeued for agent: 0',
    ]) {
      assert.ok(text.includes(line), `expected text to include ${line}`);
    }

    const parsed = await readJson(root);
    const scope = (parsed.history as Record<string, Record<string, number>>).scopeRegressions;
    assert.deepEqual(scope, {
      detected: 0,
      verificationPassedAtDetection: 0,
      verificationFailedAtDetection: 0,
      recertifiedByHuman: 0,
      recertifiedAutomatically: 0,
      requeuedForAgent: 0,
    });
  });
});

describe('report blocked deaths', () => {
  it('counts a blocked dead event by reason in history, text, and JSON', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-blocked', [{ events: [dead('blocked'), dead('verify_red')] }]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);
    assert.deepEqual(report.history.deadByReason, { blocked: 1, verify_red: 1 });
    assert.equal(report.history.attempts.total, 0);

    const text = formatMetricsReport(report);
    assert.ok(text.includes('blocked: 1'), text);
    assert.ok(text.includes('verify_red: 1'), text);

    const parsed = await readJson(root);
    assert.deepEqual((parsed.history as Record<string, unknown>).deadByReason, {
      blocked: 1,
      verify_red: 1,
    });
  });
});
