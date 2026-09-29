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
import { approveSpec } from '../src/core/spec/approve.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGE_ID = '001-order-flow';
const CHANGE_REL = path.posix.join('openspec', 'changes', CHANGE_ID);
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

/** A verify script that always passes. */
const PASSING_VERIFY = [
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  'if (process.env.OSQ_CHANGE) {',
  "  const dir = path.join(process.env.OSQ_CHANGE, '.run');",
  '  fs.mkdirSync(dir, { recursive: true });',
  '}',
  'process.exit(0);',
  '',
].join('\n');

interface TaskSpec {
  readonly title: string;
  readonly scope: string[];
}

const FIRST: TaskSpec = { title: 'First task', scope: [IN_SCOPE] };

function proposalMarkdown(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    'Run the tasks.',
    '',
    '## Surface',
    'None.',
    '',
    '## Human steps',
    'None',
    '',
  ].join('\n');
}

function taskMarkdown(spec: TaskSpec): string {
  return [
    '---',
    `title: ${spec.title}`,
    'verify: node verify.cjs',
    `scope: ${JSON.stringify(spec.scope)}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] does the thing',
    '',
  ].join('\n');
}

async function writeChange(
  folderPath: string,
  title: string,
  specs: readonly TaskSpec[],
): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMarkdown(title), 'utf8');
  const tasks = ['# Tasks', ''];
  specs.forEach((spec, index) => tasks.push(`- [ ] ${index + 1}. ${spec.title}`));
  tasks.push('');
  await fs.writeFile(path.join(folderPath, 'tasks.md'), tasks.join('\n'), 'utf8');
  for (let index = 0; index < specs.length; index += 1) {
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${index + 1}.md`),
      taskMarkdown(specs[index] as TaskSpec),
      'utf8',
    );
  }
}

interface Project {
  readonly repo: string;
  readonly worktree: string;
  readonly worktreeFolder: string;
  readonly config: OsqConfig;
}

/** A committed temp repository with one change approved into a linked worktree. */
async function setupProject(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-approval-pending-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), PASSING_VERIFY, 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, IN_SCOPE), 'one\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  await writeChange(path.join(repo, CHANGE_REL), 'Order Flow', [FIRST]);

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
  const worktree = result.worktreePath;
  assert.ok(worktree, 'approval created a worktree');
  return {
    repo,
    worktree,
    worktreeFolder: path.join(worktree, CHANGE_REL),
    config,
  };
}

/** Undo the approval commit but leave the sealed change folder on disk. */
async function uncommitApproval(worktree: string): Promise<void> {
  await git(['reset', '--soft', 'HEAD~1'], worktree);
  await git(['reset'], worktree);
}

/** Adapter that counts spawns and writes a result so the task can pass. */
class CountingAdapter implements HarnessAdapter {
  readonly name = 'counting';
  readonly calls: SpawnTaskOptions[] = [];

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.calls.push({ ...options });
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

describe('Approval commit pending', () => {
  it('skips a sealed but uncommitted approval without writing any marker or event', async () => {
    const project = await setupProject();
    await uncommitApproval(project.worktree);
    const adapter = new CountingAdapter();

    const summary = await runWatcherCycle(project.repo, project.config, adapter);

    assert.equal(summary.tasksRun, 0);
    assert.equal(adapter.calls.length, 0);
    assert.equal(
      await exists(path.join(project.worktreeFolder, '.run', 'regressed', 'change.md')),
      false,
    );
    assert.equal(
      await exists(path.join(project.worktreeFolder, '.run', 'events', 'change.jsonl')),
      false,
    );
  });

  it('spawns the pending task once the approval commit lands', async () => {
    const project = await setupProject();
    await uncommitApproval(project.worktree);
    const skipped = new CountingAdapter();
    await runWatcherCycle(project.repo, project.config, skipped);
    assert.equal(skipped.calls.length, 0);

    await git(['add', CHANGE_REL], project.worktree);
    await git(['commit', '-qm', 'seal approval'], project.worktree);

    const adapter = new CountingAdapter();
    const summary = await runWatcherCycle(project.repo, project.config, adapter);

    assert.equal(summary.tasksRun, 1);
    assert.equal(adapter.calls.length, 1);
    assert.equal(adapter.calls[0]?.taskNumber, '1');
  });
});
