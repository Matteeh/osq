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
import { landChange } from '../src/core/vcs/land.js';
import { stackedPath } from '../src/core/vcs/worktree.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherCycle, runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGE_ID = '001-order-flow';
const CHANGE_REL = path.posix.join('openspec', 'changes', CHANGE_ID);
const ARCHIVE_REL = path.posix.join('openspec', 'changes', 'archive');
const IN_SCOPE = 'src/one.txt';
const SECOND_SCOPE = 'src/two.txt';
const OTHER = 'src/other.txt';

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

async function writeAt(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

function lines(output: string): string[] {
  return output.split('\n').filter((line) => line.trim().length > 0);
}

async function commitSubjects(cwd: string, ref = 'HEAD'): Promise<string[]> {
  return lines(await git(['log', '--format=%s', ref], cwd));
}

/** Subjects along the first-parent chain, ignoring commits merged in from main. */
async function firstParentSubjects(cwd: string, ref = 'HEAD'): Promise<string[]> {
  return lines(await git(['log', '--first-parent', '--format=%s', ref], cwd));
}

async function findCommit(cwd: string, subject: string, ref = 'HEAD'): Promise<string> {
  return git(['log', '--format=%H', '-1', '--fixed-strings', `--grep=${subject}`, ref], cwd);
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

interface TaskSpec {
  readonly title: string;
  readonly scope: string[];
}

const FIRST: TaskSpec = { title: 'First task', scope: [IN_SCOPE] };
const SECOND: TaskSpec = { title: 'Second task', scope: [SECOND_SCOPE] };

function proposalMarkdown(title: string, dependsOn: readonly string[] = []): string {
  return [
    '---',
    `title: ${title}`,
    `depends_on: [${dependsOn.map((id) => JSON.stringify(id)).join(', ')}]`,
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
  dependsOn: readonly string[] = [],
): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(folderPath, 'proposal.md'),
    proposalMarkdown(title, dependsOn),
    'utf8',
  );
  const taskLines = ['# Tasks', ''];
  specs.forEach((spec, index) => taskLines.push(`- [ ] ${index + 1}. ${spec.title}`));
  taskLines.push('');
  await fs.writeFile(path.join(folderPath, 'tasks.md'), taskLines.join('\n'), 'utf8');
  for (let index = 0; index < specs.length; index += 1) {
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${index + 1}.md`),
      taskMarkdown(specs[index] as TaskSpec),
      'utf8',
    );
  }
}

/** Fake adapter whose spawn runs the scenario's action, then writes its result. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';
  readonly calls: SpawnTaskOptions[] = [];

  constructor(private readonly act: (options: SpawnTaskOptions) => Promise<void>) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.calls.push({ ...options });
    await this.act(options);
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

/** Write `scope` for the task the adapter was handed. */
function writeTaskScope(options: SpawnTaskOptions): Promise<void> {
  const target = options.taskNumber === '1' ? IN_SCOPE : SECOND_SCOPE;
  return fs.writeFile(
    path.join(options.projectRoot, target),
    `task ${options.taskNumber}\n`,
    'utf8',
  );
}

interface Project {
  readonly repo: string;
  readonly worktree: string;
  readonly worktreeFolder: string;
  readonly config: OsqConfig;
}

interface ProjectOptions {
  readonly tasks: readonly TaskSpec[];
  readonly verify?: string;
  readonly gates?: Partial<typeof DEFAULT_GATES_CONFIG>;
}

/** A committed temp repository with one change approved into a linked worktree. */
async function makeProject(options: ProjectOptions): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-worktree-sync-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), options.verify ?? 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, IN_SCOPE), 'seed one\n', 'utf8');
  await fs.writeFile(path.join(repo, SECOND_SCOPE), 'seed two\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  await writeChange(path.join(repo, CHANGE_REL), 'Order Flow', options.tasks);

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({
    vcs,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off', ...(options.gates ?? {}) },
  });
  const result = await approveSpec(repo, '001', config);
  const worktree = result.worktreePath;
  assert.ok(worktree, 'approval created a worktree');
  return { repo, worktree, worktreeFolder: path.join(worktree, CHANGE_REL), config };
}

interface StackProject {
  readonly repo: string;
  readonly config: OsqConfig;
  readonly vcs: VcsConfig;
}

const STACK_ONE = '001-a';
const STACK_TWO = '002-b';
const STACK_ONE_REL = path.posix.join('openspec', 'changes', STACK_ONE);
const STACK_TWO_REL = path.posix.join('openspec', 'changes', STACK_TWO);

/** A temp repository with `001-a` approved and `002-b` written but unapproved. */
async function makeStackProject(): Promise<StackProject> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-worktree-sync-stack-'));
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

  await writeChange(path.join(repo, STACK_ONE_REL), 'One', [
    { title: 'One task', scope: [IN_SCOPE] },
  ]);
  await writeChange(
    path.join(repo, STACK_TWO_REL),
    'Two',
    [{ title: 'Two task', scope: [IN_SCOPE] }],
    ['001'],
  );

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({
    vcs,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off', autoRetries: 0 },
  });
  const result = await approveSpec(repo, '001', config);
  assert.ok(result.worktreePath, 'approval created a worktree for 001');
  return { repo, config, vcs };
}

/** Move `main` forward with one unrelated committed file. */
async function moveMain(project: { repo: string }, name = 'main moves'): Promise<void> {
  await writeAt(project.repo, OTHER, `${name}\n`);
  await git(['add', '--', OTHER], project.repo);
  await git(['commit', '-qm', name], project.repo);
}

describe('Watcher sync', () => {
  it('syncs the default branch before the first task', async () => {
    const project = await makeProject({ tasks: [FIRST] });
    await moveMain(project);

    let headDuringSpawn = '';
    let otherPresent = false;
    const adapter = new ActingAdapter(async (options) => {
      headDuringSpawn = await git(['log', '-1', '--format=%s'], options.projectRoot);
      otherPresent = await exists(path.join(options.projectRoot, OTHER));
      await fs.writeFile(path.join(options.projectRoot, IN_SCOPE), 'task 1\n', 'utf8');
    });

    await runWatcherOnce(project.repo, project.config, adapter);

    assert.equal(headDuringSpawn, 'osq: 001 sync main');
    assert.equal(otherPresent, true);
    assert.equal(await exists(path.join(project.worktree, OTHER)), true);
    assert.deepEqual(await firstParentSubjects(project.worktree), [
      'osq: 001 archived',
      'osq: 001 task 1 verified',
      'osq: 001 sync main',
      'osq: 001 approved',
      'seed',
    ]);
    const sync = await findCommit(project.worktree, 'osq: 001 sync main');
    assert.equal(
      await git(['rev-parse', `${sync}^`], project.worktree),
      await findCommit(project.worktree, 'osq: 001 approved'),
    );
  });

  it('does not sync between tasks, only before archive', async () => {
    const project = await makeProject({ tasks: [FIRST, SECOND] });
    const adapter = new ActingAdapter(writeTaskScope);

    await runWatcherCycle(project.repo, project.config, adapter);
    assert.ok((await commitSubjects(project.worktree)).includes('osq: 001 task 1 verified'));

    await moveMain(project);
    await runWatcherCycle(project.repo, project.config, adapter);

    assert.deepEqual(await firstParentSubjects(project.worktree), [
      'osq: 001 archived',
      'osq: 001 sync main',
      'osq: 001 task 2 verified',
      'osq: 001 task 1 verified',
      'osq: 001 approved',
      'seed',
    ]);
  });

  it('halts with sync_conflict when main changed the same line before archive', async () => {
    const project = await makeProject({ tasks: [FIRST] });
    const adapter = new ActingAdapter(async (options) => {
      await fs.writeFile(path.join(options.projectRoot, IN_SCOPE), 'task edit\n', 'utf8');
      await writeAt(project.repo, IN_SCOPE, 'main edit\n');
      await git(['add', '--', IN_SCOPE], project.repo);
      await git(['commit', '-qm', 'main edits one'], project.repo);
    });

    await runWatcherCycle(project.repo, project.config, adapter);

    const marker = await readRegressed(project.worktreeFolder);
    assert.equal(marker.reason, 'sync_conflict');
    assert.match(marker.body, /src\/one\.txt/);
    assert.equal(await exists(path.join(project.worktree, ARCHIVE_REL, CHANGE_ID)), false);
    assert.ok(!(await commitSubjects(project.worktree)).includes('osq: 001 archived'));
    assert.equal(
      await git(['rev-parse', 'HEAD'], project.worktree),
      await findCommit(project.worktree, 'osq: 001 task 1 verified'),
    );
  });

  it('skips both syncs for a stacked dependent while its dependency waits', async () => {
    const project = await makeStackProject();
    await runWatcherCycle(project.repo, project.config, new ActingAdapter(writeTaskScope));

    const result = await approveSpec(project.repo, '002', project.config);
    assert.equal(result.worktreePath, undefined);
    assert.equal(await exists(stackedPath(project.vcs, project.repo, STACK_TWO)), true);

    await moveMain(project);
    await runWatcherCycle(project.repo, project.config, new ActingAdapter(writeTaskScope));

    const subjects = await firstParentSubjects(project.repo, 'osq/002-b');
    assert.ok(subjects.includes('osq: 002 archived'));
    assert.ok(!subjects.includes('osq: 002 sync main'));
  });

  it('syncs after the dependency lands during the dependent run', async () => {
    const project = await makeStackProject();
    await runWatcherCycle(project.repo, project.config, new ActingAdapter(writeTaskScope));
    await approveSpec(project.repo, '002', project.config);

    const adapter = new ActingAdapter(async (options) => {
      await moveMain(project);
      const land = await landChange(project.repo, project.config, '001');
      assert.equal(land.code, 0);
      await fs.writeFile(
        path.join(options.projectRoot, IN_SCOPE),
        `task ${options.taskNumber}\n`,
        'utf8',
      );
    });

    await runWatcherCycle(project.repo, project.config, adapter);

    const subjects = await firstParentSubjects(project.repo, 'osq/002-b');
    assert.ok(subjects.includes('osq: 002 sync main'));
    assert.ok(subjects.includes('osq: 002 archived'));

    const landed = await landChange(project.repo, project.config, '002');
    assert.equal(landed.code, 0);
  });
});
