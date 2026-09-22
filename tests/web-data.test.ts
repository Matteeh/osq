import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { WebDataError, getWebChange, getWebGraph } from '../src/core/web-data.js';
import { buildWebFixture, writeRunningLock } from './fixtures/web/build.js';

let tmpDir: string;
let now: Date;
let nowMs: number;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-web-data-'));
  now = new Date('2026-06-01T00:00:00.000Z');
  nowMs = now.getTime();
  await buildWebFixture(tmpDir);
  await writeRunningLock(tmpDir, nowMs - 9000);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('web data graph nodes', () => {
  it('reads current capabilities plus active, archived, and rejected changes deterministically', async () => {
    const graph = await getWebGraph(tmpDir, DEFAULT_CONFIG);

    assert.deepEqual(
      graph.capabilities.map((node) => node.id),
      ['alpha', 'beta'],
    );
    assert.ok(graph.capabilities[0].spec.includes('alpha capability purpose text.'));
    assert.deepEqual(
      graph.changes.map((node) => node.folderKey),
      ['002-archived-change', '002-rejected-change', '003-archived-unique', '010-active-change'],
    );

    // The same files always produce the identical document.
    assert.deepEqual(await getWebGraph(tmpDir, DEFAULT_CONFIG), graph);
  });

  it('carries recorded lifecycle metadata and separate observed summaries', async () => {
    const graph = await getWebGraph(tmpDir, DEFAULT_CONFIG);
    const active = graph.changes.find((node) => node.folderKey === '010-active-change');
    assert.ok(active);

    assert.equal(active.state, 'active');
    assert.equal(active.id, 10);
    assert.equal(active.slug, 'active-change');
    assert.equal(active.title, 'Active Change');
    assert.equal(active.created, '2026-01-01T00:00:00.000Z');
    assert.equal(active.approved, '2026-01-02T00:00:00.000Z');
    assert.equal(active.landed, null);
    assert.equal(active.rejection, null);
    assert.equal(active.planner, 'opencode/big-pickle');
    assert.equal(active.taskCount, 3);
    assert.equal(active.attempts, 3);

    assert.equal(active.execution.cost, 0.5);
    assert.deepEqual(active.execution.costCoverage, { reported: 1, total: 3 });
    assert.deepEqual(active.execution.durations, [10]);
    assert.deepEqual(active.execution.firstAttemptPass, { reported: 1, total: 3 });
    assert.deepEqual(active.execution.tokens, [
      {
        harness: 'opencode',
        model: 'big-pickle',
        input: 100,
        cachedInput: 40,
        output: 20,
        reasoning: 0,
        total: 160,
      },
    ]);

    assert.equal(active.planning.cost, 0.25);
    assert.deepEqual(active.planning.costCoverage, { reported: 1, total: 2 });
    assert.deepEqual(active.planning.durations, [60]);
    assert.deepEqual(active.planning.tokens, [
      {
        harness: 'opencode',
        model: 'big-pickle',
        input: 50,
        cachedInput: 5,
        output: 10,
        reasoning: 0,
        total: 60,
      },
    ]);
  });

  it('keeps archived and rejected evidence separate and never estimates planning', async () => {
    const graph = await getWebGraph(tmpDir, DEFAULT_CONFIG);
    const archived = graph.changes.find((node) => node.folderKey === '002-archived-change');
    const rejected = graph.changes.find((node) => node.folderKey === '002-rejected-change');
    const unique = graph.changes.find((node) => node.folderKey === '003-archived-unique');
    assert.ok(archived && rejected && unique);

    // Malformed optional manifest degrades to null without hiding the archive.
    assert.equal(archived.created, null);
    assert.equal(archived.approved, null);
    assert.equal(archived.planner, null);
    assert.equal(archived.landed, '2026-02-01T00:00:00.000Z');
    assert.equal(archived.planning.cost, null);
    assert.equal(archived.execution.cost, 1.5);
    assert.equal(unique.planning.cost, null);

    assert.equal(rejected.state, 'rejected');
    assert.deepEqual(rejected.rejection, {
      reason: 'superseded',
      timestamp: '2026-03-01T00:00:00.000Z',
    });
    assert.equal(rejected.execution.cost, null);
  });

  it('emits one deterministic edge per declared relationship', async () => {
    const graph = await getWebGraph(tmpDir, DEFAULT_CONFIG);
    assert.deepEqual(
      graph.edges.map((edge) => edge.key),
      [
        'depends_on:010-active-change->003-archived-unique',
        'reads:010-active-change->alpha',
        'writes:003-archived-unique->alpha',
        'writes:010-active-change->alpha',
        'writes:010-active-change->beta',
      ],
    );
    assert.equal(new Set(graph.edges.map((edge) => edge.key)).size, graph.edges.length);
    assert.equal(graph.edges.filter((edge) => edge.kind === 'writes').length, 3);
    // Duplicate `depends_on` declarations collapse to one edge.
    assert.equal(graph.edges.filter((edge) => edge.kind === 'depends_on').length, 1);
  });
});

describe('web data change detail', () => {
  it('resolves a numeric id and exposes task evidence without inference', async () => {
    const change = await getWebChange(tmpDir, '010', DEFAULT_CONFIG, now);

    assert.equal(change.folderKey, '010-active-change');
    assert.equal(change.state, 'active');
    assert.equal(change.location, 'active');
    assert.equal(change.planner, 'opencode/big-pickle');
    assert.ok(change.brief?.includes('Brief body for active change.'));
    assert.equal(change.goal, 'Active Change goal text.');
    assert.deepEqual(change.dependsOn, ['003', '003']);
    assert.deepEqual(change.reads, ['alpha']);
    assert.deepEqual(change.writes, ['alpha', 'beta']);
    assert.equal(change.asOf, now.toISOString());
    assert.equal(change.tasks.length, 3);

    const [first, running, regressed] = change.tasks;
    assert.equal(first.state, 'done');
    assert.equal(first.verify, 'node verify.cjs');
    assert.deepEqual(first.acceptance, ['First task criterion']);
    assert.deepEqual(first.declaredScope, ['src/a.ts']);
    assert.equal(first.attempts, 1);
    assert.equal(first.reason, null);
    assert.equal(first.duration, 10);
    assert.equal(first.cost, 0.5);
    assert.deepEqual(first.costCoverage, { reported: 1, total: 1 });
    assert.deepEqual(first.resolvedScope, [
      { relativePath: 'src/a.ts', absolutePath: path.join(tmpDir, 'src/a.ts') },
    ]);
    assert.equal(first.result, 'Task one result text.');
    assert.equal(first.recertifications.length, 1);
    assert.equal(first.recertifications[0].actor, 'human');
    assert.equal(first.recertifications[0].outcome, 'passed');
    assert.deepEqual(first.recertifications[0].attribution, [
      { path: 'src/a.ts (modified)', attribution: 'ambiguous' },
    ]);

    assert.equal(running.state, 'running');
    assert.equal(running.runningStart, new Date(nowMs - 9000).toISOString());
    assert.equal(running.runningElapsedSeconds, 9);
    assert.equal(running.result, null);

    assert.equal(regressed.state, 'regressed');
    assert.equal(regressed.reason, 'scope_regression');
    assert.equal(regressed.recertifications[0].outcome, 'requeued');
    assert.deepEqual(regressed.resolvedScope, [{ relativePath: 'src/c.ts', absolutePath: null }]);
  });

  it('distinguishes ambiguous and absent selectors and resolves exact keys', async () => {
    await assert.rejects(
      () => getWebChange(tmpDir, '002', DEFAULT_CONFIG, now),
      (error: unknown) => error instanceof WebDataError && error.kind === 'ambiguous',
    );
    await assert.rejects(
      () => getWebChange(tmpDir, '999', DEFAULT_CONFIG, now),
      (error: unknown) => error instanceof WebDataError && error.kind === 'not-found',
    );

    const rejected = await getWebChange(tmpDir, '002-rejected-change', DEFAULT_CONFIG, now);
    assert.equal(rejected.state, 'rejected');
    assert.deepEqual(rejected.rejection, {
      reason: 'superseded',
      timestamp: '2026-03-01T00:00:00.000Z',
    });
    assert.equal(rejected.brief, null);
    assert.equal(rejected.tasks[0].state, 'pending');

    const archived = await getWebChange(tmpDir, '003', DEFAULT_CONFIG, now);
    assert.equal(archived.folderKey, '003-archived-unique');
    assert.equal(archived.state, 'archived');
  });

  it('ignores malformed optional lines and missing history without dropping evidence', async () => {
    const archived = await getWebChange(tmpDir, '002-archived-change', DEFAULT_CONFIG, now);
    // The malformed event line does not hide the sibling started/done evidence.
    assert.equal(archived.tasks[0].state, 'done');
    assert.equal(archived.tasks[0].attempts, 1);
    assert.equal(archived.tasks[0].cost, 1.5);
    assert.equal(archived.tasks[0].duration, null);

    const unique = await getWebChange(tmpDir, '003', DEFAULT_CONFIG, now);
    assert.equal(unique.brief, null);
    assert.equal(unique.planner, null);
  });
});
