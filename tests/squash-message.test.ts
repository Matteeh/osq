import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { CommandError } from '../src/cli/command-error.js';
import { messageCommand } from '../src/cli/message.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { worktreeBranch } from '../src/core/vcs/worktree.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGES = path.posix.join('openspec', 'changes');
const ARCHIVE = path.posix.join(CHANGES, 'archive');
const ONE = '001-order-flow';
const TWO = '002-second';
const OUT_SCOPE = 'src/out.txt';

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

async function statusLines(cwd: string): Promise<string[]> {
  const output = await git(['status', '--porcelain'], cwd);
  return output.split('\n').filter((line) => line.trim().length > 0);
}

/** Run `git <args>` feeding `input` on stdin, returning stdout. */
function gitWithInput(args: string[], cwd: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, env: cleanGitEnv() });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`git ${args.join(' ')} exited ${code}: ${err}`));
    });
    child.stdin.end(input);
  });
}

interface Capture {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

/** Run `messageCommand` with every stream captured. */
async function runMessage(cwd: string, config: OsqConfig, id: string): Promise<Capture> {
  let stdout = '';
  let stderr = '';
  let exitCode: number | null = null;
  try {
    await messageCommand(id, {
      cwd,
      config,
      stdout: (msg) => {
        stdout += msg;
      },
      stderr: (msg) => {
        stderr += msg;
      },
    });
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    stderr += error.message.length > 0 ? `${error.message}\n` : '';
    exitCode = error.exitCode;
  }
  return { stdout, stderr, exitCode };
}

interface TaskSpec {
  readonly title: string;
  readonly scope: string;
}

interface ChangeDef {
  readonly folder: string;
  readonly title: string;
  readonly goal: string;
  readonly dependsOn: readonly string[];
  readonly tasks: readonly TaskSpec[];
}

const ORDER_FLOW: ChangeDef = {
  folder: ONE,
  title: 'Order Flow',
  goal: 'Run the tasks.',
  dependsOn: [],
  tasks: [
    { title: 'First task', scope: 'src/one.txt' },
    { title: 'Second task', scope: 'src/two.txt' },
  ],
};

const SECOND: ChangeDef = {
  folder: TWO,
  title: 'Second',
  goal: 'Add the second thing.',
  dependsOn: [],
  tasks: [{ title: 'Only task', scope: 'src/only.txt' }],
};

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
    change.goal,
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
    `scope: ${JSON.stringify([spec.scope])}`,
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
  const lines = ['# Tasks', ''];
  change.tasks.forEach((task, index) => lines.push(`- [ ] ${index + 1}. ${task.title}`));
  lines.push('');
  await fs.writeFile(path.join(folderPath, 'tasks.md'), lines.join('\n'), 'utf8');
  for (let index = 0; index < change.tasks.length; index += 1) {
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${index + 1}.md`),
      taskMarkdown(change.tasks[index] as TaskSpec),
      'utf8',
    );
  }
}

interface Project {
  readonly repo: string;
  readonly config: OsqConfig;
  readonly worktree: string;
}

/** A committed temp repository with one change approved into a linked worktree. */
async function setupProject(change: ChangeDef = ORDER_FLOW): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-squash-message-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, OUT_SCOPE), 'out\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  await writeChange(path.join(repo, CHANGES, change.folder), change);

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({
    vcs,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
  });
  const result = await approveSpec(repo, change.folder.split('-')[0] as string, config);
  const worktree = result.worktreePath;
  assert.ok(worktree, 'approval created a worktree');
  return { repo, config, worktree };
}

/** The archived folder path inside a project's worktree. */
function archivedPath(project: Project, folder: string): string {
  return path.join(project.worktree, ARCHIVE, folder);
}

/** Fake adapter whose spawn edits the task's scoped file under its project root. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';
  readonly calls: SpawnTaskOptions[] = [];

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.calls.push({ ...options });
    const target = options.scope[0] ?? 'src/one.txt';
    await fs.writeFile(
      path.join(options.projectRoot, target),
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

/** Replace one task's event stream with a single `started` fallback. */
async function writeStartedEvent(
  folderPath: string,
  task: string,
  harness: string,
  model: string,
  version: string,
): Promise<void> {
  const dir = path.join(folderPath, '.run', 'events');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${task}.jsonl`),
    `${JSON.stringify({
      type: 'started',
      timestamp: '2026-01-01T00:00:00.000Z',
      data: { harness, model, osqVersion: version },
    })}\n`,
    'utf8',
  );
}

function trailerLines(output: string, key: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(`${key}:`));
}

describe('Squash commit message', () => {
  it('builds the message after archive and lands by hand with every trailer', async () => {
    const project = await setupProject();
    const adapter = new ActingAdapter();
    await runWatcherCycle(project.repo, project.config, adapter);
    await runWatcherCycle(project.repo, project.config, adapter);

    const before = await statusLines(project.worktree);
    const capture = await runMessage(project.repo, project.config, '001');

    assert.equal(capture.exitCode, null);
    const lines = capture.stdout.split('\n');
    assert.equal(lines[0], 'osq: 001 order flow');
    assert.equal(lines[1], '');
    assert.equal(lines[2], 'Run the tasks.');
    assert.equal(lines[3], '');
    assert.equal(lines[4], '[verified] task 1: First task');
    assert.equal(lines[5], '[verified] task 2: Second task');
    assert.equal(lines[6], '');
    assert.ok(capture.stdout.endsWith('\n'));
    assert.ok(!capture.stdout.endsWith('\n\n'));

    const branch = worktreeBranch(ONE);
    const tip = await git(['rev-parse', branch], project.repo);
    await git(['merge', '--squash', branch], project.repo);
    await gitWithInput(['commit', '-F', '-'], project.repo, capture.stdout);
    const headMessage = await git(['log', '-1', '--format=%B'], project.repo);
    const trailers = await gitWithInput(
      ['interpret-trailers', '--parse'],
      project.repo,
      headMessage,
    );

    assert.deepEqual(trailerLines(trailers, 'Osq-Change'), [`Osq-Change: ${ONE}`]);
    assert.equal(trailerLines(trailers, 'Osq-Base').length, 1);
    assert.deepEqual(trailerLines(trailers, 'Osq-Head'), [`Osq-Head: ${tip}`]);
    assert.equal(trailerLines(trailers, 'Osq-Approved').length, 1);
    assert.equal(trailerLines(trailers, 'Osq-Approved-By').length, 1);
    assert.equal(trailerLines(trailers, 'Osq-Model').length, 1);
    assert.equal(trailerLines(trailers, 'Osq-Version').length, 1);

    assert.deepEqual(await statusLines(project.worktree), before);
    assert.deepEqual(before, []);
  });

  it('lists one Osq-Model trailer per distinct model and version, in task order', async () => {
    const project = await setupProject();
    const adapter = new ActingAdapter();
    await runWatcherCycle(project.repo, project.config, adapter);
    await runWatcherCycle(project.repo, project.config, adapter);

    const archived = archivedPath(project, ONE);
    await writeStartedEvent(archived, '1', 'pi', 'deepseek-flash', '9.9.9');
    await writeStartedEvent(archived, '2', 'pi', 'deepseek-pro', '9.9.9');

    const capture = await runMessage(project.repo, project.config, '001');
    assert.equal(capture.exitCode, null);
    assert.deepEqual(trailerLines(capture.stdout, 'Osq-Model'), [
      'Osq-Model: pi deepseek-flash',
      'Osq-Model: pi deepseek-pro',
    ]);
    assert.deepEqual(trailerLines(capture.stdout, 'Osq-Version'), ['Osq-Version: 9.9.9']);
  });

  it('marks a task completed with osq done --manual as manual', async () => {
    const project = await setupProject();
    const adapter = new ActingAdapter();
    await runWatcherCycle(project.repo, project.config, adapter);
    await runWatcherCycle(project.repo, project.config, adapter);

    const done = path.join(archivedPath(project, ONE), '.run', 'done', '2');
    await fs.mkdir(path.dirname(done), { recursive: true });
    await fs.writeFile(done, '---\nmanual: true\n---\n\n', 'utf8');

    const capture = await runMessage(project.repo, project.config, '001');
    assert.match(capture.stdout, /\[verified\] task 1: First task/);
    assert.match(capture.stdout, /\[manual\] task 2: Second task/);
  });

  it('refuses a change that has not archived in its worktree', async () => {
    const project = await setupProject();

    const capture = await runMessage(project.repo, project.config, '001');

    assert.equal(capture.stdout, '');
    assert.equal(capture.stderr, `${ONE} has not archived on ${worktreeBranch(ONE)}\n`);
    assert.equal(capture.exitCode, 1);
  });

  it('refuses when no osq worktree holds a matching archived change', async () => {
    const project = await setupProject();

    const capture = await runMessage(project.repo, project.config, '999');

    assert.equal(capture.stdout, '');
    assert.equal(capture.stderr, 'No archived change "999" in an osq worktree\n');
    assert.equal(capture.exitCode, 1);
  });
});

describe('Message command', () => {
  it('prints the message on stdout and the branch on stderr', async () => {
    const project = await setupProject();
    const adapter = new ActingAdapter();
    await runWatcherCycle(project.repo, project.config, adapter);
    await runWatcherCycle(project.repo, project.config, adapter);

    const capture = await runMessage(project.repo, project.config, '001');

    assert.equal(capture.exitCode, null);
    assert.equal(capture.stderr, `Branch: ${worktreeBranch(ONE)}\n`);
    assert.ok(capture.stdout.startsWith('osq: 001 order flow\n'));
    assert.ok(!capture.stdout.includes('Branch:'));
  });
});

describe('Stacked squash message', () => {
  it('refuses when a dependency has not landed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-squash-stacked-'));
    tmpDirs.push(root);
    const repo = path.join(root, 'repo');
    const worktrees = path.join(root, 'worktrees');
    await fs.mkdir(repo, { recursive: true });
    await installFakeValidator(repo);
    await scaffoldProject(repo);
    await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
    await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
    await fs.mkdir(path.join(repo, 'src'), { recursive: true });
    await fs.writeFile(path.join(repo, OUT_SCOPE), 'out\n', 'utf8');
    await git(['init', '-q', '-b', 'main'], repo);
    await git(['config', 'user.name', 'osq'], repo);
    await git(['config', 'user.email', 'osq@example.invalid'], repo);
    await git(['add', '-A'], repo);
    await git(['commit', '-qm', 'seed'], repo);

    await writeChange(path.join(repo, CHANGES, ONE), {
      ...ORDER_FLOW,
      tasks: [ORDER_FLOW.tasks[0] as TaskSpec],
    });
    await writeChange(path.join(repo, CHANGES, TWO), SECOND);

    const vcs: VcsConfig = {
      enabled: true,
      author: 'Osq <osq@example.invalid>',
      worktreeRoot: worktrees,
    };
    const config = defineConfig({
      vcs,
      gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
    });

    const dependency = await approveSpec(repo, '001', config);
    assert.ok(dependency.worktreePath, 'dependency approved into a worktree');
    // Keep the dependency unrun by making its worktree dirty so the cycle halts it.
    await fs.writeFile(path.join(dependency.worktreePath, OUT_SCOPE), 'dirty\n', 'utf8');
    const dependent = await approveSpec(repo, '002', config);
    assert.ok(dependent.worktreePath, 'dependent approved into a worktree');

    const adapter = new ActingAdapter();
    await runWatcherCycle(repo, config, adapter);

    const dependentArchive = path.join(dependent.worktreePath, ARCHIVE, TWO);
    assert.equal(await exists(dependentArchive), true, 'dependent archived');
    const proposalPath = path.join(dependentArchive, 'proposal.md');
    const proposal = await fs.readFile(proposalPath, 'utf8');
    await fs.writeFile(
      proposalPath,
      proposal.replace('depends_on: []', 'depends_on: ["001"]'),
      'utf8',
    );

    const capture = await runMessage(repo, config, '002');

    assert.equal(capture.stdout, '');
    assert.equal(
      capture.stderr,
      `${TWO} is stacked on ${ONE}, which has not landed; land it first\n`,
    );
    assert.equal(capture.exitCode, 1);
  });
});

describe('Flag off squash message', () => {
  it('refuses without vcs.enabled and runs no git', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-squash-off-'));
    tmpDirs.push(root);

    const capture = await runMessage(root, defineConfig({}), '001');

    assert.equal(capture.stdout, '');
    assert.equal(capture.stderr, 'osq message needs vcs.enabled and git\n');
    assert.equal(capture.exitCode, 1);
  });
});
