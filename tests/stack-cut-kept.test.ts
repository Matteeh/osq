import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { retrySpec } from '../src/core/lifecycle/retry.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { stackedPath, worktreeBranch, worktreePath } from '../src/core/vcs/worktree.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);

const CHANGES = path.join('openspec', 'changes');
const CHANGE_ONE = '001-a';
const CHANGE_TWO = '002-b';
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

async function exists(target: string): Promise<boolean> {
  return fs.access(target).then(
    () => true,
    () => false,
  );
}

async function commitSubjects(cwd: string, ref: string): Promise<string[]> {
  const output = await git(['log', '--format=%s', ref], cwd);
  return output.split('\n').filter((line) => line.trim().length > 0);
}

/** Whether `git worktree list` names `wtPath` on `branch`. */
async function worktreeListed(cwd: string, wtPath: string, branch: string): Promise<boolean> {
  const output = await git(['worktree', 'list', '--porcelain'], cwd);
  const blocks = output.split('\n\n');
  return blocks.some(
    (block) =>
      block.includes(`worktree ${wtPath}`) && block.includes(`branch refs/heads/${branch}`),
  );
}

function parseMarker(content: string): { reason: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!match) return { reason: '', body: content.trim() };
  const reason = /(?:^|\n)reason:\s*(.+)/.exec(match[1] ?? '')?.[1]?.trim() ?? '';
  return { reason, body: (match[2] ?? '').trim() };
}

async function readRegressed(folderPath: string): Promise<{ reason: string; body: string }> {
  const content = await fs.readFile(
    path.join(folderPath, '.run', 'regressed', 'change.md'),
    'utf8',
  );
  return parseMarker(content);
}

interface ChangeDef {
  readonly folder: string;
  readonly title: string;
  readonly dependsOn: readonly string[];
}

const ONE: ChangeDef = { folder: CHANGE_ONE, title: 'One', dependsOn: [] };
const TWO: ChangeDef = { folder: CHANGE_TWO, title: 'Two', dependsOn: ['001'] };

function proposalMarkdown(change: ChangeDef): string {
  return [
    '---',
    `title: ${change.title}`,
    `depends_on: [${change.dependsOn.map((id) => JSON.stringify(id)).join(', ')}]`,
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

function taskMarkdown(change: ChangeDef): string {
  return [
    '---',
    `title: ${change.title} task`,
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

async function writeChange(folderPath: string, change: ChangeDef): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMarkdown(change), 'utf8');
  await fs.writeFile(
    path.join(folderPath, 'tasks.md'),
    `# Tasks\n\n- [ ] 1. ${change.title}\n`,
    'utf8',
  );
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMarkdown(change), 'utf8');
}

interface Project {
  readonly root: string;
  readonly repo: string;
  readonly worktrees: string;
  readonly config: OsqConfig;
  readonly vcs: VcsConfig;
}

interface ProjectOptions {
  readonly changes?: readonly ChangeDef[];
  readonly prepare?: string;
}

async function makeProject(options: ProjectOptions = {}): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-stack-cut-kept-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, IN_SCOPE), 'seed\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  for (const change of options.changes ?? [ONE, TWO]) {
    await writeChange(path.join(repo, CHANGES, change.folder), change);
  }

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
    ...(options.prepare !== undefined ? { prepare: options.prepare } : {}),
  };
  const config = defineConfig({
    vcs,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off', autoRetries: 0 },
  });
  return { root, repo, worktrees, config, vcs };
}

/** Fake adapter whose spawn edits one scoped file under the spawn's project root. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';
  readonly calls: SpawnTaskOptions[] = [];

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.calls.push({ ...options });
    await fs.writeFile(
      path.join(options.projectRoot, IN_SCOPE),
      `task ${options.taskNumber}\n`,
      'utf8',
    );
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(
      path.join(resultsDir, `${options.taskNumber}.md`),
      '# Agent result\n',
      'utf8',
    );
    return { exitCode: 0 };
  }
}

/** Approve `folder` and return the worktree path approval created. */
async function approveIntoWorktree(project: Project, folder: string): Promise<string> {
  const result = await approveSpec(project.repo, folder, project.config);
  assert.ok(result.worktreePath, `expected a worktree for ${folder}`);
  return result.worktreePath;
}

describe('Stacked cut keeps a failed worktree', () => {
  it('keeps the worktree on failure and reuses it after retry', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-stack-persist-'));
    tmpDirs.push(root);
    const prepareScript = path.join(root, 'prepare.cjs');
    await fs.writeFile(
      prepareScript,
      [
        "const fs = require('node:fs');",
        "const path = require('node:path');",
        "process.exit(fs.existsSync(path.join(__dirname, 'fail-cut')) ? 1 : 0);",
        '',
      ].join('\n'),
      'utf8',
    );
    const project = await makeProject({ prepare: `node ${prepareScript}` });
    await approveIntoWorktree(project, '001');
    await approveSpec(project.repo, '002', project.config);
    await fs.writeFile(path.join(root, 'fail-cut'), '', 'utf8');

    const wtPath = worktreePath(project.vcs, project.repo, CHANGE_TWO);
    const stackedCopy = path.join(
      stackedPath(project.vcs, project.repo, CHANGE_TWO),
      CHANGES,
      CHANGE_TWO,
    );

    await runWatcherOnce(project.repo, project.config, new ActingAdapter());

    const marker = await readRegressed(stackedCopy);
    assert.equal(marker.reason, 'stack_cut_failed');
    assert.equal(await exists(stackedPath(project.vcs, project.repo, CHANGE_TWO)), true);
    assert.equal(await exists(wtPath), true);
    assert.equal(await worktreeListed(project.repo, wtPath, worktreeBranch(CHANGE_TWO)), true);
    assert.equal(
      (await commitSubjects(project.repo, worktreeBranch(CHANGE_TWO))).includes(
        'osq: 002 approved',
      ),
      false,
    );

    await fs.rm(path.join(root, 'fail-cut'), { force: true });
    await retrySpec(project.repo, '2', 'change', project.config);
    await runWatcherOnce(project.repo, project.config, new ActingAdapter());

    assert.equal(await exists(wtPath), true);
    assert.equal(await worktreeListed(project.repo, wtPath, worktreeBranch(CHANGE_TWO)), true);
    const subjects = await commitSubjects(project.repo, worktreeBranch(CHANGE_TWO));
    assert.equal(subjects.filter((subject) => subject === 'osq: 002 approved').length, 1);
    assert.equal(await exists(stackedPath(project.vcs, project.repo, CHANGE_TWO)), false);
    assert.equal(await fs.readFile(path.join(wtPath, IN_SCOPE), 'utf8'), 'task 1\n');
  });
});
