import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ScriptedAdapter, createRecoveryProject, exists } from './recovery-support.js';

/**
 * Proven end to end in a temporary git repository with a fake executor: a real
 * `node` child runs `runWatcherOnce` with an executor that never resolves, the
 * test kills it with SIGKILL mid-task, `osq retry` names the stopped watcher
 * without mutating anything, and the next `osq watch --once` reaps the lock,
 * retries the task and archives the change, which then lands.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const childScript = path.join(repoRoot, 'tests', 'recovery-killed-watcher-child.ts');
const gitTestEnv = pathToFileURL(path.join(repoRoot, 'tests', 'git-test-env.ts')).href;
const require = createRequire(import.meta.url);
const tsxLoader = require.resolve('tsx');

/** Poll a file into existence, failing after `timeoutMs` rather than hanging. */
async function waitFor(target: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await exists(target)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${target}`);
}

/** The sorted entries of a directory, empty when it does not exist. */
async function entriesOf(dir: string): Promise<string[]> {
  return (await fs.readdir(dir).catch(() => [] as string[])).sort();
}

/** SIGKILL a live child and wait for its exit; return when it already exited. */
async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
}

describe('a watcher killed mid-task', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it(
    'refuses retry, reaps the lock, retries the task, archives and lands',
    { timeout: 120000 },
    async () => {
      const project = await createRecoveryProject(tmpDirs, {
        tasks: [{ title: 'Write one', scope: 'src/one.txt' }],
        autoRetries: 1,
      });
      const worktreeRoot = path.dirname(path.dirname(project.worktree));
      const readyPath = path.join(path.dirname(project.repo), 'ready.txt');

      const approved = await project.approve();
      assert.equal(approved.exitCode, 0, approved.stderr);

      const lockPath = path.join(project.changeFolder, '.run', 'running', '1.pid');
      const deadDir = path.join(project.changeFolder, '.run', 'dead');
      let child: ChildProcess | undefined;
      let stderr = '';
      try {
        child = spawn(
          process.execPath,
          [
            '--import',
            tsxLoader,
            '--import',
            gitTestEnv,
            childScript,
            project.repo,
            worktreeRoot,
            readyPath,
          ],
          { stdio: ['ignore', 'ignore', 'pipe'] },
        );
        child.stderr?.on('data', (chunk: Buffer) => {
          stderr += chunk.toString('utf8');
        });

        await waitFor(readyPath, 60000);
        assert.equal(await exists(lockPath), true, 'the killed watcher held the task lock');
        const lockBefore = await fs.readFile(lockPath, 'utf8');
        const deadBefore = await entriesOf(deadDir);
        const pid = (JSON.parse(lockBefore) as { pid: number }).pid;

        await stopChild(child);

        // The lock outlives the watcher: the pid it records no longer runs.
        assert.equal(await exists(lockPath), true);
        assert.equal(await fs.readFile(lockPath, 'utf8'), lockBefore);

        const refused = await project.retry('1');
        assert.equal(refused.exitCode, 1, refused.stdout + refused.stderr);
        assert.ok(
          refused.stderr.includes(
            `Task 1 was left running by a stopped watcher (pid ${pid}); run osq watch to reap it, then osq retry 001 1 if it stays dead.`,
          ),
          refused.stderr,
        );
        assert.equal(await fs.readFile(lockPath, 'utf8'), lockBefore);
        assert.deepEqual(await entriesOf(deadDir), deadBefore);

        const adapter = new ScriptedAdapter(() => 'good\n');
        const summary = await project.watchOnce(adapter);
        assert.equal(adapter.calls.length, 1, `spawned ${adapter.calls.length} times`);
        assert.equal(summary.specsArchived, 1);

        assert.equal(await exists(path.join(project.archivedFolder, '.run', 'done', '1')), true);
        const dead = await fs.readFile(
          path.join(project.archivedFolder, '.run', 'dead', '1.1.md'),
          'utf8',
        );
        assert.match(dead, /reason: crashed/);

        const landed = await project.land();
        assert.equal(landed.exitCode, 0, landed.stdout + landed.stderr);
        assert.equal(
          await fs.readFile(path.join(project.repo, 'src', 'one.txt'), 'utf8'),
          'good\n',
        );
      } finally {
        if (child !== undefined) await stopChild(child);
      }
    },
  );
});
