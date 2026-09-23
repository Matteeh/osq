import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { getWebGraph } from '../src/core/web/web-data.js';
import { buildWebFixture, writeRunningLock } from './fixtures/web/build.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-web-progress-'));
  await buildWebFixture(tmpDir);
  await writeRunningLock(tmpDir, Date.now() - 9000);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('web graph change task progress', () => {
  it('counts done markers next to the task count on every change node', async () => {
    const graph = await getWebGraph(tmpDir, DEFAULT_CONFIG);
    for (const node of graph.changes) {
      assert.ok(node.doneCount !== undefined);
      assert.ok(node.doneCount <= node.taskCount);
    }

    const active = graph.changes.find((node) => node.folderKey === '010-active-change');
    assert.ok(active);
    assert.equal(active.taskCount, 3);
    assert.equal(active.doneCount, 1);

    const rejected = graph.changes.find((node) => node.folderKey === '002-rejected-change');
    assert.ok(rejected);
    assert.equal(rejected.doneCount, 0);
  });

  it('counts every task of an archived change with all done markers', async () => {
    const graph = await getWebGraph(tmpDir, DEFAULT_CONFIG);
    const archived = graph.changes.find((node) => node.folderKey === '002-archived-change');
    assert.ok(archived);
    assert.equal(archived.taskCount, 1);
    assert.equal(archived.doneCount, 1);
  });

  it('reports zero for an archived change without done markers', async () => {
    const graph = await getWebGraph(tmpDir, DEFAULT_CONFIG);
    const unique = graph.changes.find((node) => node.folderKey === '003-archived-unique');
    assert.ok(unique);
    assert.equal(unique.taskCount, 1);
    assert.equal(unique.doneCount, 0);
  });
});
