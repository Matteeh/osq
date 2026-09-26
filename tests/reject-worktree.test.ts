import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { rejectCommand } from '../src/cli/reject.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { rejectSpec } from '../src/core/lifecycle/reject.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { recreateWorktrees } from '../src/core/vcs/worktree-recreate.js';
import { stackedPath, worktreePath } from '../src/core/vcs/worktree.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);

const CHANGES = path.join('openspec', 'changes');
const LOCAL_VERIFIER = "require('node:fs').existsSync('openspec') || process.exit(1);\n";

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
  return fs.access(target).then(
    () => true,
    () => false,
  );
}

/** Whether a ref holds a file or directory at the given repository-relative path. */
async function branchHas(repo: string, ref: string, rel: string): Promise<boolean> {
  return execFileAsync('git', ['cat-file', '-e', `${ref}:${rel}`], {
    cwd: repo,
    env: cleanGitEnv(),
  }).then(
    () => true,
    () => false,
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

/** Capture every line `console.log` and `console.error` receive during `run`. */
async function captureLogs(run: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  try {
    await run();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return lines;
}

interface Project {
  readonly root: string;
  readonly repo: string;
  readonly worktrees: string;
  readonly config: OsqConfig;
  readonly vcs: VcsConfig;
}

interface ChangeInfo {
  readonly folderName: string;
  readonly folderPath: string;
  readonly worktree: string;
  readonly worktreeFolder: string;
}

/** A committed temp repository with vcs enabled and a local verifier. */
async function makeProject(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-reject-worktree-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });

  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
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

/** Add one change with its verifier patched, and return its paths. */
async function addChange(
  project: Project,
  title: string,
  dependsOn?: readonly string[],
): Promise<ChangeInfo> {
  const spec = await createNewSpec(project.repo, title, {
    ...(dependsOn !== undefined ? { dependsOn } : {}),
  });
  for (const rel of ['proposal.md', path.join('tasks', '1.md')]) {
    const target = path.join(spec.folderPath, rel);
    const content = await fs.readFile(target, 'utf8').catch(() => null);
    if (content !== null) {
      await fs.writeFile(
        target,
        content.replace(/^verify:.*$/m, 'verify: node verify.cjs'),
        'utf8',
      );
    }
  }
  const worktree = worktreePath(project.vcs, project.repo, spec.folderName);
  return {
    folderName: spec.folderName,
    folderPath: spec.folderPath,
    worktree,
    worktreeFolder: path.join(worktree, path.relative(project.repo, spec.folderPath)),
  };
}

/** Write an active dead marker into a change folder. */
async function writeDead(folderPath: string): Promise<void> {
  const dir = path.join(folderPath, '.run', 'dead');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, '1.md'), '---\nreason: verify_red\n---\ndead\n', 'utf8');
}

/** Write a change-level regression, as a halted stacked change has. */
async function writeRegressedChange(folderPath: string): Promise<void> {
  const dir = path.join(folderPath, '.run', 'regressed');
  await fs.mkdir(dir, { recursive: true });
  const marker = '---\nreason: dependency_changed\n---\n001-one was rejected\n';
  await fs.writeFile(path.join(dir, 'change.md'), marker, 'utf8');
}

/** Approve one change into a worktree and return its info. */
async function approvedWorktree(title: string): Promise<{ project: Project; change: ChangeInfo }> {
  const project = await makeProject();
  const change = await addChange(project, title);
  await approveSpec(project.repo, '001', project.config);
  return { project, change };
}

describe('rejection under version control', () => {
  it('removes a clean worktree after committing the rejection', async () => {
    const { project, change } = await approvedWorktree('Reject Target');
    await writeDead(change.worktreeFolder);
    const before = await snapshotTree(change.folderPath);

    const result = await rejectSpec(project.repo, '001', 'stop', project.config);

    const branch = `osq/${change.folderName}`;
    const rejectedRel = path.posix.join(CHANGES, 'rejected', change.folderName);
    assert.equal(result.branch, branch);
    assert.equal(result.worktree?.removed, true);
    assert.equal(result.worktree?.path, change.worktree);
    assert.equal(await exists(change.worktree), false);
    assert.equal(await exists(change.worktreeFolder), false);

    assert.equal(
      await git(['log', '-1', '--format=%s', branch], project.repo),
      'osq: 001 rejected',
    );
    const body = await git(['log', '-1', '--format=%B', branch], project.repo);
    assert.match(body, /stop/);
    assert.match(body, new RegExp(`rejected to ${rejectedRel}`));
    assert.match(body, new RegExp(`Osq-Change: ${change.folderName}`));

    assert.match(
      await git(['show', `${branch}:${rejectedRel}/proposal.md`], project.repo),
      /Reject Target/,
    );
    assert.match(
      await git(['show', `${branch}:${rejectedRel}/.run/rejected.md`], project.repo),
      /stop/,
    );
    assert.equal(
      await branchHas(project.repo, branch, path.posix.join(CHANGES, change.folderName)),
      false,
    );
    assert.ok(
      !(await git(['worktree', 'list', '--porcelain'], project.repo)).includes(change.worktree),
    );
    assertSameTree(before, await snapshotTree(change.folderPath), "checkout's copy");
  });

  it('keeps a worktree whose changes lie outside the rejected change', async () => {
    const { project, change } = await approvedWorktree('Reject Target');
    await writeDead(change.worktreeFolder);
    await fs.writeFile(path.join(change.worktree, 'dirty.txt'), 'kept\n', 'utf8');

    const result = await rejectSpec(project.repo, '001', 'stop', project.config);

    const branch = `osq/${change.folderName}`;
    assert.equal(result.worktree?.removed, false);
    assert.equal(typeof result.worktree?.why, 'string');
    assert.equal(await exists(change.worktree), true);
    assert.equal(await exists(path.join(change.worktree, 'dirty.txt')), true);
    assert.equal(
      await git(['log', '-1', '--format=%s', branch], project.repo),
      'osq: 001 rejected',
    );
    assert.equal(await branchHas(project.repo, branch, 'dirty.txt'), false);
  });

  it('never recreates the worktree of a rejected change', async () => {
    const { project, change } = await approvedWorktree('Reject Target');
    await writeDead(change.worktreeFolder);

    await rejectSpec(project.repo, '001', 'stop', project.config);

    const lines = await recreateWorktrees(project.repo, project.config);
    assert.deepEqual(lines, []);
    assert.equal(await exists(change.worktree), false);
  });

  it('withdraws a halted stacked approval without moving the checkout copy', async () => {
    const project = await makeProject();
    await addChange(project, 'One');
    const two = await addChange(project, 'Two', ['001']);
    await approveSpec(project.repo, '001', project.config);
    const stacked = await approveSpec(project.repo, '002', project.config);
    assert.equal(typeof stacked.stackedPath, 'string');
    const stackedRoot = stackedPath(project.vcs, project.repo, two.folderName);
    const stackedCopy = path.join(stackedRoot, path.relative(project.repo, two.folderPath));
    await writeRegressedChange(stackedCopy);
    const before = await snapshotTree(two.folderPath);

    const result = await rejectSpec(project.repo, '002', 'stop', project.config);

    assert.equal(result.stackedPath, stackedRoot);
    assert.equal(result.branch, undefined);
    assert.equal(result.worktree, undefined);
    assert.equal(await exists(stackedRoot), false);
    assert.equal(await git(['branch', '--list', `osq/${two.folderName}`], project.repo), '');
    assertSameTree(before, await snapshotTree(two.folderPath), "checkout's copy");
  });

  it('refuses a healthy stacked approval and leaves it in place', async () => {
    const project = await makeProject();
    await addChange(project, 'One');
    const two = await addChange(project, 'Two', ['001']);
    await approveSpec(project.repo, '001', project.config);
    await approveSpec(project.repo, '002', project.config);
    const stackedRoot = stackedPath(project.vcs, project.repo, two.folderName);

    await assert.rejects(
      () => rejectSpec(project.repo, '002', 'no reason', project.config),
      /healthy/i,
    );
    assert.equal(await exists(stackedRoot), true);
  });
});

describe('osq reject output with version control', () => {
  it('prints the removed worktree, the kept branch, and no destination', async () => {
    const { project, change } = await approvedWorktree('Reject Target');
    await writeDead(change.worktreeFolder);

    const lines = await captureLogs(() =>
      rejectCommand('001', { cwd: project.repo, config: project.config, reason: 'stop' }),
    );

    assert.ok(lines.includes(`  Worktree removed: ${change.worktree}`));
    assert.ok(lines.includes(`  Branch kept: osq/${change.folderName}`));
    assert.equal(
      lines.some((line) => line.startsWith('  Destination: ')),
      false,
    );
  });

  it('prints the kept worktree and why', async () => {
    const { project, change } = await approvedWorktree('Reject Target');
    await writeDead(change.worktreeFolder);
    await fs.writeFile(path.join(change.worktree, 'dirty.txt'), 'kept\n', 'utf8');

    const lines = await captureLogs(() =>
      rejectCommand('001', { cwd: project.repo, config: project.config, reason: 'stop' }),
    );

    const kept = lines.find((line) => line.startsWith('  Worktree kept: '));
    assert.ok(kept?.startsWith(`  Worktree kept: ${change.worktree} (`));
    assert.ok(lines.includes(`  Branch kept: osq/${change.folderName}`));
  });

  it('prints the withdrawn stacked approval instead of a destination', async () => {
    const project = await makeProject();
    await addChange(project, 'One');
    const two = await addChange(project, 'Two', ['001']);
    await approveSpec(project.repo, '001', project.config);
    await approveSpec(project.repo, '002', project.config);
    const stackedRoot = stackedPath(project.vcs, project.repo, two.folderName);
    await writeRegressedChange(path.join(stackedRoot, path.relative(project.repo, two.folderPath)));

    const lines = await captureLogs(() =>
      rejectCommand('002', { cwd: project.repo, config: project.config, reason: 'stop' }),
    );

    assert.ok(lines.includes(`  Withdrew stacked approval: ${stackedRoot}`));
    assert.equal(
      lines.some((line) => line.startsWith('  Destination: ')),
      false,
    );
  });

  it('prints the destination unchanged when vcs is off', async () => {
    const project = await makeProject();
    const change = await addChange(project, 'Reject Target');
    const off = defineConfig({});

    const lines = await captureLogs(() =>
      rejectCommand('001', { cwd: project.repo, config: off, reason: 'stop' }),
    );

    const destination = path.join(project.repo, CHANGES, 'rejected', change.folderName);
    assert.ok(lines.includes(`  Destination: ${destination}`));
    assert.equal(
      lines.some((line) => line.includes('Worktree') || line.includes('stacked approval')),
      false,
    );
  });
});
