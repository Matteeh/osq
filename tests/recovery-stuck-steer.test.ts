import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  ScriptedAdapter,
  assertOk,
  createRecoveryProject,
  exists,
  git,
  reviseTask,
} from './recovery-support.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('Stuck task steered', () => {
  it('reruns the revised task, archives the change, and lands it', async () => {
    const project = await createRecoveryProject(tmpDirs, {
      tasks: [{ title: 'First task', scope: 'src/one.txt' }],
      autoRetries: 1,
    });

    assertOk(await project.approve(), 'approve');

    // The adapter keeps writing `bad` until the test revises the plan, so the
    // task's verify stays red and each attempt dies with the same output.
    let revised = false;
    const adapter = new ScriptedAdapter(() => (revised ? 'good\n' : 'bad\n'));

    // With `autoRetries` 1 the task dies, is retried automatically, and dies
    // again with the same output, which the watcher marks stuck.
    await project.watchOnce(adapter);
    // THEN the executor spawned twice.
    assert.equal(adapter.calls.length, 2);
    const deadPath = path.join(project.changeFolder, '.run', 'dead', '1.md');
    // THEN the second dead marker has `stuck: true`.
    assert.equal(await exists(deadPath), true);
    assert.match(await fs.readFile(deadPath, 'utf8'), /stuck: true/);

    // THEN another `osq watch --once` spawns nothing before approval.
    await project.watchOnce(adapter);
    assert.equal(adapter.calls.length, 2);

    // A planner edits `tasks/1.md` in the worktree, then a human approves.
    revised = true;
    await reviseTask(project.changeFolder, 1, { title: 'First task', scope: 'src/one.txt' });
    const approval = await project.approve();
    assertOk(approval, 'approve');
    // THEN `osq approve` prints `Continues from task 1`.
    assert.match(approval.stdout, /Continues from task 1/);

    // The next watch spawns a third time and archives the change.
    await project.watchOnce(adapter);
    // THEN the executor spawned a third time.
    assert.equal(adapter.calls.length, 3);
    // THEN `.run/done/1` is in the archived folder.
    assert.equal(await exists(path.join(project.archivedFolder, '.run', 'done', '1')), true);

    // THEN `osq land` exits 0 with the third attempt's `src/one.txt`.
    assertOk(await project.land(), 'land');
    assert.equal(await fs.readFile(path.join(project.repo, 'src', 'one.txt'), 'utf8'), 'good\n');
    assert.equal(await git(['status', '--porcelain'], project.repo), '');
  });
});
