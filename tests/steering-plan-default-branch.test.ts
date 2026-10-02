import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { CommandError } from '../src/cli/command-error.js';
import { landCommand } from '../src/cli/land.js';
import { lintCommand } from '../src/cli/lint.js';
import { planCommand } from '../src/cli/plan.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGES = path.posix.join('openspec', 'changes');
const ORDERS = path.posix.join('openspec', 'specs', 'orders', 'spec.md');
const WORKTREES = 'worktrees';

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

async function writeAt(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
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
  readonly scope: string;
}

interface ChangeDef {
  readonly folder: string;
  readonly title: string;
  readonly tasks: readonly TaskSpec[];
  readonly delta: string;
}

const ADD_001 = `# Spec Delta: orders

## Purpose

Adds order 001.

## ADDED Requirements

### Requirement: Order 001
The system SHALL add order 001.

#### Scenario: 001 runs
- **WHEN** 001 runs
- **THEN** order 001 is added
`;

const MODIFY_TOTALS = `# Spec Delta: orders

## Purpose

Tightens order totals.

## MODIFIED Requirements

### Requirement: Order totals
The system SHALL total orders per line.

#### Scenario: Totals
- **WHEN** an order arrives
- **THEN** it is totalled
`;

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

const ORDERS_SPEC_ROUNDED = `# orders Specification

## Purpose

Orders are totalled.

## Requirements

### Requirement: Order totals
The system SHALL total orders rounded to cents.

#### Scenario: Totals
- **WHEN** an order arrives
- **THEN** it is totalled
`;

const ONE: ChangeDef = {
  folder: '001-order-flow',
  title: 'Order Flow',
  tasks: [{ title: 'Only task', scope: 'src/one.txt' }],
  delta: ADD_001,
};

const REQUIREMENT_CHANGE: ChangeDef = {
  folder: '001-order-flow',
  title: 'Order Flow',
  tasks: [{ title: 'Only task', scope: 'src/one.txt' }],
  delta: MODIFY_TOTALS,
};

function proposalMarkdown(change: ChangeDef): string {
  return [
    '---',
    `title: ${change.title}`,
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
  await fs.writeFile(path.join(folderPath, 'brief.md'), '# Brief\n\nRevise the plan.\n', 'utf8');
  const lines = ['# Tasks', ''];
  change.tasks.forEach((task, index) => lines.push(`- [ ] ${index + 1}. ${task.title}`));
  lines.push('');
  await fs.writeFile(path.join(folderPath, 'tasks.md'), lines.join('\n'), 'utf8');
  for (const [index, task] of change.tasks.entries()) {
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${index + 1}.md`),
      taskMarkdown(task),
      'utf8',
    );
  }
  await writeAt(folderPath, path.posix.join('specs', 'orders', 'spec.md'), change.delta);
}

/** Fake adapter whose spawn edits the task's scoped file under its project root. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
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

interface Project {
  readonly repo: string;
  readonly worktree: string;
  readonly worktreeFolder: string;
  readonly archivedFolder: string;
  readonly config: OsqConfig;
}

/** A committed temp repository with one change approved into a worktree. */
async function setupWorktree(change: ChangeDef, ordersSpec = ORDERS_SPEC): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-steering-db-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, WORKTREES);
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(
    path.join(repo, 'osq.config.ts'),
    `export default {
  harness: "mock",
  planner: { harness: "mock", model: "mock-planner-model", agent: "mock-planner" },
  vcs: { enabled: true, author: "Osq <osq@example.invalid>", worktreeRoot: ${JSON.stringify(worktrees)} }
};\n`,
    'utf8',
  );
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, 'src', 'seed.txt'), 'seed\n', 'utf8');
  await writeAt(repo, ORDERS, ordersSpec);
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
  assert.ok(result.worktreePath, 'approval created a worktree');
  const worktree = result.worktreePath;
  return {
    repo,
    worktree,
    worktreeFolder: path.join(worktree, CHANGES, change.folder),
    archivedFolder: path.join(worktree, CHANGES, 'archive', change.folder),
    config,
  };
}

/** Run the watcher until the one change archives in its worktree. */
async function archiveAll(project: Project): Promise<void> {
  await runWatcherOnce(project.repo, project.config, new ActingAdapter());
}

async function captureLand(project: Project, id: string): Promise<void> {
  await landCommand(id, {
    cwd: project.repo,
    config: project.config,
    stdout: () => {},
    stderr: () => {},
  }).catch(() => {});
}

/** Move the default branch's copy of `src/one.txt` so a land conflicts. */
async function moveMainFile(project: Project): Promise<void> {
  await writeAt(project.repo, 'src/one.txt', 'main\n');
  await git(['add', '--', 'src/one.txt'], project.repo);
  await git(['commit', '-qm', 'main moves'], project.repo);
}

/** A change-level regressed marker with the frontmatter the sync would give. */
async function writeRegression(folderPath: string, reason: string, body: string): Promise<void> {
  await writeAt(
    folderPath,
    path.posix.join('.run', 'regressed', 'change.md'),
    `---\nreason: ${reason}\n---\n${body}\n`,
  );
}

async function activeFolders(repo: string): Promise<string[]> {
  const entries = await fs.readdir(path.join(repo, CHANGES));
  return entries.filter((entry) => entry !== 'archive' && entry !== 'rejected').sort();
}

describe('osq plan a change the default branch stopped', () => {
  it('writes the restart steering prompt into an archived folder after a land conflict', async () => {
    const project = await setupWorktree(ONE);
    await archiveAll(project);
    await moveMainFile(project);
    await captureLand(project, '001');

    const stdout = await captureStdout(() => planCommand('001', { cwd: project.repo }));

    const prompt = await fs.readFile(path.join(project.archivedFolder, 'plan-prompt.md'), 'utf8');
    assert.ok(prompt.includes('## Steering'));
    assert.ok(prompt.includes('### change conflict (sync_conflict)'));
    assert.ok(
      prompt.includes(
        `Evidence: ${path.join(project.archivedFolder, '.run', 'regressed', 'change.md')}`,
      ),
    );
    assert.ok(prompt.includes('src/one.txt'));
    assert.ok(
      prompt.includes('Approval restarts osq/001-order-flow from main, and every task runs again.'),
    );
    assert.ok(prompt.includes('Every task runs again after the restart.'));
    assert.equal(await exists(path.join(project.repo, CHANGES, ONE.folder)), false);
    assert.deepEqual(await activeFolders(project.repo), [], 'no new change folder was created');
    assert.ok(stdout.includes(project.archivedFolder), 'handoff line names the archived folder');
  });

  it('shows the default branch requirement text under a requirement_changed trigger', async () => {
    const project = await setupWorktree(REQUIREMENT_CHANGE);
    await writeAt(project.repo, ORDERS, ORDERS_SPEC_ROUNDED);
    await git(['add', '--', ORDERS], project.repo);
    await git(['commit', '-qm', 'main changes order totals'], project.repo);
    await writeRegression(
      project.worktreeFolder,
      'requirement_changed',
      '001-order-flow: main changed requirements this change rewrites since it was approved: orders: Order totals; run osq plan 001 to revise the plan against main',
    );

    await captureStdout(() => planCommand('001', { cwd: project.repo }));

    const prompt = await fs.readFile(path.join(project.worktreeFolder, 'plan-prompt.md'), 'utf8');
    assert.ok(prompt.includes('### change requirement_changed (requirement_changed)'));
    assert.ok(prompt.includes('#### orders: Order totals on main'));
    assert.ok(prompt.includes('```'));
    assert.ok(prompt.includes('The system SHALL total orders rounded to cents.'));
    assert.ok(
      prompt.includes(
        'Approval merges main into osq/001-order-flow without running verify; add a task that makes the merged tree pass.',
      ),
    );
  });
});

describe('osq lint a change the default branch stopped', () => {
  it('lints an archived change that needs steering where it is', async () => {
    const project = await setupWorktree(ONE);
    await archiveAll(project);
    await moveMainFile(project);
    await captureLand(project, '001');
    const taskPath = path.join(project.archivedFolder, 'tasks', '1.md');
    const content = await fs.readFile(taskPath, 'utf8');
    await fs.writeFile(taskPath, content.replace(/^verify:.*$/m, 'verify:'), 'utf8');

    const chunks: string[] = [];
    await assert.rejects(
      lintCommand(['001'], {
        cwd: project.repo,
        config: project.config,
        json: true,
        stdout: (text) => chunks.push(text),
      }),
      (error: unknown) => {
        assert.ok(error instanceof CommandError);
        assert.equal(error.message, '');
        assert.equal(error.exitCode, 1);
        return true;
      },
    );

    const document = JSON.parse(chunks.join('')) as {
      valid: boolean;
      changes: Array<{ change: string; findings: Array<{ message: string }> }>;
    };
    assert.equal(document.valid, false);
    assert.equal(document.changes.length, 1);
    assert.equal(document.changes[0]?.change, path.basename(project.archivedFolder));
    assert.ok(
      document.changes[0]?.findings.some((finding) =>
        finding.message.includes('verify command is empty'),
      ),
      JSON.stringify(document.changes[0]?.findings),
    );
  });
});
