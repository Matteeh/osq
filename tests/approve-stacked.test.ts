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
import { hashChangeFolder } from '../src/core/spec/hasher.js';
import {
  formatStackedOn,
  parseStackedOn,
  readDependencyState,
} from '../src/core/spec/stack-dependencies.js';
import { selectVcs } from '../src/core/vcs/select.js';
import { stackedPath, worktreeBranch, worktreePath } from '../src/core/vcs/worktree.js';

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

async function installFakeValidator(projectRoot: string): Promise<void> {
  const binDir = path.join(projectRoot, 'node_modules', '.bin');
  await fs.mkdir(binDir, { recursive: true });
  await fs.writeFile(
    path.join(binDir, 'openspec'),
    "#!/usr/bin/env node\nprocess.stdout.write('{}');\n",
    { mode: 0o755 },
  );
  const manifestDir = path.join(projectRoot, 'node_modules', '@fission-ai', 'openspec');
  await fs.mkdir(manifestDir, { recursive: true });
  await fs.writeFile(
    path.join(manifestDir, 'package.json'),
    JSON.stringify({ name: '@fission-ai/openspec', version: '1.13.1' }),
    'utf8',
  );
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-approve-stacked-'));
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
  return {
    root,
    repo,
    worktrees,
    config: defineConfig({ vcs }),
    vcs,
    one,
    two,
  };
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

/** Approve a change into its worktree and return that worktree. */
async function approveIntoWorktree(p: Project, change: Change): Promise<string> {
  const result = await approveSpec(p.repo, change.folderName, p.config);
  assert.ok(result.worktreePath, `expected a worktree for ${change.folderName}`);
  return result.worktreePath;
}

describe('Stack dependency state', () => {
  it('reads approved from the dependency worktree', async () => {
    const p = await makeProject();
    await approveSpec(p.repo, '001', p.config);
    const vcs = await selectVcs(p.repo, p.config);

    const state = await readDependencyState(p.repo, p.config, vcs, p.one.folderName);
    assert.equal(state.state, 'approved');
    const oneCopy = path.join(
      worktreePath(p.vcs, p.repo, p.one.folderName),
      path.relative(p.repo, p.one.folderPath),
    );
    assert.equal(state.hash, await hashChangeFolder(oneCopy));
  });

  it('reads archived from the branch tip with the archive hash and base', async () => {
    const p = await makeProject();
    const wtPath = await approveIntoWorktree(p, p.one);
    const rel = path.relative(p.repo, p.one.folderPath);
    await fs.mkdir(path.join(wtPath, 'openspec', 'changes', 'archive'), { recursive: true });
    await git(['mv', rel, path.join('openspec', 'changes', 'archive', p.one.folderName)], wtPath);
    await git(['commit', '-qm', 'archive 001'], wtPath);
    const vcs = await selectVcs(p.repo, p.config);

    const state = await readDependencyState(p.repo, p.config, vcs, p.one.folderName);
    assert.equal(state.state, 'archived');
    const archived = path.join(wtPath, 'openspec', 'changes', 'archive', p.one.folderName);
    assert.equal(state.hash, await hashChangeFolder(archived));
    assert.equal(state.base, worktreeBranch(p.one.folderName));
  });

  it('reads landed from the default branch whatever the branch holds', async () => {
    const p = await makeProject();
    const archive = path.join(p.repo, 'openspec', 'changes', 'archive', p.one.folderName);
    await fs.mkdir(path.dirname(archive), { recursive: true });
    await fs.cp(p.one.folderPath, archive, { recursive: true });
    await git(['add', '-A'], p.repo);
    await git(['commit', '-qm', 'land 001'], p.repo);
    const vcs = await selectVcs(p.repo, p.config);

    const state = await readDependencyState(p.repo, p.config, vcs, p.one.folderName);
    assert.equal(state.state, 'landed');
    assert.equal(state.hash, null);
  });

  it('reads unapproved when the branch only holds the rejected folder', async () => {
    const p = await makeProject();
    const wtPath = await approveIntoWorktree(p, p.one);
    const rel = path.relative(p.repo, p.one.folderPath);
    await fs.mkdir(path.join(wtPath, 'openspec', 'changes', 'rejected'), { recursive: true });
    await git(['mv', rel, path.join('openspec', 'changes', 'rejected', p.one.folderName)], wtPath);
    await git(['commit', '-qm', 'reject 001'], wtPath);
    const vcs = await selectVcs(p.repo, p.config);

    const state = await readDependencyState(p.repo, p.config, vcs, p.one.folderName);
    assert.equal(state.state, 'unapproved');
    assert.equal(state.hash, null);
  });

  it('reads unapproved for a checkout draft', async () => {
    const p = await makeProject();
    const vcs = await selectVcs(p.repo, p.config);

    const state = await readDependencyState(p.repo, p.config, vcs, p.one.folderName);
    assert.equal(state.state, 'unapproved');
    assert.equal(state.hash, null);
  });

  it('formats and parses stacked-on lines', () => {
    const text = formatStackedOn([
      { folder: '001-a', hash: 'aaa' },
      { folder: '002-b', hash: 'bbb' },
    ]);
    assert.deepEqual(parseStackedOn(text), [
      { folder: '001-a', hash: 'aaa' },
      { folder: '002-b', hash: 'bbb' },
    ]);
  });
});

describe('Stacked approval', () => {
  it('records a stacked approval for a dependent of a running change', async () => {
    const p = await makeProject();
    await approveSpec(p.repo, '001', p.config);
    const before = (await git(['status', '--porcelain', '--untracked-files=all'], p.repo)).split(
      '\n',
    );

    const result = await approveSpec(p.repo, '002', p.config);

    const stacked = stackedPath(p.vcs, p.repo, p.two.folderName);
    assert.equal(result.stackedPath, stacked);
    assert.deepEqual(result.waitingFor, [p.one.folderName]);
    assert.equal(result.worktreePath, undefined);
    assert.equal(result.branch, undefined);

    const copy = stackedCopy(p, p.two);
    assert.equal(await readTrimmed(path.join(copy, '.run', 'approved')), result.hash);
    assert.equal(
      await readTrimmed(path.join(copy, '.run', 'approver')),
      'osq <osq@example.invalid>',
    );
    const on = parseStackedOn(await fs.readFile(path.join(copy, '.run', 'stacked-on'), 'utf8'));
    const oneCopy = path.join(
      worktreePath(p.vcs, p.repo, p.one.folderName),
      path.relative(p.repo, p.one.folderPath),
    );
    assert.deepEqual(on, [{ folder: p.one.folderName, hash: await hashChangeFolder(oneCopy) }]);

    assert.equal(
      await git(
        ['branch', '--format=%(refname:short)', '--list', worktreeBranch(p.two.folderName)],
        p.repo,
      ),
      '',
    );
    const after = (await git(['status', '--porcelain', '--untracked-files=all'], p.repo)).split(
      '\n',
    );
    assert.deepEqual(
      after,
      before.filter((line) => !line.includes(p.two.folderName)),
    );
  });

  it('approves into a worktree when the dependency already landed', async () => {
    const p = await makeProject();
    const archive = path.join(p.repo, 'openspec', 'changes', 'archive', p.one.folderName);
    await fs.mkdir(path.dirname(archive), { recursive: true });
    await fs.cp(p.one.folderPath, archive, { recursive: true });
    await git(['add', '-A'], p.repo);
    await git(['commit', '-qm', 'land 001'], p.repo);

    const result = await approveSpec(p.repo, '002', p.config);

    assert.equal(result.branch, worktreeBranch(p.two.folderName));
    assert.equal(result.worktreePath, worktreePath(p.vcs, p.repo, p.two.folderName));
    assert.equal(result.stackedPath, undefined);
    assert.equal(await exists(stackedPath(p.vcs, p.repo, p.two.folderName)), false);
  });

  it('replaces the stacked copy when approved again', async () => {
    const p = await makeProject();
    await approveSpec(p.repo, '001', p.config);
    await approveSpec(p.repo, '002', p.config);

    const taskPath = path.join(stackedCopy(p, p.two), 'tasks', '1.md');
    await fs.appendFile(taskPath, '\nEdited after stacking.\n', 'utf8');
    const result = await approveSpec(p.repo, '002', p.config);

    const copy = stackedCopy(p, p.two);
    assert.equal(result.stackedPath, stackedPath(p.vcs, p.repo, p.two.folderName));
    assert.equal(await readTrimmed(path.join(copy, '.run', 'approved')), result.hash);
    assert.match(
      await fs.readFile(path.join(copy, 'tasks', '1.md'), 'utf8'),
      /Edited after stacking\./,
    );
  });

  it('approves into a worktree and clears the stacked copy after a rejection', async () => {
    const p = await makeProject();
    const wtPath = await approveIntoWorktree(p, p.one);
    await approveSpec(p.repo, '002', p.config);
    const stacked = stackedPath(p.vcs, p.repo, p.two.folderName);
    assert.equal(await exists(stacked), true);

    await fs.mkdir(path.join(wtPath, 'openspec', 'changes', 'rejected'), { recursive: true });
    await git(
      [
        'mv',
        path.relative(p.repo, p.one.folderPath),
        path.join('openspec', 'changes', 'rejected', p.one.folderName),
      ],
      wtPath,
    );
    await git(['commit', '-qm', 'reject 001'], wtPath);

    const result = await approveSpec(p.repo, '002', p.config);

    assert.equal(result.branch, worktreeBranch(p.two.folderName));
    assert.equal(result.worktreePath, worktreePath(p.vcs, p.repo, p.two.folderName));
    assert.equal(await exists(stacked), false);
  });
});
