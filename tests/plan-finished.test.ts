import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { planCommand } from '../src/cli/plan.js';
import { defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { ScriptedAdapter, assertOk, createRecoveryProject, exists } from './recovery-support.js';

const tmpDirs: string[] = [];
const ARCHIVE_REL = path.posix.join('openspec', 'changes', 'archive', '001-order-flow');

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

/** The folders directly under `changesDir`, sorted. */
async function changeFolders(changesDir: string): Promise<string[]> {
  const entries = await fs.readdir(changesDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Run `osq plan 1` for `root` and prove the row's refusal and that no folder appeared. */
async function assertRefused(
  root: string,
  config: ReturnType<typeof defineConfig>,
  message: string,
): Promise<void> {
  const changesDir = path.join(root, 'openspec', 'changes');
  const before = await changeFolders(changesDir);
  await assert.rejects(
    planCommand('1', { cwd: root, config }),
    (error: unknown) => error instanceof Error && error.message === message,
  );
  assert.deepEqual(await changeFolders(changesDir), before);
}

describe('cli-foundation: Plan a finished change', () => {
  it('landed: the default branch holds the archive folder and the worktree is gone', async () => {
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

    assertOk(await project.land(), 'land');
    assert.equal(await exists(project.worktree), false);
    assert.equal(await exists(path.join(project.repo, ARCHIVE_REL)), true);

    await assertRefused(
      project.repo,
      project.config,
      '001-order-flow has landed, so osq plan 1 has nothing to reopen. Start new work with an item in openspec/queue.md and osq plan --next, or with osq plan <name> --brief <file>.',
    );
  });

  it('archived in the checkout with vcs.enabled off', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-finished-'));
    tmpDirs.push(root);
    await scaffoldProject(root);
    await fs.mkdir(path.join(root, ARCHIVE_REL), { recursive: true });
    await fs.writeFile(
      path.join(root, ARCHIVE_REL, 'proposal.md'),
      ['---', 'title: Order Flow', 'depends_on: []', '---', '## Goal', 'Done.', ''].join('\n'),
      'utf8',
    );

    await assertRefused(
      root,
      defineConfig({ vcs: { enabled: false } }),
      '001-order-flow has archived, so osq plan 1 has nothing to reopen. Start new work with an item in openspec/queue.md and osq plan --next, or with osq plan <name> --brief <file>.',
    );
  });
});
