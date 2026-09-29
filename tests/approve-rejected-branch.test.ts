import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { approveCommand } from '../src/cli/approve.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
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
}

/** A committed temp repository with one uncommitted change draft. */
async function makeProject(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-approve-rejected-'));
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
  await installLocalVerifier(repo, one.folderPath);

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({ vcs });
  return { root, repo, worktrees, config, vcs, folder001: one.folderName, spec001: one.folderPath };
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

/** The repository-relative path of a rejected change's record. */
function rejectedRecordPath(p: Project): string {
  return `openspec/changes/rejected/${p.folder001}/.run/rejected.md`;
}

/**
 * Build `osq/<folder>` with one commit whose tip holds the change's rejection
 * record. `keepWorktree` leaves the branch checked out in a no-checkout
 * worktree, so osq still finds the checkout's active draft.
 */
async function createRejectedBranch(p: Project, keepWorktree = false): Promise<string> {
  const branch = worktreeBranch(p.folder001);
  const build = path.join(p.root, `.build-${p.folder001}`);
  await git(['worktree', 'add', '-q', '-b', branch, build], p.repo);
  const recordDir = path.join(build, 'openspec', 'changes', 'rejected', p.folder001, '.run');
  await fs.mkdir(recordDir, { recursive: true });
  await fs.writeFile(path.join(recordDir, 'rejected.md'), 'rejected\n', 'utf8');
  await git(['add', '-A'], build);
  await git(['commit', '-qm', 'osq: reject'], build);
  const tip = await git(['rev-parse', branch], p.repo);
  await git(['worktree', 'remove', build], p.repo);
  if (keepWorktree) {
    const checkedOut = path.join(p.root, `.checked-out-${p.folder001}`);
    await git(['worktree', 'add', '--no-checkout', checkedOut, branch], p.repo);
  }
  return tip;
}

describe('approve reclaims a rejected branch', () => {
  it('renames a rejected branch aside and approves a fresh one', async () => {
    const p = await makeProject();
    const branch = worktreeBranch(p.folder001);
    const oldTip = await createRejectedBranch(p);

    const result = await approveSpec(p.repo, '001', p.config);

    assert.equal(result.keptBranch, `${branch}-rejected-1`);
    assert.equal(result.branch, branch);
    assert.equal(await git(['rev-parse', `${branch}-rejected-1`], p.repo), oldTip);
    assert.equal(await git(['log', '--format=%s', '-1', branch], p.repo), 'osq: 001 approved');
    assert.equal(
      await git(['show', `${branch}:${rejectedRecordPath(p)}`], p.repo).catch(() => null),
      null,
      'the fresh branch must not carry the rejection record',
    );
  });

  it('refuses when the rejected branch is checked out and renames nothing', async () => {
    const p = await makeProject();
    const branch = worktreeBranch(p.folder001);
    const oldTip = await createRejectedBranch(p, true);

    await assert.rejects(
      approveSpec(p.repo, '001', p.config),
      new RegExp(`branch ${branch} already exists`),
    );
    assert.equal(await git(['rev-parse', branch], p.repo), oldTip);
    assert.equal(await exists(worktreePath(p.vcs, p.repo, p.folder001)), false);
    assert.equal(
      await git(['branch', '--list', '--format=%(refname:short)', `${branch}-rejected-*`], p.repo),
      '',
    );
  });

  it('uses the lowest free kept name', async () => {
    const p = await makeProject();
    const branch = worktreeBranch(p.folder001);
    await git(['branch', `${branch}-rejected-1`, 'main'], p.repo);
    const oldTip = await createRejectedBranch(p);

    const result = await approveSpec(p.repo, '001', p.config);

    assert.equal(result.keptBranch, `${branch}-rejected-2`);
    assert.equal(await git(['rev-parse', `${branch}-rejected-2`], p.repo), oldTip);
    assert.equal(await git(['log', '--format=%s', '-1', branch], p.repo), 'osq: 001 approved');
  });

  it('prints the kept branch after the hash line', async () => {
    const p = await makeProject();
    const branch = worktreeBranch(p.folder001);
    await createRejectedBranch(p);
    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    try {
      await approveCommand(['001'], {
        cwd: p.repo,
        config: p.config,
        planningReaders: [],
        isTerminal: () => false,
      });
    } finally {
      console.log = original;
    }

    const hashIndex = logs.findIndex((line) => line.startsWith('  Hash: '));
    assert.ok(hashIndex >= 0, `no hash line in ${JSON.stringify(logs)}`);
    assert.equal(logs[hashIndex + 1], `  Kept rejected branch: ${branch}-rejected-1`);
  });
});
