import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { reportCommand } from '../src/cli/report.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
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
  await fs.mkdir(path.join(root, 'openspec', 'changes', 'archive'), { recursive: true });
  return root;
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

function started(sessionId: string, timestamp: string): string {
  return JSON.stringify({
    type: 'plan_started',
    sessionId,
    timestamp,
    data: { harness: 'opencode', model: 'model', osqVersion: '0.0.0', briefHash: 'sha256:x' },
  });
}

function exited(
  sessionId: string,
  timestamp: string,
  usage: Partial<Record<string, number | null>> = {},
): string {
  return JSON.stringify({
    type: 'plan_exited',
    sessionId,
    timestamp,
    data: { exitCode: 0, wallSeconds: 60, usage: { ...nullUsage(), ...usage } },
  });
}

async function changeFolder(root: string, name: string): Promise<string> {
  const folder = path.join(root, 'openspec', 'changes', name);
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  return folder;
}

async function writePlanLog(folder: string, lines: string[]): Promise<void> {
  await fs.mkdir(path.join(folder, '.run'), { recursive: true });
  await fs.writeFile(path.join(folder, '.run', 'plan.jsonl'), `${lines.join('\n')}\n`, 'utf8');
}

describe('report planning unreported tokens', () => {
  it('reports null and not reported when no session reported any token kind', async () => {
    const root = await makeProject();
    const folder = await changeFolder(root, '001-unreported');
    await writePlanLog(folder, [
      started('s1', '2026-01-01T00:00:00.000Z'),
      exited('s1', '2026-01-01T00:05:00.000Z'),
    ]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);
    assert.deepEqual(report.planning.comparison.planning, {
      input: null,
      output: null,
      cached: null,
      reasoning: null,
      cost: null,
    });

    const text = formatMetricsReport(report);
    assert.ok(text.includes('  Input tokens: planning not reported, execution 0'), text);
    assert.ok(text.includes('  Output tokens: planning not reported, execution 0'), text);
    assert.ok(text.includes('  Cached tokens: planning not reported, execution 0'), text);
    assert.ok(text.includes('  Reasoning tokens: planning not reported, execution 0'), text);

    const raw = await reportCommand({
      cwd: root,
      config: DEFAULT_CONFIG,
      json: true,
      stdout: () => {},
    });
    const parsed = JSON.parse(raw) as MetricsReport;
    assert.deepEqual(parsed.planning.comparison.planning, {
      input: null,
      output: null,
      cached: null,
      reasoning: null,
      cost: null,
    });
  });

  it('reports a number only for the token kind a session did report', async () => {
    const root = await makeProject();
    const folder = await changeFolder(root, '001-partial');
    await writePlanLog(folder, [
      started('s1', '2026-01-01T00:00:00.000Z'),
      exited('s1', '2026-01-01T00:05:00.000Z', { inputTokens: 7 }),
    ]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);
    const planning = report.planning.comparison.planning;
    assert.equal(planning.input, 7);
    assert.equal(planning.output, null);
    assert.equal(planning.cached, null);
    assert.equal(planning.reasoning, null);

    const text = formatMetricsReport(report);
    assert.ok(text.includes('  Input tokens: planning 7, execution 0'), text);
    assert.ok(text.includes('  Output tokens: planning not reported, execution 0'), text);
    assert.ok(text.includes('  Cached tokens: planning not reported, execution 0'), text);
    assert.ok(text.includes('  Reasoning tokens: planning not reported, execution 0'), text);
  });
});
