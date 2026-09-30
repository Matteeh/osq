import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { knownChangeFolders } from '../src/core/foundation/change-number.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { lintChangeFolder } from '../src/core/spec/linter.js';
import { worktreePath } from '../src/core/vcs/worktree.js';

const execFileAsync = promisify(execFile);

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

/** A fake pinned openspec validator so lint never touches the network. */
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

interface Repo {
  root: string;
  repo: string;
  worktrees: string;
  config: OsqConfig;
  vcs: VcsConfig;
}

/** A committed temp repository with `vcs.enabled` on and a worktree root. */
async function makeRepo(): Promise<Repo> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-change-number-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await fs.mkdir(worktrees, { recursive: true });

  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  return { root, repo, worktrees, config: defineConfig({ vcs }), vcs };
}

/** Move a change folder into the checkout's archive directory. */
async function archiveChange(repo: string, folderPath: string): Promise<void> {
  const archive = path.join(repo, 'openspec', 'changes', 'archive');
  await fs.mkdir(archive, { recursive: true });
  await fs.rename(folderPath, path.join(archive, path.basename(folderPath)));
}

/** Create a worktree on `osq/<folder>` holding an approved copy of `folderPath`. */
async function copyIntoWorktree(p: Repo, folderPath: string): Promise<void> {
  const folder = path.basename(folderPath);
  const wtPath = worktreePath(p.vcs, p.repo, folder);
  await git(['worktree', 'add', '-q', '-b', `osq/${folder}`, wtPath], p.repo);
  const changes = path.join(wtPath, 'openspec', 'changes', folder);
  await fs.cp(folderPath, changes, { recursive: true });
  await fs.mkdir(path.join(changes, '.run'), { recursive: true });
  await fs.writeFile(path.join(changes, '.run', 'approved'), 'approved', 'utf8');
  await fs.rm(folderPath, { recursive: true, force: true });
}

async function writeStackedApproval(p: Repo, folder: string): Promise<void> {
  const stacked = path.join(p.worktrees, path.basename(p.repo), '.stacked', folder);
  const run = path.join(stacked, 'openspec', 'changes', folder, '.run');
  await fs.mkdir(run, { recursive: true });
  await fs.writeFile(path.join(run, 'approved'), 'approved', 'utf8');
}

describe('Change numbers across trees', () => {
  it('Running change keeps its number', async () => {
    const p = await makeRepo();
    const one = await createNewSpec(p.repo, 'Alpha');
    const two = await createNewSpec(p.repo, 'Beta');
    await archiveChange(p.repo, one.folderPath);
    await archiveChange(p.repo, two.folderPath);

    const three = await createNewSpec(p.repo, 'Gamma');
    assert.equal(three.specId, '003');
    await copyIntoWorktree(p, three.folderPath);

    const next = await createNewSpec(p.repo, 'Next', { config: p.config });
    assert.equal(next.specId, '004');
    assert.equal(next.folderName, '004-next');
  });

  it('Stacked change keeps its number', async () => {
    const p = await makeRepo();
    await createNewSpec(p.repo, 'Alpha');
    await createNewSpec(p.repo, 'Beta');
    await createNewSpec(p.repo, 'Gamma');
    await writeStackedApproval(p, '004-delta');

    const next = await createNewSpec(p.repo, 'Next', { config: p.config });
    assert.equal(next.specId, '005');
  });

  it('Rejected branch keeps its number', async () => {
    const p = await makeRepo();
    await createNewSpec(p.repo, 'Alpha');
    await git(['branch', 'osq/006-f'], p.repo);
    await git(['branch', 'osq/006-f-rejected-1'], p.repo);

    const folders = await knownChangeFolders(p.repo, p.config);
    assert.ok(folders.includes('006-f'), `expected 006-f in ${folders.join(', ')}`);

    const next = await createNewSpec(p.repo, 'Next', { config: p.config });
    assert.equal(next.specId, '007');
  });

  it('Version control off', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-change-number-off-'));
    tmpDirs.push(root);
    await scaffoldProject(root);
    const one = await createNewSpec(root, 'Alpha');
    const two = await createNewSpec(root, 'Beta');
    assert.equal(one.specId, '001');
    await archiveChange(root, two.folderPath);

    const config = defineConfig({ vcs: { enabled: false } });
    const next = await createNewSpec(root, 'Next', { config });
    assert.equal(next.specId, '003');
  });
});

function dependencyFinding(result: { findings: readonly { message: string }[] }, needle: string) {
  return result.findings.find((finding) => finding.message.includes(needle));
}

describe('Change references across trees', () => {
  it('Depends on a running change', async () => {
    const p = await makeRepo();
    const one = await createNewSpec(p.repo, 'Alpha');
    await copyIntoWorktree(p, one.folderPath);

    const draft = await createNewSpec(p.repo, 'Draft', {
      config: p.config,
      dependsOn: ['001'],
    });
    const result = await lintChangeFolder(p.repo, draft.folderPath, p.config);
    assert.equal(dependencyFinding(result, 'depends_on names missing change'), undefined);
  });

  it('Fixes a change rejected on its branch', async () => {
    const p = await makeRepo();
    await git(['branch', 'osq/003-c'], p.repo);

    const draft = await createNewSpec(p.repo, 'Draft', { config: p.config, fixes: ['3'] });
    const result = await lintChangeFolder(p.repo, draft.folderPath, p.config);
    assert.equal(dependencyFinding(result, 'fixes names missing change'), undefined);
  });

  it('Still missing', async () => {
    const p = await makeRepo();
    const draft = await createNewSpec(p.repo, 'Draft', {
      config: p.config,
      dependsOn: ['099'],
    });
    const result = await lintChangeFolder(p.repo, draft.folderPath, p.config);
    assert.ok(
      result.findings.some((finding) => finding.message === 'depends_on names missing change: 099'),
    );
  });
});
