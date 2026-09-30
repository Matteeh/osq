import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { restoreStackedDraft } from '../src/core/spec/checkout-draft.js';
import { findChange } from '../src/core/status/change-locations.js';
import { stackedPath } from '../src/core/vcs/worktree.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

/** The test's own git calls ignore redirecting variables, like osq's reads. */
function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) {
    Reflect.deleteProperty(env, key);
  }
  return env;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, env: cleanGitEnv() });
  return stdout.trim();
}

/** Replace the seeded planning sentinel with a real local verifier. */
async function installLocalVerifier(root: string, folderPath: string): Promise<void> {
  await fs.writeFile(path.join(root, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  for (const rel of ['proposal.md', path.join('tasks', '1.md')]) {
    const target = path.join(folderPath, rel);
    const content = await fs.readFile(target, 'utf8').catch(() => null);
    if (content === null) continue;
    await fs.writeFile(
      target,
      content.replace(/^verify:.*$/m, `verify: ${PASSING_VERIFY}`),
      'utf8',
    );
  }
}

interface Change {
  folderName: string;
  folderPath: string;
}

interface Project {
  root: string;
  repo: string;
  worktrees: string;
  config: OsqConfig;
  vcs: VcsConfig;
  one: Change;
  two: Change;
}

/** A committed temp repository with two uncommitted change drafts. */
async function makeProject(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-approve-owns-draft-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });

  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const one = await createNewSpec(repo, 'Order Flow');
  const two = await createNewSpec(repo, 'Second Flow');
  await installLocalVerifier(repo, one.folderPath);
  await installLocalVerifier(repo, two.folderPath);
  await setDependsOn(two.folderPath, ['001']);

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  return { root, repo, worktrees, config: defineConfig({ vcs }), vcs, one, two };
}

/** Rewrite a proposal's `depends_on` frontmatter. */
async function setDependsOn(folderPath: string, ids: readonly string[]): Promise<void> {
  const proposalPath = path.join(folderPath, 'proposal.md');
  const content = await fs.readFile(proposalPath, 'utf8');
  const value = `[${ids.map((id) => JSON.stringify(id)).join(', ')}]`;
  await fs.writeFile(
    proposalPath,
    content.replace(/^depends_on:.*$/m, `depends_on: ${value}`),
    'utf8',
  );
}

async function readTrimmed(target: string): Promise<string> {
  return (await fs.readFile(target, 'utf8')).trim();
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

/** The stacked copy of a change. */
function stackedCopy(p: Project, change: Change): string {
  return path.join(
    stackedPath(p.vcs, p.repo, change.folderName),
    path.relative(p.repo, change.folderPath),
  );
}

/** Every file under a directory, keyed by relative path, for byte comparisons. */
async function snapshotTree(root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        files.set(path.relative(root, fullPath), await fs.readFile(fullPath, 'utf8'));
      }
    }
  };
  await walk(root);
  return files;
}

function assertSameTree(
  before: Map<string, string>,
  after: Map<string, string>,
  label: string,
): void {
  assert.deepEqual(
    [...after.keys()].sort(),
    [...before.keys()].sort(),
    `${label} file list changed`,
  );
  for (const [rel, content] of before) {
    assert.equal(after.get(rel), content, `${label} changed ${rel}`);
  }
}

describe('approval owns the draft', () => {
  it('removes an uncommitted draft from the checkout', async () => {
    const p = await makeProject();
    const statusBefore = await git(['status', '--porcelain', '--untracked-files=all'], p.repo);
    assert.equal(await exists(p.one.folderPath), true);

    const result = await approveSpec(p.repo, '001', p.config);

    assert.equal(result.worktreePath !== undefined, true);
    assert.equal(await exists(p.one.folderPath), false);
    const statusAfter = await git(['status', '--porcelain', '--untracked-files=all'], p.repo);
    assert.equal(
      statusAfter.split('\n').filter((line) => line.includes(p.one.folderName)).length,
      0,
    );
    assert.equal(
      statusAfter,
      statusBefore
        .split('\n')
        .filter((line) => !line.includes(p.one.folderName))
        .join('\n'),
    );
  });

  it('keeps a draft the checkout HEAD holds', async () => {
    const p = await makeProject();
    await git(['add', '-A'], p.repo);
    await git(['commit', '-qm', 'commit drafts'], p.repo);
    const statusBefore = await git(['status', '--porcelain'], p.repo);

    const result = await approveSpec(p.repo, '001', p.config);

    assert.equal(result.worktreePath !== undefined, true);
    assert.equal(await exists(p.one.folderPath), true);
    assert.equal(await git(['status', '--porcelain'], p.repo), statusBefore);
    assert.equal(
      (await git(['status', '--porcelain', '--untracked-files=all'], p.repo))
        .split('\n')
        .some((line) => line.includes(p.one.folderName)),
      false,
    );
  });

  it('keeps the draft when approval refuses', async () => {
    const p = await makeProject();
    await git(['checkout', '-q', '-b', 'topic'], p.repo);
    const before = await snapshotTree(p.one.folderPath);

    await assert.rejects(approveSpec(p.repo, '001', p.config), /HEAD is on topic/);

    assertSameTree(before, await snapshotTree(p.one.folderPath), 'draft');
  });

  it('leaves the folder and seal in the checkout when vcs is off', async () => {
    const p = await makeProject();

    const result = await approveSpec(p.repo, '001', defineConfig({}));

    assert.equal(result.worktreePath, undefined);
    assert.equal(await readTrimmed(path.join(p.one.folderPath, '.run', 'approved')), result.hash);
    assert.equal(await exists(p.one.folderPath), true);
  });
});

describe('stacked draft restore', () => {
  it('restores a halted stacked change as an unapproved draft', async () => {
    const p = await makeProject();
    await approveSpec(p.repo, '001', p.config);
    await approveSpec(p.repo, '002', p.config);
    const root = stackedPath(p.vcs, p.repo, p.two.folderName);
    const copy = stackedCopy(p, p.two);
    await fs.writeFile(path.join(copy, '.run', 'plan.jsonl'), '{"type":"plan_started"}\n', 'utf8');
    const haltDir = path.join(copy, '.run', 'dead');
    await fs.mkdir(haltDir, { recursive: true });
    await fs.writeFile(path.join(haltDir, '1.md'), '---\nreason: verify_red\n---\n', 'utf8');
    const stackedBefore = await snapshotTree(root);
    const change = await findChange(p.repo, p.config, '002');

    const restored = await restoreStackedDraft(p.repo, p.config, change);

    assert.equal(restored, p.two.folderPath);
    assert.equal(
      await readTrimmed(path.join(restored, 'proposal.md')),
      await readTrimmed(path.join(copy, 'proposal.md')),
    );
    assert.deepEqual((await fs.readdir(path.join(restored, '.run'))).sort(), [
      'manifest.json',
      'plan.jsonl',
    ]);
    assertSameTree(stackedBefore, await snapshotTree(root), 'stacked approval');
  });

  it('removes the restored draft and keeps the stacked copy when approval fails', async () => {
    const p = await makeProject();
    await approveSpec(p.repo, '001', p.config);
    await approveSpec(p.repo, '002', p.config);
    const root = stackedPath(p.vcs, p.repo, p.two.folderName);
    await setDependsOn(stackedCopy(p, p.two), ['099']);
    const stackedBefore = await snapshotTree(root);

    await assert.rejects(
      approveSpec(p.repo, '002', p.config),
      /depends_on names missing change: 099/,
    );

    assert.equal(await exists(p.two.folderPath), false);
    assertSameTree(stackedBefore, await snapshotTree(root), 'stacked approval');
  });
});
