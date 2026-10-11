import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  ScriptedAdapter,
  addTask,
  assertOk,
  createRecoveryProject,
  exists,
  git,
} from './recovery-support.js';

/**
 * Proven end to end in a temporary git repository with a fake executor, from the
 * halt a run produces to `osq land <id>` exiting 0: a change halted by a red
 * check at archive is steered with a new task and lands, and a change halted by
 * a dirty worktree needs no steering, so `osq approve` refuses and
 * `osq retry <id> change` clears it before the run continues.
 */

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('Failed check at archive steered', () => {
  it('reruns only the added task, archives the change, and lands it', async () => {
    const project = await createRecoveryProject(tmpDirs, {
      tasks: [{ title: 'First task', scope: 'src/one.txt' }],
      autoRetries: 0,
      check: 'node check.cjs',
      files: {
        'check.cjs': [
          "const fs = require('node:fs');",
          "process.exit(fs.existsSync('src/two.txt') ? 0 : 1);",
          '',
        ].join('\n'),
      },
    });

    assertOk(await project.approve(), 'approve');

    const adapter = new ScriptedAdapter();

    // Task 1 passes its verify, but the check at archive exits 1 because
    // `src/two.txt` is missing, so the change records a `verify_red` change
    // regression and halts.
    await project.watchOnce(adapter);
    assert.equal(adapter.calls.length, 1);
    const regressionPath = path.join(project.changeFolder, '.run', 'regressed', 'change.md');
    assert.equal(await exists(regressionPath), true);
    assert.match(await fs.readFile(regressionPath, 'utf8'), /reason: verify_red/);

    // THEN a second `osq watch --once` spawns nothing: the change needs steering.
    await project.watchOnce(adapter);
    assert.equal(adapter.calls.length, 1);

    // A planner adds task 2 in the worktree, then a human approves.
    await addTask(project.changeFolder, 2, { title: 'Add two', scope: 'src/two.txt' });
    const approval = await project.approve();
    assertOk(approval, 'approve');
    // THEN `osq approve` prints `Continues from task 2`.
    assert.match(approval.stdout, /Continues from task 2/);

    // The next watch spawns only task 2: task 1 does not run again.
    await project.watchOnce(adapter);
    assert.deepEqual(
      adapter.calls.map((call) => call.taskNumber),
      ['1', '2'],
    );
    // THEN `.run/done/2` is in the archived folder.
    assert.equal(await exists(path.join(project.archivedFolder, '.run', 'done', '2')), true);

    // THEN `osq land` exits 0 and `src/two.txt` exists in the checkout.
    assertOk(await project.land(), 'land');
    assert.equal(await exists(path.join(project.repo, 'src', 'two.txt')), true);
    assert.equal(await git(['status', '--porcelain'], project.repo), '');
  });
});

describe('Halt that needs no steering', () => {
  it('refuses approve, clears the halt with retry, runs the task, and lands it', async () => {
    const project = await createRecoveryProject(tmpDirs, {
      tasks: [{ title: 'First task', scope: 'src/one.txt' }],
      autoRetries: 0,
    });

    assertOk(await project.approve(), 'approve');

    // An untracked file at the worktree root makes the worktree dirty, which is
    // a change regression that needs no steering.
    await fs.writeFile(path.join(project.worktree, 'notes.txt'), 'notes\n', 'utf8');

    const adapter = new ScriptedAdapter();

    // THEN the watcher halts the change with `worktree_dirty` and spawns nothing.
    await project.watchOnce(adapter);
    assert.equal(adapter.calls.length, 0);
    const regressionPath = path.join(project.changeFolder, '.run', 'regressed', 'change.md');
    assert.equal(await exists(regressionPath), true);
    assert.match(await fs.readFile(regressionPath, 'utf8'), /reason: worktree_dirty/);

    // THEN `osq approve` exits 1 naming `osq retry 001 change` and writes
    // nothing: the worktree's HEAD and status are untouched.
    const headBefore = await git(['rev-parse', 'HEAD'], project.worktree);
    const statusBefore = await git(['status', '--porcelain'], project.worktree);
    const refusal = await project.approve();
    assert.equal(refusal.exitCode, 1);
    assert.match(refusal.stderr, /osq retry 001 change/);
    assert.equal(await git(['rev-parse', 'HEAD'], project.worktree), headBefore);
    assert.equal(await git(['status', '--porcelain'], project.worktree), statusBefore);

    // After removing the file, `osq retry 001 change` clears the halt and the
    // next watch spawns task 1.
    await fs.rm(path.join(project.worktree, 'notes.txt'), { force: true });
    assertOk(await project.retry('change'), 'retry');
    await project.watchOnce(adapter);
    assert.equal(adapter.calls.length, 1);
    assert.equal(adapter.calls[0]?.taskNumber, '1');
    assert.equal(await exists(path.join(project.archivedFolder, '.run', 'done', '1')), true);

    // THEN `osq land` exits 0.
    assertOk(await project.land(), 'land');
    assert.equal(await git(['status', '--porcelain'], project.repo), '');
  });
});
