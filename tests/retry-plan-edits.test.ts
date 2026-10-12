import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  type RecoveryProject,
  ScriptedAdapter,
  assertOk,
  createRecoveryProject,
  exists,
  reviseTask,
  writeAt,
} from './recovery-support.js';

/**
 * watcher-and-harness "Plan edits not committed": every row, driven through
 * `project.retry('1')` on a change whose task 1 died `verify_red` with
 * `autoRetries` 0, as `recovery-dead-retry.test.ts` does. The `scenario()`
 * helper cannot look up watcher-and-harness scenarios, so this is plain
 * `node:test`.
 */

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

/** The worktree folder's copy of `.run/dead/<name>`. */
function deadMarker(project: RecoveryProject, name: string): string {
  return path.join(project.changeFolder, '.run', 'dead', name);
}

/** A recovery project whose one task died `verify_red` before any retry. */
async function projectWithDeadTask(): Promise<RecoveryProject> {
  const project = await createRecoveryProject(tmpDirs, {
    tasks: [{ title: 'First task', scope: 'src/one.txt' }],
    autoRetries: 0,
  });
  assertOk(await project.approve(), 'approve');
  await project.watchOnce(new ScriptedAdapter(() => 'bad\n'));
  assert.equal(
    await exists(deadMarker(project, '1.md')),
    true,
    'task 1 should have died with verify_red',
  );
  return project;
}

describe('Plan edits not committed', () => {
  it('refuses changed tasks/1.md and proposal.md, naming both', async () => {
    const project = await projectWithDeadTask();
    await reviseTask(project.changeFolder, 1, { title: 'First task', scope: 'src/one.txt' });
    await writeAt(project.changeFolder, 'proposal.md', '# Edited proposal\n');

    const result = await project.retry('1');

    assert.equal(result.exitCode, 1);
    assert.match(
      result.stderr,
      /Error retrying 001 1:\n {2}Change 001 has plan edits not committed in its worktree: proposal\.md, tasks\/1\.md\. Run osq approve 001 to approve them\./,
    );
    assert.equal(await exists(deadMarker(project, '1.md')), true);
  });

  it('refuses a new untracked tasks/2.md, naming it', async () => {
    const project = await projectWithDeadTask();
    await writeAt(project.changeFolder, path.posix.join('tasks', '2.md'), '# New task\n');

    const result = await project.retry('1');

    assert.equal(result.exitCode, 1);
    assert.match(
      result.stderr,
      /Change 001 has plan edits not committed in its worktree: tasks\/2\.md\. Run osq approve 001 to approve them\./,
    );
    assert.equal(await exists(deadMarker(project, '1.md')), true);
  });

  it('allows a ticked-off tasks.md', async () => {
    const project = await projectWithDeadTask();
    await writeAt(project.changeFolder, 'tasks.md', '# Tasks\n\n- [x] 1. First task\n');

    const result = await project.retry('1');

    assertOk(result, 'retry');
    assert.equal(await exists(deadMarker(project, '1.md')), false);
    assert.equal(await exists(deadMarker(project, '1.1.md')), true);
  });

  it('allows an untouched worktree', async () => {
    const project = await projectWithDeadTask();

    const result = await project.retry('1');

    assertOk(result, 'retry');
    assert.equal(await exists(deadMarker(project, '1.md')), false);
    assert.equal(await exists(deadMarker(project, '1.1.md')), true);
  });
});
