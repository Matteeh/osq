import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import type { GatesConfig } from '../src/core/foundation/config-gates.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import {
  DEFAULT_CONFIG,
  type OsqConfig,
  defineConfig,
  loadConfig,
} from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import type { Logger } from '../src/core/foundation/logger.js';
import { retrySpec } from '../src/core/lifecycle/retry.js';
import { commitDeadTask } from '../src/core/run/dead-commit.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { getDeadMarkerPath, getEventsPath } from '../src/core/status/layout.js';
import { selectVcs } from '../src/core/vcs/select.js';
import type { Vcs } from '../src/core/vcs/vcs.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGE_ID = '001-order-flow';
const CHANGE_REL = path.posix.join('openspec', 'changes', CHANGE_ID);
const IN_SCOPE = 'src/one.txt';
const SECOND_SCOPE = 'src/two.txt';

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

async function statusLines(cwd: string): Promise<string[]> {
  const output = await git(['status', '--porcelain'], cwd);
  return output.split('\n').filter((line) => line.trim().length > 0);
}

async function commitSubjects(cwd: string): Promise<string[]> {
  const output = await git(['log', '--format=%s'], cwd);
  return output.split('\n').filter((line) => line.trim().length > 0);
}

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

async function readEvents(folderPath: string, target = 'change'): Promise<ParsedEvent[]> {
  const raw = await fs.readFile(getEventsPath(folderPath, target), 'utf8').catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

function parseMarker(content: string): { reason: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!match) return { reason: '', body: content.trim() };
  const reason = /(?:^|\n)reason:\s*(.+)/.exec(match[1] ?? '')?.[1]?.trim() ?? '';
  return { reason, body: (match[2] ?? '').trim() };
}

async function readRegressed(folderPath: string, name = 'change.md'): Promise<string | null> {
  return fs.readFile(path.join(folderPath, '.run', 'regressed', name), 'utf8').catch(() => null);
}

class CaptureLogger implements Logger {
  readonly infos: string[] = [];
  readonly interactive = false;
  readonly symbols = false;
  info(msg: string): void {
    this.infos.push(msg);
  }
  verbose(_msg: string): void {}
  warn(_msg: string): void {}
  error(_msg: string): void {}
  status(_text: string): void {}
  clearStatus(): void {}
}

/** A verify script that records where it ran, then runs the scenario's body. */
function verifyScript(body: string): string {
  return [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    'if (process.env.OSQ_CHANGE) {',
    "  const dir = path.join(process.env.OSQ_CHANGE, '.run');",
    '  fs.mkdirSync(dir, { recursive: true });',
    "  fs.writeFileSync(path.join(dir, 'verify-env.json'), JSON.stringify({ cwd: process.cwd() }));",
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

interface Project {
  readonly repo: string;
  readonly worktree: string;
  readonly worktreeFolder: string;
  readonly config: OsqConfig;
}

interface ProjectOptions {
  readonly specs: readonly TaskSpec[];
  readonly verify?: string;
  readonly gates?: Partial<GatesConfig>;
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

async function writeChange(
  folderPath: string,
  title: string,
  specs: readonly TaskSpec[],
): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMarkdown(title), 'utf8');
  await fs.writeFile(
    path.join(folderPath, 'tasks.md'),
    ['# Tasks', '', ...specs.map((spec, index) => `- [ ] ${index + 1}. ${spec.title}`), ''].join(
      '\n',
    ),
    'utf8',
  );
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-commit-catch-up-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), options.verify ?? PASSING_VERIFY, 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, 'src', 'existing.txt'), 'seed\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  await writeChange(path.join(repo, CHANGE_REL), 'Order Flow', options.specs);

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

async function installHook(repo: string, body: string): Promise<void> {
  const hooksDir = path.join(repo, '.git', 'hooks');
  await fs.mkdir(hooksDir, { recursive: true });
  await fs.writeFile(path.join(hooksDir, 'pre-commit'), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
}

async function removeHook(repo: string): Promise<void> {
  await fs.rm(path.join(repo, '.git', 'hooks', 'pre-commit'), { force: true });
}

/** Fake adapter whose spawn edits files under the task's project root. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';
  readonly calls: SpawnTaskOptions[] = [];

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.calls.push({ ...options });
    await fs.writeFile(
      path.join(options.projectRoot, options.taskNumber === '1' ? IN_SCOPE : SECOND_SCOPE),
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

/** Count the regressed events carrying reason `commit_failed`. */
function commitFailedEvents(events: readonly ParsedEvent[]): number {
  return events.filter(
    (event) => event.type === 'regressed' && event.data?.reason === 'commit_failed',
  ).length;
}

describe('Commit failure catch-up', () => {
  it('commits a caught-up dead record, clears the halt, and logs it', async () => {
    const project = await setupProject({
      specs: [FIRST, SECOND],
      verify: ALWAYS_FAIL_VERIFY,
      gates: { autoRetries: 0 },
    });
    await installHook(project.repo, 'echo "blocked by hook" >&2\nexit 1');
    const adapter = new ActingAdapter();
    const logger = new CaptureLogger();

    await runWatcherCycle(project.repo, project.config, adapter, logger);
    const halted = await readRegressed(project.worktreeFolder);
    assert.ok(halted, 'the first dead commit halted');
    assert.equal(parseMarker(halted).reason, 'commit_failed');
    assert.equal(
      commitFailedEvents(await readEvents(project.worktreeFolder)),
      1,
      'one commit_failed event after the first halt',
    );

    await removeHook(project.repo);
    await runWatcherCycle(project.repo, project.config, adapter, logger);

    assert.ok(
      (await commitSubjects(project.worktree)).includes('osq: 001 task 1 dead, reason verify_red'),
      'the branch gained the dead commit',
    );
    assert.equal(await readRegressed(project.worktreeFolder), null, 'change.md is gone');
    const retained = await readRegressed(project.worktreeFolder, 'change.1.md');
    assert.ok(retained, 'the halt is kept as change.1.md');
    assert.match(parseMarker(retained).body, /blocked by hook/);
    const events = await readEvents(project.worktreeFolder);
    const last = events.at(-1);
    assert.equal(last?.type, 'retry');
    assert.equal(last?.data?.target, 'change');
    assert.equal(last?.data?.reason, 'commit_failed');
    assert.equal(last?.data?.automatic, true);
    assert.ok(
      logger.infos.some((line) => line.includes('change of 001 caught up after commit_failed')),
      'the catch-up is logged',
    );
    const outside = (await statusLines(project.worktree)).filter(
      (line) => !line.includes(`${CHANGE_REL}/.run/`),
    );
    assert.deepEqual(outside, [], 'the worktree is clean outside the change folder');
  });

  it('clears a commit_failed halt after a verified commit and spawns the next task', async () => {
    const project = await setupProject({ specs: [FIRST, SECOND] });
    await installHook(project.repo, 'echo "blocked by hook" >&2\nexit 1');
    const adapter = new ActingAdapter();

    await runWatcherCycle(project.repo, project.config, adapter);
    assert.equal(adapter.calls.length, 1, 'the first task ran but did not commit');
    assert.ok(await readRegressed(project.worktreeFolder), 'the verified commit halted');

    await removeHook(project.repo);
    await runWatcherCycle(project.repo, project.config, adapter);

    assert.ok(
      (await commitSubjects(project.worktree)).includes('osq: 001 task 1 verified'),
      'the verified commit caught up',
    );
    assert.equal(adapter.calls.length, 2, 'the next task spawned');
    assert.equal(adapter.calls[1]?.taskNumber, '2');
  });

  it('commits a pending dead record before the automatic-retry step and never halts dirty', async () => {
    const project = await setupProject({
      specs: [FIRST, SECOND],
      gates: { autoRetries: 0 },
    });
    const deadDir = path.join(project.worktreeFolder, '.run', 'dead');
    await fs.mkdir(deadDir, { recursive: true });
    await fs.writeFile(
      getDeadMarkerPath(project.worktreeFolder, '1'),
      '---\nreason: verify_red\n---\n',
      'utf8',
    );
    await fs.writeFile(path.join(project.worktree, IN_SCOPE), 'agent edit\n', 'utf8');
    const adapter = new ActingAdapter();

    await runWatcherCycle(project.repo, project.config, adapter);

    assert.ok(
      (await commitSubjects(project.worktree)).includes('osq: 001 task 1 dead, reason verify_red'),
      'the pending dead record committed',
    );
    const marker = await readRegressed(project.worktreeFolder);
    assert.notEqual(parseMarker(marker ?? '').reason, 'worktree_dirty');
    const outside = (await statusLines(project.worktree)).filter(
      (line) => !line.includes(`${CHANGE_REL}/.run/`),
    );
    assert.deepEqual(outside, [], 'the agent edit was discarded');
  });

  it('spends exactly gates.commitRetries catch-ups and then stays halted', async () => {
    const project = await setupProject({
      specs: [FIRST, SECOND],
      verify: ALWAYS_FAIL_VERIFY,
      gates: { autoRetries: 0, commitRetries: 2 },
    });
    await installHook(project.repo, 'echo "blocked by hook" >&2\nexit 1');
    const adapter = new ActingAdapter();

    await runWatcherCycle(project.repo, project.config, adapter);
    const headAfterFirstHalt = await git(['rev-parse', 'HEAD'], project.worktree);

    for (let cycle = 0; cycle < 5; cycle += 1) {
      await runWatcherCycle(project.repo, project.config, adapter);
    }

    const events = await readEvents(project.worktreeFolder);
    assert.equal(
      commitFailedEvents(events),
      3,
      'three commit_failed halts in all (the first plus two catch-ups)',
    );
    assert.equal(
      await git(['rev-parse', 'HEAD'], project.worktree),
      headAfterFirstHalt,
      'the branch tip is unchanged',
    );
  });

  it('lets a human retry grant a new budget so the fixed hook commits and spawns', async () => {
    const project = await setupProject({
      specs: [FIRST, SECOND],
      gates: { autoRetries: 0, commitRetries: 2 },
    });
    await installHook(project.repo, 'echo "blocked by hook" >&2\nexit 1');
    const adapter = new ActingAdapter();

    await runWatcherCycle(project.repo, project.config, adapter);
    for (let cycle = 0; cycle < 5; cycle += 1) {
      await runWatcherCycle(project.repo, project.config, adapter);
    }
    assert.equal(commitFailedEvents(await readEvents(project.worktreeFolder)), 3);

    await removeHook(project.repo);
    await retrySpec(project.repo, '001', 'change', project.config);
    await runWatcherCycle(project.repo, project.config, adapter);

    assert.ok(
      (await commitSubjects(project.worktree)).includes('osq: 001 task 1 verified'),
      'the fixed hook let the verified commit land',
    );
    assert.equal(adapter.calls.length, 2, 'the next task spawned after the catch-up');
  });

  it('leaves a non-commit_failed halt alone', async () => {
    const project = await setupProject({ specs: [FIRST, SECOND] });
    const regressedDir = path.join(project.worktreeFolder, '.run', 'regressed');
    await fs.mkdir(regressedDir, { recursive: true });
    await fs.writeFile(
      path.join(regressedDir, 'change.md'),
      '---\nreason: worktree_dirty\n---\nsrc/out.txt\n',
      'utf8',
    );
    const deadDir = path.join(project.worktreeFolder, '.run', 'dead');
    await fs.mkdir(deadDir, { recursive: true });
    await fs.writeFile(
      getDeadMarkerPath(project.worktreeFolder, '1'),
      '---\nreason: verify_red\n---\n',
      'utf8',
    );
    const head = await git(['rev-parse', 'HEAD'], project.worktree);
    const adapter = new ActingAdapter();

    await runWatcherCycle(project.repo, project.config, adapter);

    assert.ok(!(await commitSubjects(project.worktree)).includes('osq: 001 task 1 dead'));
    assert.equal(commitFailedEvents(await readEvents(project.worktreeFolder)), 0);
    assert.equal(await git(['rev-parse', 'HEAD'], project.worktree), head);
  });
});

describe('Dead task record patch', () => {
  it('replaces a stale patch from an earlier try', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-catch-up-dead-'));
    tmpDirs.push(parent);
    const root = path.join(parent, 'repo');
    await fs.mkdir(root, { recursive: true });
    await git(['init', '-q', '-b', 'main'], root);
    await git(['config', 'user.name', 'osq'], root);
    await git(['config', 'user.email', 'osq@example.invalid'], root);
    await fs.writeFile(path.join(root, 'seed.txt'), 'seed\n', 'utf8');
    const committedFolder = path.join(root, CHANGE_REL);
    await fs.mkdir(path.join(committedFolder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(committedFolder, 'proposal.md'), '# change\n', 'utf8');
    await fs.writeFile(path.join(committedFolder, 'tasks', '1.md'), 'task\n', 'utf8');
    await git(['add', '-A'], root);
    await git(['commit', '-qm', 'seed'], root);

    const worktree = path.join(parent, 'wt');
    await git(['worktree', 'add', '-q', worktree, '-b', 'osq/001-dead'], root);
    const changeFolder = path.join(worktree, CHANGE_REL);
    const deadDir = path.join(changeFolder, '.run', 'dead');
    await fs.mkdir(deadDir, { recursive: true });
    await fs.writeFile(path.join(deadDir, '1.md'), '---\nreason: verify_red\n---\n', 'utf8');
    await fs.writeFile(path.join(deadDir, '1.patch'), 'stale\n', 'utf8');
    await fs.writeFile(path.join(worktree, 'seed.txt'), 'agent changed\n', 'utf8');

    const config: OsqConfig = {
      ...DEFAULT_CONFIG,
      vcs: { enabled: true, author: 'osq <osq@example.invalid>' },
    };
    const vcs = await selectVcs(worktree, config);
    assert.equal(vcs.kind, 'git');

    const commit = await commitDeadTask(
      vcs as Vcs,
      config,
      changeFolder,
      1,
      'verify_red',
      'title',
      '[dead] verify_red',
    );
    const patch = await fs.readFile(path.join(changeFolder, '.run', 'dead', '1.patch'), 'utf8');
    assert.match(patch, /agent changed/);
    assert.doesNotMatch(patch, /stale/);
    const files = (await git(['show', '--pretty=format:', '--name-only', commit], worktree))
      .split('\n')
      .filter((line) => line.length > 0);
    assert.ok(files.some((line) => line.endsWith('.run/dead/1.patch')));
  });
});

describe('Commit catch-up gate key', () => {
  it('defaults commitRetries to two, including a partial gates block', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-commit-retries-'));
    tmpDirs.push(dir);
    const config = await loadConfig(dir);
    assert.equal(config.gates?.commitRetries, 2);
    assert.equal(defineConfig({}).gates?.commitRetries, 2);
    assert.equal(defineConfig({ gates: { preSpawnVerify: 'off' } }).gates?.commitRetries, 2);
  });

  it('rejects a negative, fractional, or non-numeric commitRetries', () => {
    for (const commitRetries of [-1, 1.5, Number.NaN, 'two']) {
      assert.throws(
        () => defineConfig({ gates: { commitRetries } } as never),
        /gates\.commitRetries must be a non-negative integer/,
        `expected gates.commitRetries to reject ${String(commitRetries)}`,
      );
    }
  });

  it('treats a gates object without the key as the default', async () => {
    const project = await setupProject({
      specs: [FIRST, SECOND],
      verify: ALWAYS_FAIL_VERIFY,
      gates: { autoRetries: 0, commitRetries: 2 },
    });
    const withoutKey: OsqConfig = {
      ...project.config,
      gates: { ...project.config.gates, commitRetries: undefined } as GatesConfig,
    };
    await installHook(project.repo, 'echo "blocked by hook" >&2\nexit 1');
    const adapter = new ActingAdapter();

    await runWatcherCycle(project.repo, withoutKey, adapter);
    await runWatcherCycle(project.repo, withoutKey, adapter);
    await runWatcherCycle(project.repo, withoutKey, adapter);

    // The fallback budget is two: the first halt plus two catch-ups, so three
    // commit_failed events in all, exactly as a declared two behaves.
    assert.equal(commitFailedEvents(await readEvents(project.worktreeFolder)), 3);
  });
});
