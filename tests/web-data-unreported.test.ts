import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { getWebChange, getWebGraph } from '../src/core/web/web-data.js';

let tmpDir: string;

async function write(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

function proposal(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads:',
    '    []',
    '---',
    '## Goal',
    '',
    `${title} goal text.`,
    '',
  ].join('\n');
}

function task(title: string, scopeFile: string): string {
  return [
    '---',
    `title: ${title}`,
    'verify: node verify.cjs',
    'scope:',
    `  - ${scopeFile}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '',
    `- [ ] ${title} criterion`,
    '',
  ].join('\n');
}

function jsonl(events: Record<string, unknown>[]): string {
  return `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
}

function planLog(usage: Record<string, unknown>): string {
  return [
    JSON.stringify({
      type: 'plan_started',
      sessionId: 's1',
      timestamp: '2026-01-01T00:00:00.000Z',
      data: {
        harness: 'opencode',
        model: 'big-pickle',
        osqVersion: '0.0.0',
        briefHash: 'sha256:x',
      },
    }),
    JSON.stringify({
      type: 'plan_exited',
      sessionId: 's1',
      timestamp: '2026-01-01T00:01:00.000Z',
      data: { exitCode: 0, wallSeconds: 60, usage },
    }),
  ].join('\n');
}

/** A change whose one attempt and one planning session report no cost. */
async function buildUnreported(root: string): Promise<void> {
  const dir = 'openspec/changes/201-unreported-change';
  await write(root, `${dir}/proposal.md`, proposal('Unreported Change'));
  await write(root, `${dir}/tasks/1.md`, task('Silent task', 'src/a.ts'));
  await write(
    root,
    `${dir}/.run/events/1.jsonl`,
    jsonl([
      {
        type: 'started',
        timestamp: '2026-01-02T00:00:00.000Z',
        data: { harness: 'opencode', model: 'big-pickle', attempt: 1 },
      },
      { type: 'done', timestamp: '2026-01-02T00:00:10.000Z', data: {} },
    ]),
  );
  await write(root, `${dir}/.run/plan.jsonl`, planLog({}));
}

/** A change whose first attempt reports cost and whose second does not. */
async function buildPartial(root: string): Promise<void> {
  const dir = 'openspec/changes/202-partial-change';
  await write(root, `${dir}/proposal.md`, proposal('Partial Change'));
  await write(root, `${dir}/tasks/1.md`, task('Reporting task', 'src/b.ts'));
  await write(root, `${dir}/tasks/2.md`, task('Silent task', 'src/c.ts'));
  await write(
    root,
    `${dir}/.run/events/1.jsonl`,
    jsonl([
      {
        type: 'started',
        timestamp: '2026-01-03T00:00:00.000Z',
        data: { harness: 'opencode', model: 'big-pickle', attempt: 1 },
      },
      { type: 'done', timestamp: '2026-01-03T00:00:10.000Z', data: { cost: 0.5 } },
    ]),
  );
  await write(
    root,
    `${dir}/.run/events/2.jsonl`,
    jsonl([
      {
        type: 'started',
        timestamp: '2026-01-04T00:00:00.000Z',
        data: { harness: 'codex', model: 'gpt-5', attempt: 1 },
      },
    ]),
  );
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-web-unreported-'));
  await buildUnreported(tmpDir);
  await buildPartial(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('web cost with no reported value', () => {
  it('keeps an unreported cost null with zero coverage in the graph', async () => {
    const graph = await getWebGraph(tmpDir, DEFAULT_CONFIG);
    const unreported = graph.changes.find((node) => node.folderKey === '201-unreported-change');
    const partial = graph.changes.find((node) => node.folderKey === '202-partial-change');
    assert.ok(unreported && partial);

    // Attempts and a session exist, yet nothing reported a cost.
    assert.equal(unreported.attempts, 1);
    assert.equal(unreported.execution.cost, null);
    assert.deepEqual(unreported.execution.costCoverage, { reported: 0, total: 1 });
    assert.equal(unreported.planning.cost, null);
    assert.deepEqual(unreported.planning.costCoverage, { reported: 0, total: 1 });

    // A partially reported cost keeps its sum and exact coverage.
    assert.equal(partial.attempts, 2);
    assert.equal(partial.execution.cost, 0.5);
    assert.deepEqual(partial.execution.costCoverage, { reported: 1, total: 2 });
  });

  it('keeps an unreported task cost null and a partially reported one summed', async () => {
    const unreported = await getWebChange(tmpDir, '201', DEFAULT_CONFIG);
    assert.equal(unreported.tasks.length, 1);
    assert.equal(unreported.tasks[0].attempts, 1);
    assert.equal(unreported.tasks[0].cost, null);
    assert.deepEqual(unreported.tasks[0].costCoverage, { reported: 0, total: 1 });

    const partial = await getWebChange(tmpDir, '202', DEFAULT_CONFIG);
    assert.equal(partial.tasks.length, 2);
    assert.equal(partial.tasks[0].cost, 0.5);
    assert.deepEqual(partial.tasks[0].costCoverage, { reported: 1, total: 1 });
    assert.equal(partial.tasks[1].cost, null);
    assert.deepEqual(partial.tasks[1].costCoverage, { reported: 0, total: 1 });
  });
});
