import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  ScriptedAdapter,
  addTask,
  assertOk,
  commitMain,
  createRecoveryProject,
  exists,
} from './recovery-support.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('Red verify at land steered', () => {
  it('merges main, runs only the new task, and lands the change', async () => {
    const project = await createRecoveryProject(tmpDirs, {
      tasks: [{ title: 'First task', scope: 'src/one.txt' }],
      autoRetries: 0,
    });

    assertOk(await project.approve(), 'approve');

    // Task 1 writes `task\n` to `src/one.txt`; task 2 fixes `src/two.txt`.
    const adapter = new ScriptedAdapter((options) =>
      options.taskNumber === '2' ? 'good\n' : 'task\n',
    );

    // Run the watcher until the change archives.
    for (let cycle = 0; cycle < 5 && !(await exists(project.archivedFolder)); cycle += 1) {
      await project.watchOnce(adapter);
    }
    assert.equal(await exists(project.archivedFolder), true);

    // The default branch adds `src/two.txt` holding `bad`, so the archived
    // change's verify exits 1 on the merged tree.
    await commitMain(project.repo, { 'src/two.txt': 'bad\n' });

    // THEN the first land exits 1 and records the sync_verify_red stop.
    const firstLand = await project.land();
    assert.equal(firstLand.exitCode, 1);
    const regressionPath = path.join(project.archivedFolder, '.run', 'regressed', 'change.md');
    assert.match(await fs.readFile(regressionPath, 'utf8'), /reason: sync_verify_red/);

    // A planner adds task 2 in the worktree's archive folder, then a human approves.
    await addTask(project.archivedFolder, 2, { title: 'Fix two', scope: 'src/two.txt' });
    const approval = await project.approve();
    assertOk(approval, 'approve');
    // THEN `osq approve` prints the merge and continuation lines.
    assert.match(approval.stdout, /Merged main into osq\/001-order-flow/);
    assert.match(approval.stdout, /Continues from task 2/);

    // The next watch spawns only task 2.
    const before = adapter.calls.length;
    await project.watchOnce(adapter);
    const spawned = adapter.calls.slice(before).map((call) => call.taskNumber);
    assert.deepEqual(spawned, ['2']);

    // THEN the last land exits 0 with task 2's `src/two.txt` in the checkout.
    assertOk(await project.land(), 'land');
    assert.equal(await fs.readFile(path.join(project.repo, 'src', 'two.txt'), 'utf8'), 'good\n');
  });
});
