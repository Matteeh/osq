import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { statusCommand } from '../src/cli/status.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { getStatusOverview } from '../src/core/status/status.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const FOLDER = '001-order-flow';
const CHANGE_REL = path.posix.join('openspec', 'changes', FOLDER);
const BRANCH = `osq/${FOLDER}`;
const REMOVE = `  ${FOLDER}: landed; remove the checkout copy with rm -r openspec/changes/${FOLDER}`;
const IN_SCOPE = 'src/one.txt';

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

function proposalMarkdown(): string {
  return [
    '---',
    'title: Order Flow',
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    'Run the task.',
    '',
    '## Surface',
    'None.',
    '',
    '## Human steps',
    'None',
    '',
  ].join('\n');
}

function taskMarkdown(): string {
  return [
    '---',
    'title: Only task',
    'verify: node verify.cjs',
    `scope: ${JSON.stringify([IN_SCOPE])}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] does the thing',
    '',
  ].join('\n');
}

async function writeChange(folderPath: string): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMarkdown(), 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks.md'), '# Tasks\n\n- [ ] 1. Only task\n', 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMarkdown(), 'utf8');
}

interface Project {
  readonly repo: string;
  readonly worktree: string;
  readonly checkoutFolder: string;
  readonly config: OsqConfig;
}

/** A committed temp repository with one change approved into a linked worktree. */
async function setupProject(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-status-leftover-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, 'src', 'out.txt'), 'out\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const checkoutFolder = path.join(repo, CHANGE_REL);
  await writeChange(checkoutFolder);

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({
    vcs,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
  });
  const result = await approveSpec(repo, '001', config);
  assert.ok(result.worktreePath, 'approval created a worktree');
  return { repo, worktree: result.worktreePath, checkoutFolder, config };
}

/** Fake adapter that writes the task's scoped file and a result. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await fs.writeFile(path.join(options.projectRoot, IN_SCOPE), 'task 1\n', 'utf8');
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(path.join(resultsDir, '1.md'), '# Agent result\n', 'utf8');
    return { exitCode: 0 };
  }
}

/** Run the change to its archive commit on `osq/<folder>`. */
async function archiveChange(project: Project): Promise<void> {
  await runWatcherCycle(project.repo, project.config, new ActingAdapter());
}

/** Land the archived change in the checkout with `git merge --squash`. */
async function landByHand(project: Project): Promise<void> {
  await git(['merge', '--squash', BRANCH], project.repo);
  await git(['commit', '-m', 'land'], project.repo);
}

async function runStatus(project: Project, config: OsqConfig = project.config): Promise<string> {
  let captured = '';
  await statusCommand({
    cwd: project.repo,
    config,
    stdout: (msg) => {
      captured = msg;
    },
  });
  return captured;
}

describe('osq status leftover drafts', () => {
  it('flags an untouched checkout copy after a hand landing', async () => {
    const project = await setupProject();
    await archiveChange(project);
    await landByHand(project);

    const output = await runStatus(project);

    assert.match(output, /^Leftover drafts:$/m);
    assert.ok(output.includes(REMOVE));
    assert.ok(!output.includes(`${FOLDER}: Order Flow [`), 'leftover stays out of Active specs');
  });

  it('keeps flagging after the worktree is removed', async () => {
    const project = await setupProject();
    await archiveChange(project);
    await landByHand(project);
    await git(['worktree', 'remove', project.worktree], project.repo);

    const output = await runStatus(project);

    assert.ok(output.includes(REMOVE));
    assert.ok(!output.includes(`${FOLDER}: Order Flow [`), 'leftover stays out of Active specs');
  });

  it('does not flag an edited checkout copy', async () => {
    const project = await setupProject();
    await archiveChange(project);
    await fs.appendFile(path.join(project.checkoutFolder, 'tasks', '1.md'), '\nedited\n', 'utf8');
    await landByHand(project);

    const output = await runStatus(project);

    assert.ok(!output.includes('Leftover drafts:'));
  });

  it('does not flag a change that has not landed', async () => {
    const project = await setupProject();
    await archiveChange(project);

    const output = await runStatus(project);

    assert.ok(!output.includes('Leftover drafts:'));
  });

  it('clears the flag once the copy is removed', async () => {
    const project = await setupProject();
    await archiveChange(project);
    await landByHand(project);
    await fs.rm(project.checkoutFolder, { recursive: true, force: true });

    const output = await runStatus(project);

    assert.ok(!output.includes('Leftover drafts:'));
  });

  it('prints no leftovers and no section with vcs.enabled off', async () => {
    const project = await setupProject();
    await archiveChange(project);
    await landByHand(project);

    const off = defineConfig({ vcs: { enabled: false } });
    const output = await runStatus(project, off);

    assert.ok(!output.includes('Leftover drafts:'));
    const overview = await getStatusOverview(project.repo, off);
    assert.equal(overview.leftovers, undefined);
  });

  it('prints no leftovers when git is unavailable', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-status-leftover-novcs-'));
    tmpDirs.push(root);
    await installFakeValidator(root);
    await scaffoldProject(root);
    await writeChange(path.join(root, CHANGE_REL));

    const config = defineConfig({ vcs: { enabled: true, author: 'Osq <osq@example.invalid>' } });
    let captured = '';
    await statusCommand({
      cwd: root,
      config,
      stdout: (msg) => {
        captured = msg;
      },
    });

    assert.ok(!captured.includes('Leftover drafts:'));
    const overview = await getStatusOverview(root, config);
    assert.equal(overview.leftovers, undefined);
  });
});
