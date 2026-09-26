import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { statusCommand } from '../src/cli/status.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
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
  repo: string;
  config: OsqConfig;
  vcs: VcsConfig;
  folderName: string;
  checkoutFolder: string;
  worktree: string;
}

/** A committed temp repository with one draft approved into a worktree. */
async function makeApprovedProject(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-status-worktree-'));
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
  await installLocalVerifier(repo, spec.folderPath);

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({ vcs });
  await approveSpec(repo, '001', config);

  return {
    repo,
    config,
    vcs,
    folderName: spec.folderName,
    checkoutFolder: spec.folderPath,
    worktree: worktreePath(vcs, repo, spec.folderName),
  };
}

describe('osq status with a change in a worktree', () => {
  it('prints the worktree path directly below the change heading', async () => {
    const p = await makeApprovedProject();

    let captured = '';
    await statusCommand({
      cwd: p.repo,
      config: p.config,
      stdout: (msg) => {
        captured = msg;
      },
    });

    const overview = await getStatusOverview(p.repo, p.config);
    const worktree = overview.worktrees?.[p.folderName];
    assert.ok(worktree);
    assert.equal(await fs.realpath(worktree.path), await fs.realpath(p.worktree));
    assert.equal(worktree.checkoutChanged, false);

    const heading = `${p.folderName}: Order Flow [`;
    const index = captured.indexOf(heading);
    assert.notEqual(index, -1);
    const afterHeading = captured.slice(index).split('\n');
    assert.match(afterHeading[1], /^ {2}worktree: /);
    assert.equal(
      await fs.realpath(afterHeading[1].slice('  worktree: '.length)),
      await fs.realpath(p.worktree),
    );
    assert.ok(!captured.includes('warning:'));
  });

  it('warns when the checkout copy changed after approval', async () => {
    const p = await makeApprovedProject();
    await fs.appendFile(path.join(p.checkoutFolder, 'tasks', '1.md'), '\nedited\n', 'utf8');

    const overview = await getStatusOverview(p.repo, p.config);
    assert.equal(overview.worktrees?.[p.folderName]?.checkoutChanged, true);

    const formatted = formatStatusOverview(overview);
    assert.ok(
      formatted.includes(
        `  warning: the checkout's copy of ${p.folderName} changed since approval; edits there never reach the run`,
      ),
    );
  });

  it('prints no warning when the checkout copy is untouched', async () => {
    const p = await makeApprovedProject();

    const overview = await getStatusOverview(p.repo, p.config);

    assert.equal(overview.worktrees?.[p.folderName]?.checkoutChanged, false);
    assert.ok(!formatStatusOverview(overview).includes('warning:'));
  });

  it('prints no warning when the checkout copy is missing', async () => {
    const p = await makeApprovedProject();
    await fs.rm(p.checkoutFolder, { recursive: true, force: true });

    const overview = await getStatusOverview(p.repo, p.config);

    assert.equal(overview.worktrees?.[p.folderName]?.checkoutChanged, false);
    assert.ok(!formatStatusOverview(overview).includes('warning:'));
  });
});
