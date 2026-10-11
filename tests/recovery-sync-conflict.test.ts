import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  ScriptedAdapter,
  assertOk,
  commitMain,
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

describe('Sync conflict restarted from the default branch', () => {
  it('restarts the change from main, reruns the task, archives, and lands it', async () => {
    const project = await createRecoveryProject(tmpDirs, {
      tasks: [{ title: 'First task', scope: 'src/one.txt' }],
      autoRetries: 0,
    });

    assertOk(await project.approve(), 'approve');

    // The first spawn moves the default branch onto the same file the task
    // writes, so the sync before archive conflicts. Later spawns run after the
    // restart, on a branch cut from the default branch's tip.
    const adapter = new ScriptedAdapter(async (_options, call) => {
      if (call === 1) {
        await commitMain(project.repo, { 'src/one.txt': 'main\n' });
        return 'task\n';
      }
      return 'main\ntask\n';
    });

    await project.watchOnce(adapter);
    // THEN the one task spawned once.
    assert.equal(adapter.calls.length, 1);
    // THEN `.run/regressed/change.md` had reason `sync_conflict`.
    const regressionPath = path.join(project.changeFolder, '.run', 'regressed', 'change.md');
    assert.equal(await exists(regressionPath), true);
    assert.match(await fs.readFile(regressionPath, 'utf8'), /reason: sync_conflict/);

    // THEN a second `osq watch --once` spawns nothing: the change needs
    // steering, so the watcher leaves it alone.
    await project.watchOnce(adapter);
    assert.equal(adapter.calls.length, 1);

    // A planner edits `tasks/1.md` in the worktree, then a human approves.
    await reviseTask(project.changeFolder, 1, { title: 'First task', scope: 'src/one.txt' });
    const approval = await project.approve();
    assertOk(approval, 'approve');
    // THEN `osq approve` prints the restart and continuation lines.
    assert.match(
      approval.stdout,
      /Restarted from main; kept the old branch as osq\/001-order-flow-restarted-1/,
    );
    assert.match(approval.stdout, /Continues from task 1/);

    // The next watch spawns once more and archives the restarted change.
    await project.watchOnce(adapter);
    // THEN the executor spawned once more.
    assert.equal(adapter.calls.length, 2);
    // THEN `.run/done/1` is in the archived folder.
    assert.equal(await exists(path.join(project.archivedFolder, '.run', 'done', '1')), true);

    // THEN `osq land` exits 0 with the restarted attempt's `src/one.txt`.
    assertOk(await project.land(), 'land');
    assert.equal(
      await fs.readFile(path.join(project.repo, 'src', 'one.txt'), 'utf8'),
      'main\ntask\n',
    );
    assert.equal(await git(['status', '--porcelain'], project.repo), '');
  });
});
