import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { watchCommand } from '../src/cli/watch.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { changesDirLabel } from '../src/core/status/change-locations.js';
import { selectVcs } from '../src/core/vcs/select.js';
import { recreateWorktrees } from '../src/core/vcs/worktree-recreate.js';
import { worktreePath } from '../src/core/vcs/worktree.js';
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

async function exists(target: string): Promise<boolean> {
  return fs.stat(target).then(
    () => true,
    () => false,
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Run `fn` with the current directory set to `dir`, then restore it. */
async function inDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

/** Run `fn` while capturing everything written to stderr. */
async function captureStderr(fn: () => Promise<void>): Promise<string> {
  const stream = process.stderr;
  const original = stream.write.bind(stream);
  const chunks: string[] = [];
  stream.write = ((chunk: string | Uint8Array): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof stream.write;
  try {
    await fn();
  } finally {
    stream.write = original;
  }
  return chunks.join('');
}

async function writeConfig(repo: string, worktrees: string, enabled: boolean): Promise<void> {
  await fs.writeFile(
    path.join(repo, 'osq.config.ts'),
    [
      'export default {',
      "  harness: 'mock',",
      "  gates: { preSpawnVerify: 'off' },",
      `  vcs: { enabled: ${String(enabled)}, author: 'Osq <osq@example.invalid>', worktreeRoot: ${JSON.stringify(worktrees)} },`,
      '};',
      '',
    ].join('\n'),
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
  readonly root: string;
  readonly repo: string;
  readonly worktrees: string;
  readonly vcs: VcsConfig;
  readonly config: OsqConfig;
  readonly folder: string;
  readonly worktree: string;
}

/** A committed temp repository with one change draft and a worktree root. */
async function makeProject(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-wt-recreate-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await fs.mkdir(worktrees, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n', 'utf8');

  const created = await createNewSpec(repo, 'Order Flow');
  await installLocalVerifier(repo, created.folderPath);

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({ harness: 'mock', vcs, gates: { preSpawnVerify: 'off' } });
  await writeConfig(repo, worktrees, true);

  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  return {
    root,
    repo,
    worktrees,
    vcs,
    config,
    folder: created.folderName,
    worktree: worktreePath(vcs, repo, created.folderName),
  };
}

/** A temporary repository with a local identity and one seed commit. */
async function makeRepo(): Promise<{ repo: string; config: OsqConfig }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-wt-port-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  await fs.mkdir(repo, { recursive: true });
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await fs.writeFile(path.join(repo, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);
  const config = defineConfig({
    vcs: { enabled: true, author: 'Osq <osq@example.invalid>' },
  });
  return { repo, config };
}

describe('File at a branch', () => {
  it('shows a file at a ref and returns null when the ref lacks it', async () => {
    const { repo, config } = await makeRepo();
    const vcs = await selectVcs(repo, config);
    await vcs.createBranch('osq/001-a', 'main');
    const wt = path.join(path.dirname(repo), 'wt-001');
    await vcs.worktreeAdd(wt, 'osq/001-a');
    await fs.writeFile(path.join(wt, 'notes.txt'), 'hello', 'utf8');
    await git(['add', '-A'], wt);
    await git(['commit', '-qm', 'notes'], wt);

    assert.equal(await vcs.show('osq/001-a', 'notes.txt'), 'hello');
    assert.equal(await vcs.show('osq/001-a', 'missing.txt'), null);
    assert.equal(await vcs.show('main', 'notes.txt'), null);
  });
});

describe('Prune a deleted worktree', () => {
  it('drops only the record whose directory is gone', async () => {
    const { repo, config } = await makeRepo();
    const vcs = await selectVcs(repo, config);
    await vcs.createBranch('osq/001-a', 'main');
    await vcs.createBranch('osq/002-b', 'main');
    const wtA = path.join(path.dirname(repo), 'wt-a');
    const wtB = path.join(path.dirname(repo), 'wt-b');
    await vcs.worktreeAdd(wtA, 'osq/001-a');
    await vcs.worktreeAdd(wtB, 'osq/002-b');
    await fs.rm(wtA, { recursive: true, force: true });

    assert.ok((await vcs.worktreeList()).some((tree) => tree.branch === 'osq/001-a'));
    await vcs.worktreePrune();

    const listed = await vcs.worktreeList();
    assert.ok(!listed.some((tree) => tree.branch === 'osq/001-a'));
    assert.ok(listed.some((tree) => tree.branch === 'osq/002-b'));
    assert.equal(await exists(wtB), true);
  });
});

describe('Worktree recreation', () => {
  it('recreates a deleted worktree directory and runs the change there', async () => {
    const p = await makeProject();
    await approveSpec(p.repo, '001', p.config);
    assert.equal(await exists(p.worktree), true);
    await fs.rm(p.worktree, { recursive: true, force: true });

    const vcs = await selectVcs(p.repo, p.config);
    assert.ok((await vcs.worktreeList()).some((tree) => tree.path === p.worktree));

    const output = await captureStderr(() =>
      inDir(p.repo, () => watchCommand({ once: true, allowStale: true })),
    );

    assert.equal(await exists(p.worktree), true);
    assert.match(
      output,
      new RegExp(`recreated worktree ${escapeRegExp(p.worktree)} for ${escapeRegExp(p.folder)}`),
    );
    assert.equal(await git(['rev-parse', '--abbrev-ref', 'HEAD'], p.worktree), `osq/${p.folder}`);
    assert.match(await git(['log', '--format=%s'], p.worktree), /osq: 001 task 1 verified/);
  });

  it('recreates a worktree removed with git worktree remove', async () => {
    const p = await makeProject();
    await approveSpec(p.repo, '001', p.config);
    await git(['worktree', 'remove', p.worktree], p.repo);
    assert.equal(await exists(p.worktree), false);

    await inDir(p.repo, () => watchCommand({ once: true, allowStale: true }));

    assert.equal(await exists(p.worktree), true);
    assert.equal(await git(['rev-parse', '--abbrev-ref', 'HEAD'], p.worktree), `osq/${p.folder}`);
  });

  it('creates no worktree for an osq branch whose change is archived', async () => {
    const p = await makeProject();
    await git(['branch', 'osq/002-archived'], p.repo);
    const archiveWt = path.join(p.root, 'archive-wt');
    await git(['worktree', 'add', archiveWt, 'osq/002-archived'], p.repo);
    const archiveFolder = path.join(
      archiveWt,
      changesDirLabel(p.config),
      'archive',
      '002-archived',
    );
    await fs.mkdir(archiveFolder, { recursive: true });
    await fs.writeFile(
      path.join(archiveFolder, 'proposal.md'),
      '---\ntitle: Archived\n---\n',
      'utf8',
    );
    await git(['add', '-A'], archiveWt);
    await git(['commit', '-qm', 'archive'], archiveWt);
    await git(['worktree', 'remove', archiveWt], p.repo);

    await inDir(p.repo, () => watchCommand({ once: true, allowStale: true }));

    assert.equal(await exists(worktreePath(p.vcs, p.repo, '002-archived')), false);
  });

  it('does nothing when git is unavailable', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-wt-recreate-none-'));
    tmpDirs.push(root);
    const config = defineConfig({
      vcs: { enabled: true, author: 'Osq <osq@example.invalid>' },
    });

    assert.deepEqual(await recreateWorktrees(root, config), []);
  });

  it('creates no worktree when vcs is disabled', async () => {
    const p = await makeProject();
    await approveSpec(p.repo, '001', p.config);
    await git(['worktree', 'remove', p.worktree], p.repo);
    await writeConfig(p.repo, p.worktrees, false);

    await inDir(p.repo, () => watchCommand({ once: true, allowStale: true }));

    assert.equal(await exists(p.worktree), false);
  });
});
