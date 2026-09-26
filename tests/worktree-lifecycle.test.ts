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
import { markTaskDoneManual } from '../src/core/lifecycle/done.js';
import { rejectSpec } from '../src/core/lifecycle/reject.js';
import { retrySpec } from '../src/core/lifecycle/retry.js';
import { acquireLock, releaseLock } from '../src/core/run/lock.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';
import { formatStatusOverview, getStatusOverview } from '../src/core/status/status.js';
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
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

/** Replace the seeded planning sentinel with a real local verifier command. */
async function installVerifier(root: string, folderPath: string, command: string): Promise<void> {
  await fs.writeFile(path.join(root, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  for (const rel of ['proposal.md', path.join('tasks', '1.md')]) {
    const target = path.join(folderPath, rel);
    const content = await fs.readFile(target, 'utf8').catch(() => null);
    if (content === null) continue;
    await fs.writeFile(target, content.replace(/^verify:.*$/m, `verify: ${command}`), 'utf8');
  }
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

interface Project {
  repo: string;
  config: OsqConfig;
  vcs: VcsConfig;
  folderName: string;
  checkoutFolder: string;
  worktree: string;
  worktreeFolder: string;
}

interface ApprovedOptions {
  readonly taskVerify?: string;
  readonly taskScope?: string;
}

/** A committed temp repository with one draft approved into a worktree. */
async function makeApprovedProject(options: ApprovedOptions = {}): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-worktree-lifecycle-'));
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

  const spec = await createNewSpec(repo, 'Order Flow');
  await installVerifier(repo, spec.folderPath, options.taskVerify ?? PASSING_VERIFY);
  if (options.taskScope) {
    const taskPath = path.join(spec.folderPath, 'tasks', '1.md');
    const content = await fs.readFile(taskPath, 'utf8');
    await fs.writeFile(
      taskPath,
      content.replace(/^scope:.*$/m, `scope:\n  - ${options.taskScope}`),
      'utf8',
    );
  }

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({ vcs });
  await approveSpec(repo, '001', config);

  const worktree = worktreePath(vcs, repo, spec.folderName);
  return {
    repo,
    config,
    vcs,
    folderName: spec.folderName,
    checkoutFolder: spec.folderPath,
    worktree,
    worktreeFolder: path.join(worktree, path.relative(repo, spec.folderPath)),
  };
}

async function writeRegressed(folderPath: string, taskNumber: string, content: string) {
  const dir = path.join(folderPath, '.run', 'regressed');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${taskNumber}.md`), content, 'utf8');
}

describe('lifecycle commands in a worktree', () => {
  it('reject moves the change inside the worktree and leaves the checkout untouched', async () => {
    const p = await makeApprovedProject();
    const deadDir = path.join(p.worktreeFolder, '.run', 'dead');
    await fs.mkdir(deadDir, { recursive: true });
    await fs.writeFile(path.join(deadDir, '1.md'), '---\nreason: verify_red\n---\ndead\n', 'utf8');

    const before = await snapshotTree(p.checkoutFolder);
    const checkoutRejected = path.join(p.repo, 'openspec', 'changes', 'rejected');
    const checkoutRejectedBefore = await exists(checkoutRejected);

    const result = await rejectSpec(p.repo, '001', 'stop', p.config);

    const worktreeRejected = path.join(p.worktree, 'openspec', 'changes', 'rejected', p.folderName);
    assert.equal(result.destinationPath, worktreeRejected);
    assert.equal(await exists(path.join(p.worktreeFolder, 'proposal.md')), false);
    assert.equal(await exists(path.join(worktreeRejected, 'proposal.md')), true);
    assert.equal(await exists(path.join(worktreeRejected, '.run', 'rejected.md')), true);
    assert.equal(await exists(checkoutRejected), checkoutRejectedBefore);
    assertSameTree(before, await snapshotTree(p.checkoutFolder), "checkout's copy");
  });

  it('retry recertifies the task in the worktree scope and root', async () => {
    const p = await makeApprovedProject({
      taskVerify: 'node wt-verify.cjs',
      taskScope: 'src/app.ts',
    });
    // The scope file and the verifier exist only in the worktree.
    await fs.mkdir(path.join(p.worktree, 'src'), { recursive: true });
    await fs.writeFile(path.join(p.worktree, 'src', 'app.ts'), 'export const value = 1;\n', 'utf8');
    await fs.writeFile(
      path.join(p.worktree, 'wt-verify.cjs'),
      "require('node:fs').writeFileSync('recert-ran.txt','worktree');\nprocess.exit(0);\n",
      'utf8',
    );
    // A stale done record and an active scope regression on task 1.
    const doneDir = path.join(p.worktreeFolder, '.run', 'done');
    await fs.mkdir(doneDir, { recursive: true });
    await fs.writeFile(
      path.join(doneDir, '1'),
      '---\nscope_hash: "sha256:stale"\nscope_files: {}\nscope_resolver: 2\n---\n',
      'utf8',
    );
    await writeRegressed(
      p.worktreeFolder,
      '1',
      [
        '---',
        'reason: scope_regression',
        'task: "1"',
        'attribution: []',
        '---',
        'Task 1 scope changed after completion:',
        '- src/app.ts (modified)',
        '',
        'no output',
        '',
      ].join('\n'),
    );

    const before = await snapshotTree(p.checkoutFolder);
    const result = await retrySpec(p.repo, '001', '1', p.config);

    assert.equal(result.recertification, 'passed');
    assert.equal(await exists(path.join(p.worktree, 'recert-ran.txt')), true);
    assert.equal(await exists(path.join(p.repo, 'recert-ran.txt')), false);
    const refreshed = parseFrontmatter(await fs.readFile(path.join(doneDir, '1'), 'utf8')).data;
    const scopeFiles = refreshed.scope_files as Record<string, string | null>;
    assert.match(scopeFiles['src/app.ts'] ?? '', /^sha256:/);
    assertSameTree(before, await snapshotTree(p.checkoutFolder), "checkout's copy");
  });

  it('manual done writes the marker in the worktree and not in the checkout', async () => {
    const p = await makeApprovedProject();
    const before = await snapshotTree(p.checkoutFolder);

    const result = await markTaskDoneManual(p.repo, '001', '1', 'human says done', p.config);

    assert.equal(result.folderPath, p.worktreeFolder);
    assert.equal(await exists(path.join(p.worktreeFolder, '.run', 'done', '1')), true);
    assert.equal(await exists(path.join(p.checkoutFolder, '.run', 'done', '1')), false);
    assertSameTree(before, await snapshotTree(p.checkoutFolder), "checkout's copy");
  });
});

describe('task running in the worktree', () => {
  it('warns below the worktree line while a live lock exists and not after', async () => {
    const p = await makeApprovedProject();
    const runDir = path.join(p.worktreeFolder, '.run');
    await acquireLock(runDir, '1');

    const before = await snapshotTree(p.checkoutFolder);
    const formatted = formatStatusOverview(await getStatusOverview(p.repo, p.config));

    const heading = `${p.folderName}: Order Flow [`;
    const index = formatted.indexOf(heading);
    assert.notEqual(index, -1);
    const lines = formatted.slice(index).split('\n');
    assert.match(lines[1], /^ {2}worktree: /);
    assert.equal(
      lines[2],
      '  warning: a task is running in this worktree; do not edit it until the task ends',
    );

    await releaseLock(runDir, '1');
    const after = formatStatusOverview(await getStatusOverview(p.repo, p.config));
    assert.ok(!after.includes('warning: a task is running in this worktree'));
    assertSameTree(before, await snapshotTree(p.checkoutFolder), "checkout's copy");
  });
});
