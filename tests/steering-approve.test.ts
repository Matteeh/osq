import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { approveCommand } from '../src/cli/approve.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { hashChangeFolder } from '../src/core/spec/hasher.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGE_ID = '001-order-flow';
const CHANGE_REL = path.posix.join('openspec', 'changes', CHANGE_ID);
const IN_SCOPE = 'src/one.txt';
const SECOND_SCOPE = 'src/two.txt';
const THIRD_SCOPE = 'src/three.txt';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

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

async function captureStdout(run: () => Promise<void>): Promise<string> {
  let output = '';
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Buffer) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    await run();
  } finally {
    process.stdout.write = original;
  }
  return output;
}

interface TaskSpec {
  readonly title: string;
  readonly scope: string[];
}

const FIRST: TaskSpec = { title: 'First task', scope: [IN_SCOPE] };
const SECOND: TaskSpec = { title: 'Second task', scope: [SECOND_SCOPE] };
const THIRD: TaskSpec = { title: 'Third task', scope: [THIRD_SCOPE] };

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

function tasksMarkdown(specs: readonly TaskSpec[]): string {
  const lines = ['# Tasks', ''];
  specs.forEach((spec, index) => lines.push(`- [ ] ${index + 1}. ${spec.title}`));
  lines.push('');
  return lines.join('\n');
}

async function writeChange(folderPath: string, specs: readonly TaskSpec[]): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMarkdown('Order Flow'), 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks.md'), tasksMarkdown(specs), 'utf8');
  for (let index = 0; index < specs.length; index += 1) {
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${index + 1}.md`),
      taskMarkdown(specs[index] as TaskSpec),
      'utf8',
    );
  }
}

const PASSING_VERIFY = 'process.exit(0);\n';

interface Project {
  readonly repo: string;
  readonly worktree: string;
  readonly checkoutFolder: string;
  readonly worktreeFolder: string;
  readonly config: OsqConfig;
}

/** A committed temp repository with one change approved into a linked worktree. */
async function setupProject(specs: readonly TaskSpec[]): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-steering-approve-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), PASSING_VERIFY, 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, 'src', 'out.txt'), 'out\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const checkoutFolder = path.join(repo, CHANGE_REL);
  await writeChange(checkoutFolder, specs);

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
    checkoutFolder,
    worktreeFolder: path.join(worktree, CHANGE_REL),
    config,
  };
}

async function readApproved(folderPath: string): Promise<string> {
  return (await fs.readFile(path.join(folderPath, '.run', 'approved'), 'utf8')).trim();
}

async function markDone(folderPath: string, taskNumber: string): Promise<void> {
  const dir = path.join(folderPath, '.run', 'done');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, taskNumber), '', 'utf8');
}

async function markBlocked(folderPath: string, taskNumber: string, need: string): Promise<void> {
  const dir = path.join(folderPath, '.run', 'dead');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${taskNumber}.md`), `---\nreason: blocked\n---\n${need}\n`);
}

async function markRunning(folderPath: string, taskNumber: string): Promise<void> {
  const dir = path.join(folderPath, '.run', 'running');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${taskNumber}.pid`),
    JSON.stringify({ pid: process.pid, startedAt: Date.now() }),
    'utf8',
  );
}

async function writeChangeRegression(folderPath: string, reason: string): Promise<void> {
  const dir = path.join(folderPath, '.run', 'regressed');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'change.md'), `---\nreason: ${reason}\n---\nprior\n`, 'utf8');
}

async function addTask(folderPath: string, spec: TaskSpec): Promise<void> {
  const tasksPath = path.join(folderPath, 'tasks.md');
  const content = await fs.readFile(tasksPath, 'utf8');
  await fs.writeFile(tasksPath, `${content}- [ ] 3. ${spec.title}\n`, 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks', '3.md'), taskMarkdown(spec), 'utf8');
}

async function commitSubjects(cwd: string): Promise<string[]> {
  const output = await git(['log', '--format=%s'], cwd);
  return output.split('\n').filter((line) => line.trim().length > 0);
}

async function commitFiles(cwd: string, sha: string): Promise<string[]> {
  const output = await git(['show', '--pretty=format:', '--name-only', sha], cwd);
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();
}

/** Fake adapter whose spawn edits the current task's scoped file. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';
  readonly calls: SpawnTaskOptions[] = [];

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.calls.push({ ...options });
    const target = options.taskNumber === '2' ? SECOND_SCOPE : IN_SCOPE;
    await fs.writeFile(path.join(options.projectRoot, target), `task ${options.taskNumber}\n`);
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(path.join(resultsDir, `${options.taskNumber}.md`), '# Agent result\n');
    return { exitCode: 0 };
  }
}

describe('Approval after steering', () => {
  it('approves a blocked task again in its worktree and continues from it', async () => {
    const project = await setupProject([FIRST, SECOND]);
    await markDone(project.worktreeFolder, '1');
    await markBlocked(project.worktreeFolder, '2', 'Needs src/three.txt');
    const taskPath = path.join(project.worktreeFolder, 'tasks', '2.md');
    const revised = (await fs.readFile(taskPath, 'utf8')).replace('does the thing', 'does it now');
    await fs.writeFile(taskPath, revised, 'utf8');
    const headBefore = await git(['rev-parse', 'HEAD'], project.worktree);

    const stdout = await captureStdout(() =>
      approveCommand(['001'], { cwd: project.repo, config: project.config, planningReaders: [] }),
    );

    const headAfter = await git(['rev-parse', 'HEAD'], project.worktree);
    assert.notEqual(headAfter, headBefore);
    assert.equal(await git(['log', '--format=%s', '-1'], project.worktree), 'osq: 001 approved');
    assert.ok(
      (await commitFiles(project.worktree, headAfter)).includes(`${CHANGE_REL}/tasks/2.md`),
    );
    assert.equal(
      await readApproved(project.worktreeFolder),
      await hashChangeFolder(project.worktreeFolder),
    );
    assert.equal(await exists(path.join(project.worktreeFolder, '.run', 'dead', '2.md')), false);
    assert.equal(await exists(path.join(project.worktreeFolder, '.run', 'dead', '2.1.md')), true);
    assert.equal(await exists(path.join(project.worktreeFolder, '.run', 'done', '1')), true);
    assert.equal(await exists(project.checkoutFolder), false, 'checkout holds no copy');
    assert.ok(stdout.includes('  Worktree: '));
    assert.ok(stdout.includes(`  Branch: osq/${CHANGE_ID}`));
    assert.ok(stdout.includes('  Continues from task 2'));
  });

  it('runs the change through its worktree to the archive', async () => {
    const project = await setupProject([FIRST, SECOND]);
    const first = new ActingAdapter();
    await runWatcherCycle(project.repo, project.config, first);
    assert.equal(first.calls[0]?.taskNumber, '1');
    await markBlocked(project.worktreeFolder, '2', 'Needs src/three.txt');

    await approveSpec(project.repo, '001', project.config);
    const adapter = new ActingAdapter();
    const summary = await runWatcherCycle(project.repo, project.config, adapter);

    assert.equal(summary.tasksRun, 1);
    assert.equal(adapter.calls.length, 1);
    assert.equal(adapter.calls[0]?.taskNumber, '2');
    assert.equal(
      await fs.realpath(adapter.calls[0]?.projectRoot ?? ''),
      await fs.realpath(project.worktree),
    );
    assert.ok((await commitSubjects(project.worktree)).includes('osq: 001 archived'));
    assert.equal(
      await exists(path.join(project.worktree, 'openspec', 'changes', 'archive', CHANGE_ID)),
      true,
    );
  });

  it('retires a change regression and continues from the added task', async () => {
    const project = await setupProject([FIRST, SECOND]);
    await markDone(project.worktreeFolder, '1');
    await markDone(project.worktreeFolder, '2');
    await writeChangeRegression(project.worktreeFolder, 'verify_red');
    await addTask(project.worktreeFolder, THIRD);

    const result = await approveSpec(project.repo, '001', project.config);

    assert.equal(result.continuesFrom, '3');
    assert.equal(
      await exists(path.join(project.worktreeFolder, '.run', 'regressed', 'change.md')),
      false,
    );
    assert.equal(
      await exists(path.join(project.worktreeFolder, '.run', 'regressed', 'change.1.md')),
      true,
    );
    assert.equal(await exists(path.join(project.worktreeFolder, '.run', 'done', '1')), true);
    assert.equal(await exists(path.join(project.worktreeFolder, '.run', 'done', '2')), true);
  });

  it('refuses a running task and writes nothing', async () => {
    const project = await setupProject([FIRST, SECOND]);
    await markBlocked(project.worktreeFolder, '2', 'Needs src/three.txt');
    await markRunning(project.worktreeFolder, '1');
    const approvedBefore = await readApproved(project.worktreeFolder);
    const headBefore = await git(['rev-parse', 'HEAD'], project.worktree);

    await assert.rejects(
      approveSpec(project.repo, '001', project.config),
      /has a task running; approve it after the task ends/,
    );

    assert.equal(await readApproved(project.worktreeFolder), approvedBefore);
    assert.equal(await git(['rev-parse', 'HEAD'], project.worktree), headBefore);
    assert.equal(await exists(path.join(project.worktreeFolder, '.run', 'dead', '2.md')), true);
  });

  it('retires a stuck task in place when version control is off', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-steering-inplace-'));
    tmpDirs.push(root);
    await installFakeValidator(root);
    await scaffoldProject(root);
    await fs.writeFile(path.join(root, 'verify.cjs'), PASSING_VERIFY, 'utf8');
    const folder = path.join(root, CHANGE_REL);
    await writeChange(folder, [FIRST]);
    const config = defineConfig({});
    await approveSpec(root, '001', config);

    await fs.mkdir(path.join(folder, '.run', 'dead'), { recursive: true });
    await fs.writeFile(
      path.join(folder, '.run', 'dead', '1.md'),
      '---\nreason: verify_red\nstuck: true\nfingerprint: sha256:deadbeef\n---\nprior\n',
      'utf8',
    );

    const result = await approveSpec(root, '001', config);

    assert.equal(result.continuesFrom, '1');
    assert.equal(await exists(path.join(folder, '.run', 'dead', '1.md')), false);
    assert.equal(await exists(path.join(folder, '.run', 'dead', '1.1.md')), true);
  });
});

describe('Running change that needs no steering', () => {
  it('refuses with the branch message and leaves the worktree alone', async () => {
    const project = await setupProject([FIRST, SECOND]);
    const headBefore = await git(['rev-parse', 'HEAD'], project.worktree);

    await assert.rejects(
      approveSpec(project.repo, '001', project.config),
      new RegExp(`branch osq/${CHANGE_ID} already exists`),
    );

    assert.equal(await git(['rev-parse', 'HEAD'], project.worktree), headBefore);
  });
});
