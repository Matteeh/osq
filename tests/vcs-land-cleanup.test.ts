import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach } from 'node:test';
import { scenario } from '@matteeh/osq/testing';
import { listChanges } from '../src/core/status/change-locations.js';
import { landChange } from '../src/core/vcs/land.js';
import {
  type RecoveryProject,
  ScriptedAdapter,
  assertOk,
  createRecoveryProject,
  exists,
  git,
  writeAt,
} from './recovery-support.js';

const FOLDER = '001-order-flow';
const BRANCH = `osq/${FOLDER}`;
const REL_ARCHIVE = path.posix.join('openspec', 'changes', 'archive', FOLDER);

const tmpDirs: string[] = [];
const lockedDirs: string[] = [];

afterEach(async () => {
  for (const dir of lockedDirs.splice(0)) {
    await fs.chmod(dir, 0o755).catch(() => undefined);
  }
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

/** Build the recovery project and run its one task until the change archives. */
async function archivedProject(): Promise<RecoveryProject> {
  const project = await createRecoveryProject(tmpDirs, {
    tasks: [{ title: 'First task', scope: 'src/one.txt' }],
  });
  assertOk(await project.approve(), 'approve');
  const adapter = new ScriptedAdapter(() => 'task\n');
  for (let cycle = 0; cycle < 5 && !(await exists(project.archivedFolder)); cycle += 1) {
    await project.watchOnce(adapter);
  }
  assert.equal(await exists(project.archivedFolder), true);
  return project;
}

/** The checkout's archived folder for the recovery change. */
async function checkoutArchive(project: RecoveryProject): Promise<string> {
  const archived = await listChanges(project.repo, project.config, ['archived']);
  const found = archived.find(
    (change) =>
      change.folderName === FOLDER && path.resolve(change.tree.root) === path.resolve(project.repo),
  );
  assert.ok(found, 'the checkout holds the archived change');
  return found.folderPath;
}

/** Whether git lists `target` as a worktree. */
async function listed(project: RecoveryProject, target: string): Promise<boolean> {
  const output = await git(['worktree', 'list', '--porcelain'], project.repo);
  return output.includes(`worktree ${target}`);
}

scenario(
  'version-control',
  'Ignored build output removed',
  { covers: landChange },
  async ({ run, then }) => {
    const project = await archivedProject();
    await writeAt(project.worktree, 'node_modules/pkg/index.js', 'built\n');

    const result = await run(project.repo, project.config, '001');

    await then(
      'it prints `Removed worktree <path>` and exits zero, no folder is left at `<path>`, and `git worktree list` no longer lists `<path>`',
      async () => {
        assert.equal(result.code, 0);
        assert.ok(result.lines.includes(`Removed worktree ${project.worktree}`));
        assert.equal(await exists(project.worktree), false);
        assert.equal(await listed(project, project.worktree), false);
      },
    );
  },
);

scenario(
  'version-control',
  'Logs kept in the checkout',
  { covers: landChange },
  async ({ run, then }) => {
    const project = await archivedProject();
    await writeAt(
      project.worktree,
      path.posix.join(REL_ARCHIVE, '.run', 'logs', 'probe.log'),
      'probe',
    );

    const result = await run(project.repo, project.config, '001');

    await then(
      "the checkout's archived change folder holds `.run/logs/probe.log` holding `probe`, and `git status --porcelain` in the checkout prints nothing",
      async () => {
        assert.equal(result.code, 0);
        const logs = path.join(await checkoutArchive(project), '.run', 'logs', 'probe.log');
        assert.equal(await fs.readFile(logs, 'utf8'), 'probe');
        assert.equal(await git(['status', '--porcelain'], project.repo), '');
      },
    );
  },
);

scenario(
  'version-control',
  'Removal fails after the land commit',
  { covers: landChange },
  async ({ run, then }) => {
    const project = await archivedProject();
    const locked = path.join(project.worktree, 'node_modules', 'locked');
    await writeAt(project.worktree, 'node_modules/locked/f', 'locked\n');
    await fs.chmod(locked, 0o500);
    lockedDirs.push(locked);

    const result = await run(project.repo, project.config, '001');

    await then(
      "it prints `Landed <folder> as <commit>`, then `Could not remove worktree <path>: ` followed by an error naming `EACCES`, then `Kept branch osq/<folder>`, exits 1, and the default branch's HEAD is `<commit>`",
      async () => {
        assert.equal(result.code, 1);
        const landed = result.lines[0] ?? '';
        const failed = result.lines[1] ?? '';
        const commit = /^Landed 001-order-flow as ([0-9a-f]{40})$/.exec(landed)?.[1];
        assert.ok(commit, `first line was ${landed}`);
        assert.ok(
          failed.startsWith(`Could not remove worktree ${project.worktree}: `),
          `second line was ${failed}`,
        );
        assert.match(failed, /EACCES/);
        assert.equal(result.lines[2], `Kept branch ${BRANCH}`);
        assert.equal(await git(['rev-parse', 'HEAD'], project.repo), commit);
      },
    );
  },
);

scenario(
  'version-control',
  'Leftover folder removed on the next land',
  { covers: landChange },
  async ({ run, then }) => {
    const project = await archivedProject();
    assert.equal((await run(project.repo, project.config, '001')).code, 0);
    await writeAt(project.worktree, 'target/big', 'big\n');

    const result = await run(project.repo, project.config, '001');

    await then(
      '`osq land <id>` prints `<folder> has already landed` and `Removed worktree <path>`, exits zero, and no folder is left at `<path>`',
      async () => {
        assert.equal(result.code, 0);
        assert.equal(result.lines[0], `${FOLDER} has already landed`);
        assert.ok(result.lines.includes(`Removed worktree ${project.worktree}`));
        assert.equal(await exists(project.worktree), false);
      },
    );
  },
);
