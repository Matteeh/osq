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
} from './recovery-support.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('Dead task retried by a human', () => {
  it('reruns the task, archives the change, and lands it', async () => {
    const project = await createRecoveryProject(tmpDirs, {
      tasks: [{ title: 'First task', scope: 'src/one.txt' }],
      autoRetries: 0,
    });

    assertOk(await project.approve(), 'approve');

    // The first attempt writes `bad`, so the task's verify exits 1 and dies.
    const adapter = new ScriptedAdapter((_options, call) => (call === 1 ? 'bad\n' : 'good\n'));

    await project.watchOnce(adapter);
    assert.equal(adapter.calls.length, 1);
    assert.equal(adapter.calls[0]?.taskNumber, '1');
    assert.equal(await exists(path.join(project.changeFolder, '.run', 'dead', '1.md')), true);

    // A human retries the dead task, then the watcher runs it again.
    assertOk(await project.retry('1'), 'retry');
    await project.watchOnce(adapter);

    // THEN the executor spawned twice.
    assert.equal(adapter.calls.length, 2);
    // THEN the archived folder holds `.run/dead/1.1.md` and `.run/done/1`.
    assert.equal(await exists(path.join(project.archivedFolder, '.run', 'dead', '1.1.md')), true);
    assert.equal(await exists(path.join(project.archivedFolder, '.run', 'done', '1')), true);

    // THEN osq land exits 0.
    assertOk(await project.land(), 'land');

    // THEN src/one.txt on the default branch holds the second attempt's content.
    assert.equal(await fs.readFile(path.join(project.repo, 'src', 'one.txt'), 'utf8'), 'good\n');
    assert.equal(await git(['status', '--porcelain'], project.repo), '');
  });
});
