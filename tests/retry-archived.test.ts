import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  type RecoveryProject,
  ScriptedAdapter,
  assertOk,
  commitMain,
  createRecoveryProject,
  exists,
  git,
} from './recovery-support.js';

const tmpDirs: string[] = [];
const BRANCH = 'osq/001-order-flow';

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

function regressionPath(project: RecoveryProject, name: string): string {
  return path.join(project.archivedFolder, '.run', 'regressed', name);
}

function eventsPath(project: RecoveryProject): string {
  return path.join(project.archivedFolder, '.run', 'events', 'change.jsonl');
}

async function statusLines(cwd: string): Promise<string[]> {
  const output = await git(['status', '--porcelain=v1', '--untracked-files=all'], cwd);
  return output.split('\n').filter((line) => line.trim().length > 0);
}

/** Archive the one-task change, then make `main`'s src/two.txt stop its land. */
async function stoppedLandProject(): Promise<RecoveryProject> {
  const project = await createRecoveryProject(tmpDirs, {
    tasks: [{ title: 'First task', scope: 'src/one.txt' }],
    autoRetries: 0,
  });
  assertOk(await project.approve(), 'approve');

  const adapter = new ScriptedAdapter();
  for (let cycle = 0; cycle < 5 && !(await exists(project.archivedFolder)); cycle += 1) {
    await project.watchOnce(adapter);
  }
  assert.equal(await exists(project.archivedFolder), true);

  await commitMain(project.repo, { 'src/two.txt': 'bad\n' });
  const land = await project.land();
  assert.equal(land.exitCode, 1);
  assert.match(
    await fs.readFile(regressionPath(project, 'change.md'), 'utf8'),
    /reason: sync_verify_red/,
  );
  return project;
}

describe('Retrying a land stop on an archived change', () => {
  it('clears the stop, commits the retry on the branch, and lands again', async () => {
    const project = await stoppedLandProject();

    // The default branch fixes the file the red verify read.
    await commitMain(project.repo, { 'src/two.txt': 'good\n' });

    const retry = await project.retry('change');
    assertOk(retry, 'retry');
    assert.match(retry.stdout, /Retried 001 change/);

    assert.equal(await exists(regressionPath(project, 'change.1.md')), true);
    assert.equal(await exists(regressionPath(project, 'change.md')), false);
    const events = (await fs.readFile(eventsPath(project), 'utf8'))
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as { type: string; data: { target?: string } });
    const last = events.at(-1);
    assert.equal(last?.type, 'retry');
    assert.equal(last?.data.target, 'change');

    assert.equal(
      await git(['log', '-1', '--format=%s', BRANCH], project.repo),
      'osq: 001 land retry',
    );
    assert.deepEqual(await statusLines(project.worktree), []);

    assertOk(await project.land(), 'land');
  });
});

describe('Retrying a task of an archived change', () => {
  it('refuses a numeric target without mutating the branch or the archive', async () => {
    const project = await stoppedLandProject();
    const beforeTip = await git(['rev-parse', BRANCH], project.repo);
    const beforeEvents = await fs.readFile(eventsPath(project), 'utf8');
    const beforeStatus = await statusLines(project.worktree);

    const retry = await project.retry('1');
    assert.notEqual(retry.exitCode, 0);
    assert.match(
      retry.stderr,
      /001-order-flow has archived; osq retry clears only its land stop: osq retry 001 change/,
    );

    assert.equal(await git(['rev-parse', BRANCH], project.repo), beforeTip);
    assert.equal(await exists(regressionPath(project, 'change.md')), true);
    assert.equal(await exists(regressionPath(project, 'change.1.md')), false);
    assert.equal(await fs.readFile(eventsPath(project), 'utf8'), beforeEvents);
    assert.deepEqual(await statusLines(project.worktree), beforeStatus);
  });
});
