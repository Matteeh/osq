import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { createProgram } from '../src/cli/index.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { hashChangeFolder } from '../src/core/spec/hasher.js';
import { worktreeBranch, worktreePath } from '../src/core/vcs/worktree.js';

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

interface Project {
  root: string;
  repo: string;
  worktrees: string;
  config: OsqConfig;
  vcs: VcsConfig;
  folder001: string;
  spec001: string;
  folder002: string;
  spec002: string;
}

/** A committed temp repository with two uncommitted change drafts. */
async function makeProject(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-approve-worktree-'));
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

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({ vcs });
  return {
    root,
    repo,
    worktrees,
    config,
    vcs,
    folder001: one.folderName,
    spec001: one.folderPath,
    folder002: two.folderName,
    spec002: two.folderPath,
  };
}

async function readRun(folder: string, marker: string): Promise<string> {
  return (await fs.readFile(path.join(folder, '.run', marker), 'utf8')).trim();
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

/** Rewrite a task's scope frontmatter to one exact path. */
async function setTaskScope(folderPath: string, scope: string): Promise<void> {
  const taskPath = path.join(folderPath, 'tasks', '1.md');
  const content = await fs.readFile(taskPath, 'utf8');
  await fs.writeFile(taskPath, content.replace(/^scope:.*$/m, `scope:\n  - ${scope}`), 'utf8');
}

describe('osq approve into a worktree', () => {
  it('commits the draft onto osq/<folder> and writes nothing to the checkout', async () => {
    const p = await makeProject();
    const wtPath = worktreePath(p.vcs, p.repo, p.folder001);
    const before = await git(['status', '--porcelain'], p.repo);

    const result = await approveSpec(p.repo, '001', p.config);

    assert.equal(result.worktreePath, wtPath);
    assert.equal(result.branch, worktreeBranch(p.folder001));
    assert.equal(await git(['status', '--porcelain'], p.repo), before);
    assert.equal(await exists(path.join(p.spec001, '.run', 'approved')), false);

    const folder = path.join(wtPath, path.relative(p.repo, p.spec001));
    assert.equal(await readRun(folder, 'approved'), await hashChangeFolder(p.spec001));
    assert.equal(await readRun(folder, 'base'), await git(['rev-parse', 'HEAD'], p.repo));
    assert.equal(await readRun(folder, 'approver'), 'osq <osq@example.invalid>');

    const branch = result.branch;
    assert.ok(branch);
    const subject = await git(['log', '--format=%s', '-1', branch], p.repo);
    assert.equal(subject, 'osq: 001 approved');
    const author = await git(['log', '--format=%an <%ae>', '-1', branch], p.repo);
    assert.equal(author, 'Osq <osq@example.invalid>');
    assert.equal(
      await git(['rev-parse', `${branch}^`], p.repo),
      await git(['rev-parse', 'HEAD'], p.repo),
    );
  });

  it('runs vcs.prepare in the worktree and not in the checkout', async () => {
    const p = await makeProject();
    const vcs: VcsConfig = {
      enabled: true,
      author: 'Osq <osq@example.invalid>',
      worktreeRoot: p.worktrees,
      prepare: "node -e \"require('fs').writeFileSync('prepared','ok')\"",
    };
    const config = defineConfig({ vcs });
    const result = await approveSpec(p.repo, '001', config);

    const wtPath = result.worktreePath;
    assert.ok(wtPath);
    assert.equal(await exists(path.join(wtPath, 'prepared')), true);
    assert.equal(await exists(path.join(p.repo, 'prepared')), false);
  });

  it('stops on a failing prepare and keeps the branch and worktree', async () => {
    const p = await makeProject();
    const vcs: VcsConfig = {
      enabled: true,
      author: 'Osq <osq@example.invalid>',
      worktreeRoot: p.worktrees,
      prepare: 'node -e "console.error(\'boom\'); process.exit(1)"',
    };
    const config = defineConfig({ vcs });
    const branch = worktreeBranch(p.folder001);
    const wtPath = worktreePath(vcs, p.repo, p.folder001);

    await assert.rejects(approveSpec(p.repo, '001', config), (error: Error) => {
      assert.match(error.message, /boom/);
      assert.match(error.message, new RegExp(branch.replace('/', '\\/')));
      assert.ok(error.message.includes(wtPath));
      return true;
    });
    assert.equal(
      await git(['branch', '--format=%(refname:short)', '--list', branch], p.repo),
      branch,
    );
    assert.equal(await exists(wtPath), true);
  });

  it('refuses a non-default branch and approves with baseOk', async () => {
    const p = await makeProject();
    await git(['checkout', '-q', '-b', 'topic'], p.repo);

    await assert.rejects(
      approveSpec(p.repo, '001', p.config),
      /HEAD is on topic, not the default branch main; pass --base-ok to approve from it/,
    );
    assert.equal(await exists(worktreePath(p.vcs, p.repo, p.folder001)), false);

    const result = await approveSpec(p.repo, '001', p.config, { baseOk: true });
    assert.equal(result.branch, worktreeBranch(p.folder001));
  });

  it('refuses dirty task scope and approves with ignoreDirty', async () => {
    const p = await makeProject();
    await setTaskScope(p.spec001, 'src/dirty.ts');
    await fs.mkdir(path.join(p.repo, 'src'), { recursive: true });
    await fs.writeFile(path.join(p.repo, 'src', 'dirty.ts'), 'clean\n', 'utf8');
    await git(['add', 'src/dirty.ts'], p.repo);
    await git(['commit', '-qm', 'add dirty'], p.repo);
    await fs.writeFile(path.join(p.repo, 'src', 'dirty.ts'), 'dirty\n', 'utf8');

    await assert.rejects(
      approveSpec(p.repo, '001', p.config),
      /uncommitted changes in task scope: src\/dirty\.ts; commit them or pass --ignore-dirty/,
    );
    assert.equal(await exists(worktreePath(p.vcs, p.repo, p.folder001)), false);

    const result = await approveSpec(p.repo, '001', p.config, { ignoreDirty: true });
    assert.equal(result.branch, worktreeBranch(p.folder001));
  });

  it('refuses an existing branch and creates no worktree', async () => {
    const p = await makeProject();
    const branch = worktreeBranch(p.folder001);
    await git(['branch', branch], p.repo);

    await assert.rejects(
      approveSpec(p.repo, '001', p.config),
      new RegExp(`branch ${branch} already exists`),
    );
    assert.equal(await exists(worktreePath(p.vcs, p.repo, p.folder001)), false);
  });

  it('refuses an approved dependency that has not landed', async () => {
    const p = await makeProject();
    const proposalPath = path.join(p.spec002, 'proposal.md');
    const content = await fs.readFile(proposalPath, 'utf8');
    await fs.writeFile(
      proposalPath,
      content.replace(/^depends_on:.*$/m, 'depends_on: ["001"]'),
      'utf8',
    );

    await approveSpec(p.repo, '001', p.config);

    await assert.rejects(
      approveSpec(p.repo, '002', p.config),
      /depends on 001-order-flow, which is approved and has not landed; approve this change after it lands/,
    );
  });

  it('approves in the checkout when vcs is off', async () => {
    const p = await makeProject();
    const config = defineConfig({});

    const result = await approveSpec(p.repo, '001', config);

    assert.equal(result.worktreePath, undefined);
    assert.equal(await readRun(p.spec001, 'approved'), result.hash);
    assert.equal(await git(['branch', '--format=%(refname:short)', '--list', 'osq/*'], p.repo), '');
  });

  it('registers --confirm, --base-ok, and --ignore-dirty on osq approve', () => {
    const program = createProgram();
    const approve = program.commands.find((command) => command.name() === 'approve');
    assert.ok(approve);
    const longs = approve.options.map((option) => option.long);
    assert.ok(longs.includes('--confirm'));
    assert.ok(longs.includes('--base-ok'));
    assert.ok(longs.includes('--ignore-dirty'));
  });
});
