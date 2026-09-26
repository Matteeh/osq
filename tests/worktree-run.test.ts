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
import { findChange } from '../src/core/status/change-locations.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { checkWorktree, haltWorktreeChange } from '../src/watcher/worktree-run.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGE_ID = '001-order-flow';
const CHANGE_REL = path.posix.join('openspec', 'changes', CHANGE_ID);
const IN_SCOPE = 'src/one.txt';
const SECOND_SCOPE = 'src/two.txt';
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

/** Every non-empty porcelain status line, untracked files one by one. */
async function statusLines(cwd: string): Promise<string[]> {
  const output = await git(['status', '--porcelain'], cwd);
  return output.split('\n').filter((line) => line.trim().length > 0);
}

async function commitSubjects(cwd: string): Promise<string[]> {
  const output = await git(['log', '--format=%s'], cwd);
  return output.split('\n').filter((line) => line.trim().length > 0);
}

async function findCommit(cwd: string, subject: string): Promise<string> {
  return git(['log', '--format=%H', '-1', '--fixed-strings', `--grep=${subject}`], cwd);
}

async function commitFiles(cwd: string, sha: string): Promise<string[]> {
  const output = await git(['show', '--pretty=format:', '--name-only', sha], cwd);
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();
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

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

async function readEvents(specFolder: string, target = '1'): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(specFolder, '.run', 'events', `${target}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

/** A verify script that records where it ran, then runs the scenario's body. */
function verifyScript(body: string): string {
  return [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    'if (process.env.OSQ_CHANGE) {',
    "  const dir = path.join(process.env.OSQ_CHANGE, '.run');",
    '  fs.mkdirSync(dir, { recursive: true });',
    "  fs.writeFileSync(path.join(dir, 'verify-env.json'), JSON.stringify({ cwd: process.cwd(), change: process.env.OSQ_CHANGE }));",
    '}',
    body,
    '',
  ].join('\n');
}

const PASSING_VERIFY = verifyScript('process.exit(0);');
const ALWAYS_FAIL_VERIFY = verifyScript("console.error('verify red'); process.exit(1);");

interface TaskSpec {
  readonly title: string;
  readonly scope: string[];
}

const FIRST: TaskSpec = { title: 'First task', scope: [IN_SCOPE] };
const SECOND: TaskSpec = { title: 'Second task', scope: [SECOND_SCOPE] };
const THIRD: TaskSpec = { title: 'Third task', scope: ['src/three.txt'] };

interface Project {
  readonly repo: string;
  readonly worktree: string;
  readonly checkoutFolder: string;
  readonly worktreeFolder: string;
  readonly config: OsqConfig;
}

interface ProjectOptions {
  readonly specs: readonly TaskSpec[];
  readonly verify?: string;
  readonly gates?: Partial<typeof DEFAULT_GATES_CONFIG>;
}

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

async function writeChange(
  folderPath: string,
  title: string,
  specs: readonly TaskSpec[],
): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMarkdown(title), 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks.md'), tasksMarkdown(specs), 'utf8');
  for (let index = 0; index < specs.length; index += 1) {
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${index + 1}.md`),
      taskMarkdown(specs[index] as TaskSpec),
      'utf8',
    );
  }
}

/** A committed temp repository with one change approved into a linked worktree. */
async function setupProject(options: ProjectOptions): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-worktree-run-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), options.verify ?? PASSING_VERIFY, 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, OUT_SCOPE), 'out\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const checkoutFolder = path.join(repo, CHANGE_REL);
  await writeChange(checkoutFolder, 'Order Flow', options.specs);

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
  return {
    repo,
    worktree,
    checkoutFolder,
    worktreeFolder: path.join(worktree, CHANGE_REL),
    config,
  };
}

async function installHook(repo: string, body: string): Promise<void> {
  const hooksDir = path.join(repo, '.git', 'hooks');
  await fs.mkdir(hooksDir, { recursive: true });
  await fs.writeFile(path.join(hooksDir, 'pre-commit'), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
}

async function tickTask(folderPath: string, task: number): Promise<void> {
  const tasksPath = path.join(folderPath, 'tasks.md');
  const content = await fs.readFile(tasksPath, 'utf8');
  await fs.writeFile(
    tasksPath,
    content.replace(new RegExp(`- \\[ \\] ${task}\\.`), `- [x] ${task}.`),
    'utf8',
  );
}

/** Fake adapter whose spawn edits files under the task's project root. */
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

describe('Worktree run', () => {
  it('runs the task in the worktree with OSQ_CHANGE set', async () => {
    const project = await setupProject({ specs: [FIRST, SECOND] });
    const adapter = new ActingAdapter(writeTaskScope);

    const summary = await runWatcherCycle(project.repo, project.config, adapter);

    assert.equal(summary.tasksRun, 1);
    assert.equal(adapter.calls.length, 1);
    assert.equal(
      await fs.realpath(adapter.calls[0]?.projectRoot ?? ''),
      await fs.realpath(project.worktree),
    );
    const env = JSON.parse(
      await fs.readFile(path.join(project.worktreeFolder, '.run', 'verify-env.json'), 'utf8'),
    ) as { cwd: string; change: string };
    assert.equal(await fs.realpath(env.cwd), await fs.realpath(project.worktree));
    assert.equal(await fs.realpath(env.change), await fs.realpath(project.worktreeFolder));
    assert.equal(await exists(path.join(project.checkoutFolder, '.run', 'done', '1')), false);
    assert.equal(await exists(path.join(project.repo, IN_SCOPE)), false);
    assert.equal(await exists(path.join(project.worktree, IN_SCOPE)), true);
  });

  it('halts a dirty worktree and a human clears the halt', async () => {
    const project = await setupProject({ specs: [FIRST, SECOND] });
    await fs.writeFile(path.join(project.worktree, OUT_SCOPE), 'dirty\n', 'utf8');
    const adapter = new ActingAdapter(writeTaskScope);

    const halted = await runWatcherCycle(project.repo, project.config, adapter);

    assert.equal(halted.tasksRun, 0);
    assert.equal(adapter.calls.length, 0);
    const marker = await readRegressed(project.worktreeFolder);
    assert.equal(marker.reason, 'worktree_dirty');
    assert.match(marker.body, /src\/out\.txt/);

    await fs.writeFile(path.join(project.worktree, OUT_SCOPE), 'out\n', 'utf8');
    await retrySpec(project.repo, '1', 'change', project.config);

    const summary = await runWatcherCycle(project.repo, project.config, adapter);
    assert.equal(summary.tasksRun, 1);
    assert.equal(adapter.calls.length, 1);
  });

  it('treats uncommitted records and a ticked tasks.md as not dirt', async () => {
    const project = await setupProject({
      specs: [FIRST, SECOND, THIRD],
      gates: { autoRetries: 0 },
    });
    await fs.mkdir(path.join(project.worktreeFolder, '.run', 'done'), { recursive: true });
    await fs.writeFile(
      path.join(project.worktreeFolder, '.run', 'done', '1'),
      '---\nmanual: true\n---\n\n',
      'utf8',
    );
    await tickTask(project.worktreeFolder, 1);
    const adapter = new ActingAdapter(writeTaskScope);

    const summary = await runWatcherCycle(project.repo, project.config, adapter);

    assert.equal(summary.tasksRun, 1);
    assert.equal(adapter.calls.length, 1);
    assert.equal(adapter.calls[0]?.taskNumber, '2');
    const status = await statusLines(project.worktree);
    assert.ok(status.some((line) => line.includes('.run/done/1')));
  });
});

describe('Worktree halt', () => {
  it('reports an off-branch worktree and writes the halt marker and event', async () => {
    const project = await setupProject({ specs: [FIRST, SECOND] });
    const located = await findChange(project.repo, project.config, '1');
    await git(['switch', '-c', 'feature'], project.worktree);

    const halt = await checkWorktree(located, project.config);
    assert.equal(halt?.reason, 'worktree_off_branch');
    assert.match(halt?.detail ?? '', /feature/);
    assert.ok(halt);
    await haltWorktreeChange(located, '001', halt, undefined);

    const marker = await readRegressed(project.worktreeFolder);
    assert.equal(marker.reason, 'worktree_off_branch');
    assert.match(marker.body, /feature/);
    const events = await readEvents(project.worktreeFolder, 'change');
    assert.ok(
      events.some(
        (event) => event.type === 'regressed' && event.data?.reason === 'worktree_off_branch',
      ),
    );
  });
});

describe('Verified task commit', () => {
  it('commits two tasks in task order with only each task files and records', async () => {
    const project = await setupProject({ specs: [FIRST, SECOND] });
    const adapter = new ActingAdapter(writeTaskScope);

    await runWatcherCycle(project.repo, project.config, adapter);
    await runWatcherCycle(project.repo, project.config, adapter);

    const subjects = await commitSubjects(project.worktree);
    assert.deepEqual(subjects.slice(0, 4), [
      'osq: 001 archived',
      'osq: 001 task 2 verified',
      'osq: 001 task 1 verified',
      'osq: 001 approved',
    ]);
    const first = await findCommit(project.worktree, 'osq: 001 task 1 verified');
    const firstFiles = await commitFiles(project.worktree, first);
    assert.ok(firstFiles.includes(`${CHANGE_REL}/.run/done/1`));
    assert.ok(firstFiles.includes(IN_SCOPE));
    assert.ok(!firstFiles.includes(SECOND_SCOPE));
    const second = await findCommit(project.worktree, 'osq: 001 task 2 verified');
    const secondFiles = await commitFiles(project.worktree, second);
    assert.ok(secondFiles.includes(`${CHANGE_REL}/.run/done/2`));
    assert.ok(secondFiles.includes(SECOND_SCOPE));
  });

  it('commits a new test file outside the task scope', async () => {
    const project = await setupProject({ specs: [FIRST] });
    const adapter = new ActingAdapter(async (options) => {
      await fs.mkdir(path.join(options.projectRoot, 'tests'), { recursive: true });
      await fs.writeFile(
        path.join(options.projectRoot, 'tests', 'new.test.ts'),
        'export {};\n',
        'utf8',
      );
    });

    await runWatcherCycle(project.repo, project.config, adapter);

    const sha = await findCommit(project.worktree, 'osq: 001 task 1 verified');
    assert.ok((await commitFiles(project.worktree, sha)).includes('tests/new.test.ts'));
  });

  it('commits a done task the watcher had not committed before the next spawn', async () => {
    const project = await setupProject({ specs: [FIRST, SECOND] });
    const firstRun = new ActingAdapter(writeTaskScope);
    await runWatcherCycle(project.repo, project.config, firstRun);
    assert.ok((await commitSubjects(project.worktree)).includes('osq: 001 task 1 verified'));

    // Simulate the watcher stopping between the done marker and its commit.
    await git(['reset', '--mixed', 'HEAD~1'], project.worktree);

    const adapter = new ActingAdapter(writeTaskScope);
    await runWatcherCycle(project.repo, project.config, adapter);

    assert.ok((await commitSubjects(project.worktree)).includes('osq: 001 task 1 verified'));
    assert.equal(adapter.calls.length, 1);
    assert.equal(adapter.calls[0]?.taskNumber, '2');
  });
});

describe('Archive commit', () => {
  it('archives with a commit that leaves the worktree clean', async () => {
    const project = await setupProject({ specs: [FIRST] });
    const adapter = new ActingAdapter(writeTaskScope);

    await runWatcherCycle(project.repo, project.config, adapter);

    const subjects = await commitSubjects(project.worktree);
    assert.equal(subjects[0], 'osq: 001 archived');
    const body = await git(['log', '-1', '--format=%B'], project.worktree);
    assert.match(body, /archived to openspec\/changes\/archive\/001-order-flow/);
    assert.match(body, /Osq-Change: 001-order-flow/);
    assert.deepEqual(await statusLines(project.worktree), []);
    assert.equal(
      await exists(path.join(project.worktree, CHANGE_REL, '..', 'archive', CHANGE_ID)),
      true,
    );
  });
});

describe('Commit failure', () => {
  it('halts on a rejected commit and retries it after the hook is fixed', async () => {
    const project = await setupProject({ specs: [FIRST, SECOND] });
    await installHook(project.repo, 'echo "blocked by hook" >&2\nexit 1');
    const adapter = new ActingAdapter(writeTaskScope);

    await runWatcherCycle(project.repo, project.config, adapter);

    assert.equal(adapter.calls.length, 1);
    const marker = await readRegressed(project.worktreeFolder);
    assert.equal(marker.reason, 'commit_failed');
    assert.match(marker.body, /blocked by hook/);
    const headAfterHalt = await git(['rev-parse', 'HEAD'], project.worktree);
    assert.equal((await commitSubjects(project.worktree))[0], 'osq: 001 approved');

    await runWatcherCycle(project.repo, project.config, adapter);
    assert.equal(adapter.calls.length, 1);
    assert.equal(await git(['rev-parse', 'HEAD'], project.worktree), headAfterHalt);

    await fs.rm(path.join(project.repo, '.git', 'hooks', 'pre-commit'), { force: true });
    await retrySpec(project.repo, '1', 'change', project.config);
    await runWatcherCycle(project.repo, project.config, adapter);

    assert.equal(adapter.calls.length, 2);
    assert.ok((await commitSubjects(project.worktree)).includes('osq: 001 task 1 verified'));
  });
});

describe('Dead path in a worktree', () => {
  it('commits a verify failure, restores the agent edits, and keeps the patch', async () => {
    const project = await setupProject({
      specs: [FIRST, SECOND],
      verify: ALWAYS_FAIL_VERIFY,
      gates: { autoRetries: 0 },
    });
    const adapter = new ActingAdapter(writeTaskScope);

    await runWatcherCycle(project.repo, project.config, adapter);

    assert.ok(
      (await commitSubjects(project.worktree)).includes('osq: 001 task 1 dead, reason verify_red'),
    );
    assert.equal(await exists(path.join(project.worktree, IN_SCOPE)), false);
    const patch = await fs.readFile(
      path.join(project.worktreeFolder, '.run', 'dead', '1.patch'),
      'utf8',
    );
    assert.match(patch, /one/);
    const outside = (await statusLines(project.worktree)).filter(
      (line) => !line.includes(`${CHANGE_REL}/.run/`),
    );
    assert.deepEqual(outside, []);
  });

  it('commits a crash the reaper finds after a restart', async () => {
    const project = await setupProject({ specs: [FIRST, SECOND], gates: { autoRetries: 0 } });
    await fs.writeFile(path.join(project.worktree, IN_SCOPE), 'crash edit\n', 'utf8');
    const runningDir = path.join(project.worktreeFolder, '.run', 'running');
    await fs.mkdir(runningDir, { recursive: true });
    await fs.writeFile(
      path.join(runningDir, '1.pid'),
      JSON.stringify({ pid: 999999, startedAt: Date.now() }),
      'utf8',
    );
    const adapter = new ActingAdapter(writeTaskScope);

    await runWatcherCycle(project.repo, project.config, adapter);

    assert.equal(adapter.calls.length, 0);
    assert.ok(
      (await commitSubjects(project.worktree)).includes('osq: 001 task 1 dead, reason crashed'),
    );
    assert.equal(await exists(path.join(project.worktree, IN_SCOPE)), false);
    const patch = await fs.readFile(
      path.join(project.worktreeFolder, '.run', 'dead', '1.patch'),
      'utf8',
    );
    assert.match(patch, /crash edit/);
  });
});

describe('Automatic retry', () => {
  it('retries a scope violation and names the violating file', async () => {
    const project = await setupProject({ specs: [FIRST, SECOND] });
    const adapter = new ActingAdapter(async (options) => {
      if (options.attempt === 2) {
        await fs.writeFile(path.join(options.projectRoot, IN_SCOPE), 'one\n', 'utf8');
        return;
      }
      await fs.writeFile(path.join(options.projectRoot, OUT_SCOPE), 'out of scope\n', 'utf8');
    });

    await runWatcherCycle(project.repo, project.config, adapter);
    assert.equal(adapter.calls.length, 1);
    const dead = await fs.readFile(
      path.join(project.worktreeFolder, '.run', 'dead', '1.md'),
      'utf8',
    );
    assert.match(dead, /scope_violation/);

    await runWatcherCycle(project.repo, project.config, adapter);

    assert.equal(adapter.calls.length, 2);
    assert.equal(adapter.calls[1]?.attempt, 2);
    assert.match(adapter.calls[1]?.priorFailureOutput ?? '', /src\/out\.txt/);
    const events = await readEvents(project.worktreeFolder, '1');
    assert.ok(events.some((event) => event.type === 'retry' && event.data?.automatic === true));
  });
});
