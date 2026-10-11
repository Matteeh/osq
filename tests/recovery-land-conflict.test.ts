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
  reviseTask,
} from './recovery-support.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('Conflict at land steered', () => {
  it('restarts the archived change from main, reruns the task, archives, and lands it', async () => {
    const project = await createRecoveryProject(tmpDirs, {
      tasks: [{ title: 'First task', scope: 'src/one.txt' }],
      autoRetries: 0,
    });

    assertOk(await project.approve(), 'approve');

    // The first spawn writes `task\n`; after the restart the branch is cut from
    // main, which already holds `main\n`, so the rerun writes `main\ntask\n`.
    const adapter = new ScriptedAdapter((_options, call) =>
      call === 1 ? 'task\n' : 'main\ntask\n',
    );

    // Run the watcher until the change archives.
    for (let cycle = 0; cycle < 5 && !(await exists(project.archivedFolder)); cycle += 1) {
      await project.watchOnce(adapter);
    }
    assert.equal(await exists(project.archivedFolder), true);
    assert.equal(adapter.calls.length, 1);

    // The default branch now changes the same line of `src/one.txt` the
    // archived change wrote, so the land's sync conflicts.
    await commitMain(project.repo, { 'src/one.txt': 'main\n' });

    // THEN the first land exits 1, recording the conflict stop on the branch.
    const firstLand = await project.land();
    assert.equal(firstLand.exitCode, 1);
    const regressionPath = path.join(project.archivedFolder, '.run', 'regressed', 'change.md');
    assert.equal(await exists(regressionPath), true);
    assert.match(await fs.readFile(regressionPath, 'utf8'), /reason: sync_conflict/);

    // THEN the second land exits non-zero without landing: the change needs
    // steering, and the checkout still holds main's copy.
    const secondLand = await project.land();
    assert.notEqual(secondLand.exitCode, 0);
    assert.equal(await fs.readFile(path.join(project.repo, 'src', 'one.txt'), 'utf8'), 'main\n');

    // A planner edits `tasks/1.md` in the worktree's archive folder, then a
    // human approves.
    await reviseTask(project.archivedFolder, 1, { title: 'First task', scope: 'src/one.txt' });
    const approval = await project.approve();
    assertOk(approval, 'approve');
    // THEN `osq approve` prints the restart line.
    assert.match(approval.stdout, /Restarted from main/);

    // The next watch spawns once more and archives the restarted change.
    await project.watchOnce(adapter);
    // THEN the executor spawned once more.
    assert.equal(adapter.calls.length, 2);
    assert.equal(await exists(path.join(project.archivedFolder, '.run', 'done', '1')), true);

    // THEN the last land exits 0 with the restarted attempt's `src/one.txt`.
    assertOk(await project.land(), 'land');
    assert.equal(
      await fs.readFile(path.join(project.repo, 'src', 'one.txt'), 'utf8'),
      'main\ntask\n',
    );
  });
});
