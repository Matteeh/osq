import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  ScriptedAdapter,
  assertOk,
  createRecoveryProject,
  git,
  reviseTask,
} from './recovery-support.js';

/**
 * watcher-and-harness "Approval commit failed": a steered approve whose commit
 * hits a held index lock leaves the plan edits in place, `osq retry` then
 * refuses those uncommitted edits, and a second approve once the lock is gone
 * prints `Continues from task 1` and runs the change to a land. The
 * `scenario()` helper cannot look up watcher-and-harness scenarios, so this is
 * plain `node:test`.
 */

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

/** The absolute path `git rev-parse --git-path index.lock` names in `tree`. */
async function indexLockPath(tree: string): Promise<string> {
  const named = await git(['rev-parse', '--git-path', 'index.lock'], tree);
  return path.isAbsolute(named) ? named : path.resolve(tree, named);
}

describe('Approval commit failed', () => {
  it('approves again once the lock is gone and lands the change', async () => {
    const project = await createRecoveryProject(tmpDirs, {
      tasks: [{ title: 'First task', scope: 'src/one.txt' }],
      autoRetries: 1,
    });

    // The first approval into the worktree writes the seal and commits it.
    assertOk(await project.approve(), 'first approve');

    // The adapter keeps writing `bad` until the test revises the plan, so the
    // task's verify stays red and each attempt dies with the same output.
    let revised = false;
    const adapter = new ScriptedAdapter(() => (revised ? 'good\n' : 'bad\n'));

    // With `autoRetries` 1 the task dies, is retried automatically, and dies
    // again with the same output, which the watcher marks stuck.
    await project.watchOnce(adapter);
    assert.equal(adapter.calls.length, 2);

    // A planner edits `tasks/1.md` in the worktree.
    revised = true;
    await reviseTask(project.changeFolder, 1, { title: 'First task', scope: 'src/one.txt' });

    // The lock another git process holds makes the approval commit fail.
    const lock = await indexLockPath(project.worktree);
    await fs.writeFile(lock, '', 'utf8');
    const firstApprove = await project.approve();
    // THEN the first `osq approve` exits 1 with `run osq approve <id> again`.
    assert.equal(firstApprove.exitCode, 1);
    assert.match(firstApprove.stderr, /run osq approve 001 again/);

    // The human then runs `osq retry <id> 1`.
    const retry = await project.retry('1');
    // THEN `osq retry` exits 1 naming `tasks/1.md`.
    assert.equal(retry.exitCode, 1);
    assert.match(retry.stderr, /tasks\/1\.md/);

    // The lock goes away as when another git process ends.
    await fs.rm(lock, { force: true });

    // The human runs `osq approve <id>` again.
    const secondApprove = await project.approve();
    assertOk(secondApprove, 'second approve');
    // THEN the second `osq approve` prints `Continues from task 1`.
    assert.match(secondApprove.stdout, /Continues from task 1/);

    // The human runs `osq watch --once`.
    await project.watchOnce(adapter);
    // THEN the executor spawned a third time.
    assert.equal(adapter.calls.length, 3);

    // THEN `osq land` exits 0 with the third attempt's `src/one.txt`.
    assertOk(await project.land(), 'land');
    assert.equal(await fs.readFile(path.join(project.repo, 'src', 'one.txt'), 'utf8'), 'good\n');
  });
});
