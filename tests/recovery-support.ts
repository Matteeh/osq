import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { approveCommand } from '../src/cli/approve.js';
import { CommandError } from '../src/cli/command-error.js';
import type { Writer } from '../src/cli/command-inputs.js';
import { landCommand } from '../src/cli/land.js';
import { retryCommand } from '../src/cli/retry.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { worktreePath } from '../src/core/vcs/worktree.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { type WatcherSummary, runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

/**
 * Setup every recovery test of change 172 shares: a temporary git repository
 * whose single change runs in an osq worktree, driven through the same command
 * functions `osq approve`, `osq retry`, `osq land` and `osq watch --once` run.
 *
 * Tasks 2 to 7 import this file and never edit it.
 */

const execFileAsync = promisify(execFile);

/** The one change every recovery project holds. */
export const CHANGE_ID = '001-order-flow';
const CHANGE_REL = path.posix.join('openspec', 'changes', CHANGE_ID);
const ARCHIVE_REL = path.posix.join('openspec', 'changes', 'archive', CHANGE_ID);
const ORDERS = path.posix.join('openspec', 'specs', 'orders', 'spec.md');

/** One task of the recovery change: a title and a single-file scope. */
export interface RecoveryTask {
  readonly title: string;
  readonly scope: string;
}

/** What `createRecoveryProject` needs to build the fixture. */
export interface RecoveryProjectOptions {
  readonly tasks: readonly RecoveryTask[];
  /** `verify.cjs` contents; defaults to the `bad` check. */
  readonly verify?: string;
  /** `gates.autoRetries` for the project's config; defaults to 0. */
  readonly autoRetries?: number;
  /** Proposal frontmatter `check:`, when given. */
  readonly check?: string;
  /** Extra committed files, keyed by project-relative path. */
  readonly files?: Record<string, string>;
}

/** The captured output and exit code of one command method. */
export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** The recovery fixture, with the command functions a run would use. */
export interface RecoveryProject {
  readonly repo: string;
  readonly worktree: string;
  readonly config: OsqConfig;
  readonly changeFolder: string;
  readonly archivedFolder: string;
  approve(): Promise<CommandResult>;
  retry(target: string): Promise<CommandResult>;
  land(): Promise<CommandResult>;
  watchOnce(adapter: HarnessAdapter): Promise<WatcherSummary>;
}

/** The test's own git calls ignore redirecting variables, like osq's reads. */
function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) {
    Reflect.deleteProperty(env, key);
  }
  return env;
}

/** Run one git command and return its trimmed stdout. */
export async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, env: cleanGitEnv() });
  return stdout.trim();
}

/** Write `content` at `relative` under `root`, creating parent folders. */
export async function writeAt(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** Whether `target` exists. */
export async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

/** The commit subjects in `cwd`, newest first, at `ref` when given. */
export async function subjects(cwd: string, ref?: string): Promise<string[]> {
  const args = ['log', '--format=%s'];
  if (ref !== undefined) args.push(ref);
  const output = await git(args, cwd);
  return output.split('\n').filter((line) => line.trim().length > 0);
}

/** Fail, with the command's output, unless it exited 0. */
export function assertOk(command: CommandResult, label: string): void {
  assert.equal(
    command.exitCode,
    0,
    `${label} exited ${command.exitCode}\nstdout:\n${command.stdout}\nstderr:\n${command.stderr}`,
  );
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const ORDERS_SPEC = `# orders Specification

## Purpose

Orders are totalled.

## Requirements

### Requirement: Order totals
The system SHALL total orders.

#### Scenario: Totals
- **WHEN** an order arrives
- **THEN** it is totalled
`;

const DELTA = `# Spec Delta: orders

## Purpose

Adds order 001.

## ADDED Requirements

### Requirement: Order 001
The system SHALL add order 001.

#### Scenario: 001 runs
- **WHEN** 001 runs
- **THEN** order 001 is added
`;

/** The default `verify.cjs`: red while a scoped file holds `bad`. */
const DEFAULT_VERIFY = `${[
  "const fs = require('node:fs');",
  "const files = ['src/one.txt', 'src/two.txt', 'src/three.txt'];",
  'const bad = files.some(',
  "  (file) => fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes('bad'),",
  ');',
  'process.exit(bad ? 1 : 0);',
].join('\n')}\n`;

function proposalMarkdown(check?: string): string {
  const lines = [
    '---',
    'title: Order Flow',
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
  ];
  if (check !== undefined) lines.push(`check: ${check}`);
  lines.push(
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
  );
  return lines.join('\n');
}

function taskFile(task: RecoveryTask, acceptance: string): string {
  return [
    '---',
    `title: ${task.title}`,
    'verify: node verify.cjs',
    `scope: ${JSON.stringify([task.scope])}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    acceptance,
    '',
  ].join('\n');
}

function defaultAcceptance(task: RecoveryTask): string {
  return `- [ ] ${task.title} does the thing`;
}

async function writeChange(
  folderPath: string,
  tasks: readonly RecoveryTask[],
  check?: string,
): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMarkdown(check), 'utf8');
  const lines = ['# Tasks', ''];
  tasks.forEach((task, index) => lines.push(`- [ ] ${index + 1}. ${task.title}`));
  lines.push('');
  await fs.writeFile(path.join(folderPath, 'tasks.md'), lines.join('\n'), 'utf8');
  for (const [index, task] of tasks.entries()) {
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${index + 1}.md`),
      taskFile(task, defaultAcceptance(task)),
      'utf8',
    );
  }
  await writeAt(folderPath, path.posix.join('specs', 'orders', 'spec.md'), DELTA);
}

/** Rewrite `tasks/<n>.md` with a different acceptance line. */
export async function reviseTask(folder: string, n: number, task: RecoveryTask): Promise<void> {
  await fs.writeFile(
    path.join(folder, 'tasks', `${n}.md`),
    taskFile(task, `- [ ] ${task.title} is revised`),
    'utf8',
  );
}

/** Append task `n` to `tasks.md` and write its `tasks/<n>.md`. */
export async function addTask(folder: string, n: number, task: RecoveryTask): Promise<void> {
  const tasksPath = path.join(folder, 'tasks.md');
  const content = await fs.readFile(tasksPath, 'utf8');
  const line = `- [ ] ${n}. ${task.title}`;
  const trimmed = content.trimEnd();
  await fs.writeFile(tasksPath, trimmed.length > 0 ? `${trimmed}\n${line}\n` : `${line}\n`, 'utf8');
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(folder, 'tasks', `${n}.md`),
    taskFile(task, defaultAcceptance(task)),
    'utf8',
  );
}

/** Write and commit `files` on the checkout's default branch; return its commit. */
export async function commitMain(repo: string, files: Record<string, string>): Promise<string> {
  for (const [relative, content] of Object.entries(files)) {
    await writeAt(repo, relative, content);
  }
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'main moves'], repo);
  return git(['rev-parse', 'HEAD'], repo);
}

/** The config every recovery project and its child watcher build. */
export function recoveryConfig(worktreeRoot: string, autoRetries: number): OsqConfig {
  return defineConfig({
    vcs: {
      enabled: true,
      author: 'Osq <osq@example.invalid>',
      worktreeRoot,
    },
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off', autoRetries },
  });
}

async function captureCommand(
  run: (stdout: Writer, stderr: Writer) => Promise<void>,
): Promise<CommandResult> {
  let stdout = '';
  let stderr = '';
  const capture = (chunk: string): void => {
    stdout += chunk;
  };
  const captureErr = (chunk: string): void => {
    stderr += chunk;
  };
  try {
    await run(capture, captureErr);
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    const parts: string[] = [];
    if (error.message.length > 0) parts.push(error.message);
    if (error.next !== undefined) parts.push(`Next: ${error.next}`);
    for (const part of parts) stderr += part.endsWith('\n') ? part : `${part}\n`;
    return { stdout, stderr, exitCode: error.exitCode };
  }
}

function makeProject(repo: string, worktree: string, config: OsqConfig): RecoveryProject {
  return {
    repo,
    worktree,
    config,
    changeFolder: path.join(worktree, CHANGE_REL),
    archivedFolder: path.join(worktree, ARCHIVE_REL),
    approve: () =>
      captureCommand((stdout, stderr) =>
        approveCommand(['001'], { cwd: repo, config, planningReaders: [], stdout, stderr }),
      ),
    retry: (target) =>
      captureCommand((stdout, stderr) =>
        retryCommand('001', target, { cwd: repo, config, stdout, stderr }),
      ),
    land: () =>
      captureCommand((stdout, stderr) =>
        landCommand('001', { cwd: repo, config, stdout, stderr, allowStale: true }),
      ),
    watchOnce: (adapter) => runWatcherOnce(repo, config, adapter),
  };
}

/** The script `ScriptedAdapter` runs for each spawn; `call` counts from 1. */
export type ScriptedSpawn = (
  options: SpawnTaskOptions,
  call: number,
) => Promise<string | null> | string | null;

/**
 * A fake adapter whose spawn writes the script's content to the task's first
 * scoped file, unless the script returns null, then writes `.run/results/<n>.md`
 * and exits 0. Without a script it writes `task <n>\n`.
 */
export class ScriptedAdapter implements HarnessAdapter {
  readonly name = 'scripted';
  readonly calls: SpawnTaskOptions[] = [];
  private readonly script: ScriptedSpawn;

  constructor(script?: ScriptedSpawn) {
    this.script = script ?? ((options: SpawnTaskOptions) => `task ${options.taskNumber}\n`);
  }

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.calls.push({ ...options });
    const call = this.calls.length;
    const content = await this.script(options, call);
    const target = options.scope[0];
    if (content !== null && target !== undefined) {
      await writeAt(options.projectRoot, target, content);
    }
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(path.join(resultsDir, `${options.taskNumber}.md`), '# Agent result\n');
    return { exitCode: 0 };
  }
}

/**
 * Build the temporary repository one recovery test starts from: a committed
 * project on `main` and an unapproved `001-order-flow` change with one task per
 * entry, an `orders` ADDED delta, and a proposal carrying `check:` when given.
 * The change folder is not committed and the change is not approved.
 */
export async function createRecoveryProject(
  tmpDirs: string[],
  options: RecoveryProjectOptions,
): Promise<RecoveryProject> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-recovery-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), options.verify ?? DEFAULT_VERIFY, 'utf8');
  await writeAt(repo, ORDERS, ORDERS_SPEC);
  await writeAt(repo, 'src/seed.txt', 'seed\n');
  for (const [relative, content] of Object.entries(options.files ?? {})) {
    await writeAt(repo, relative, content);
  }
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  await writeChange(path.join(repo, CHANGE_REL), options.tasks, options.check);

  const config = recoveryConfig(worktrees, options.autoRetries ?? 0);
  const vcs = config.vcs ?? { enabled: false };
  const worktree = worktreePath(vcs, repo, CHANGE_ID);
  return makeProject(repo, worktree, config);
}
