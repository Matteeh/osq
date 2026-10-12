import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { approvalCommitLanded } from '../src/core/spec/approve-seal-restore.js';
import {
  ScriptedAdapter,
  assertOk,
  createRecoveryProject,
  exists,
  git,
  reviseTask,
} from './recovery-support.js';
import type { CommandResult } from './recovery-support.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

/** The bytes of a seal file under `folder`, or null when it is absent. */
async function readSeal(folder: string, relative: string): Promise<Buffer | null> {
  return fs.readFile(path.join(folder, relative)).catch(() => null);
}

/** The absolute path `git rev-parse --git-path index.lock` names in `tree`. */
async function indexLockPath(tree: string): Promise<string> {
  const named = await git(['rev-parse', '--git-path', 'index.lock'], tree);
  return path.isAbsolute(named) ? named : path.resolve(tree, named);
}

describe('Approved commit fails', () => {
  it('rolls the seal files back and keeps the plan edits', async () => {
    const project = await createRecoveryProject(tmpDirs, {
      tasks: [{ title: 'First task', scope: 'src/one.txt' }],
      autoRetries: 1,
    });

    // The first approval into the worktree writes the seal and commits it.
    assertOk(await project.approve(), 'first approve');

    // Reach the stuck task as recovery-stuck-steer does: the task dies, is
    // retried automatically, and dies again with the same output.
    let revised = false;
    const adapter = new ScriptedAdapter(() => (revised ? 'good\n' : 'bad\n'));
    await project.watchOnce(adapter);
    await project.watchOnce(adapter);
    const deadPath = path.join(project.changeFolder, '.run', 'dead', '1.md');
    assert.match(await fs.readFile(deadPath, 'utf8'), /stuck: true/);

    // A planner edits `tasks/1.md` in the worktree.
    revised = true;
    await reviseTask(project.changeFolder, 1, { title: 'First task', scope: 'src/one.txt' });
    const editedTask = await fs.readFile(path.join(project.changeFolder, 'tasks', '1.md'), 'utf8');

    const beforeApproved = await readSeal(project.changeFolder, '.run/approved');
    const beforeManifest = await readSeal(project.changeFolder, '.run/manifest.json');
    const beforePlan = await readSeal(project.changeFolder, '.run/plan.jsonl');
    const headBefore = await git(['rev-parse', 'HEAD'], project.worktree);

    // A lock another git process holds makes the approval commit fail.
    const lock = await indexLockPath(project.worktree);
    await fs.writeFile(lock, '', 'utf8');
    let approval: CommandResult;
    try {
      approval = await project.approve();
    } finally {
      await fs.rm(lock, { force: true });
    }

    // THEN `osq approve` exits 1 with an error holding the three phrases.
    assert.equal(approval.exitCode, 1);
    assert.match(approval.stderr, /the approved commit failed in/);
    assert.match(approval.stderr, /index\.lock/);
    assert.match(approval.stderr, /run osq approve 001 again/);

    // THEN the three seal files hold the same bytes as before the approve.
    assert.deepEqual(await readSeal(project.changeFolder, '.run/approved'), beforeApproved);
    assert.deepEqual(await readSeal(project.changeFolder, '.run/manifest.json'), beforeManifest);
    assert.deepEqual(await readSeal(project.changeFolder, '.run/plan.jsonl'), beforePlan);

    // THEN the edited `tasks/1.md` is unchanged.
    assert.equal(
      await fs.readFile(path.join(project.changeFolder, 'tasks', '1.md'), 'utf8'),
      editedTask,
    );

    // THEN `.run/dead/1.md` is still in place.
    assert.equal(await exists(deadPath), true);

    // THEN the worktree's HEAD is the same commit as before.
    assert.equal(await git(['rev-parse', 'HEAD'], project.worktree), headBefore);
  });
});

describe('approvalCommitLanded', () => {
  const folder = 'openspec/changes/001-order-flow';
  const hash = 'sha256:new';

  it('reads HEAD at the change folder and keeps the new hash', async () => {
    const calls: { ref: string; filePath: string }[] = [];
    const show = async (ref: string, filePath: string): Promise<string | null> => {
      calls.push({ ref, filePath });
      return `${hash}\n`;
    };
    assert.equal(await approvalCommitLanded({ show }, folder, hash), true);
    assert.deepEqual(calls, [{ ref: 'HEAD', filePath: `${folder}/.run/approved` }]);
  });

  it('rolls back when HEAD holds the old hash', async () => {
    assert.equal(
      await approvalCommitLanded({ show: async () => 'sha256:old\n' }, folder, hash),
      false,
    );
  });

  it('rolls back when HEAD has no seal', async () => {
    assert.equal(await approvalCommitLanded({ show: async () => null }, folder, hash), false);
  });
});
