import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { CommandError } from '../src/cli/command-error.js';
import { landCommand } from '../src/cli/land.js';
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
const ARCHIVE = path.posix.join(CHANGES, 'archive');
const ORDERS = path.posix.join('openspec', 'specs', 'orders', 'spec.md');
const BILLING = path.posix.join('openspec', 'specs', 'billing', 'spec.md');
const BOGUS_HASH = '0'.repeat(40);

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

async function writeAt(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

interface Capture {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

async function captureLand(cwd: string, config: OsqConfig, id: string): Promise<Capture> {
  let stdout = '';
  let stderr = '';
  let exitCode: number | null = null;
  try {
    await landCommand(id, {
      cwd,
      config,
      stdout: (msg) => {
        stdout += msg;
      },
      stderr: (msg) => {
        stderr += msg;
      },
    });
    exitCode = 0;
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
  readonly capability: string;
  readonly tasks: readonly TaskSpec[];
  readonly delta: string;
}

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

const BILLING_SPEC = `# billing Specification

## Purpose

Invoices are issued.

## Requirements

### Requirement: Invoice totals
The system SHALL total invoices.

#### Scenario: Totals
- **WHEN** an invoice arrives
- **THEN** it is totalled
`;

const ADD_001_ORDERS = `# Spec Delta: orders

## Purpose

Adds order 001.

## ADDED Requirements

### Requirement: Order 001
The system SHALL add order 001.

#### Scenario: 001 runs
- **WHEN** 001 runs
- **THEN** order 001 is added
`;

const ADD_002_ORDERS = `# Spec Delta: orders

## Purpose

Adds order 002.

## ADDED Requirements

### Requirement: Order 002
The system SHALL add order 002.

#### Scenario: 002 runs
- **WHEN** 002 runs
- **THEN** order 002 is added
`;

const ADD_002_BILLING = `# Spec Delta: billing

## Purpose

Adds invoice 002.

## ADDED Requirements

### Requirement: Invoice 002
The system SHALL invoice order 002.

#### Scenario: 002 bills
- **WHEN** 002 runs
- **THEN** invoice 002 is added
`;

const ADD_003_ORDERS = `# Spec Delta: orders

## Purpose

Adds order 003.

## ADDED Requirements

### Requirement: Order 003
The system SHALL add order 003.

#### Scenario: 003 runs
- **WHEN** 003 runs
- **THEN** order 003 is added
`;

const ONE_ORDERS: ChangeDef = {
  folder: '001-order-flow',
  title: 'Order Flow',
  goal: 'Run the tasks.',
  capability: 'orders',
  tasks: [{ title: 'Only task', scope: 'src/one.txt' }],
  delta: ADD_001_ORDERS,
};

const TWO_ORDERS: ChangeDef = {
  folder: '002-second',
  title: 'Second',
  goal: 'Add the second thing.',
  capability: 'orders',
  tasks: [{ title: 'Only task', scope: 'src/two.txt' }],
  delta: ADD_002_ORDERS,
};

const TWO_BILLING: ChangeDef = {
  folder: '002-second',
  title: 'Second',
  goal: 'Add the second thing.',
  capability: 'billing',
  tasks: [{ title: 'Only task', scope: 'src/two.txt' }],
  delta: ADD_002_BILLING,
};

const THREE_ORDERS: ChangeDef = {
  folder: '003-third',
  title: 'Third',
  goal: 'Add the third thing.',
  capability: 'orders',
  tasks: [{ title: 'Only task', scope: 'src/three.txt' }],
  delta: ADD_003_ORDERS,
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
  await fs.writeFile(path.join(folderPath, 'tasks.md'), '# Tasks\n\n- [ ] 1. Only task\n', 'utf8');
  await fs.writeFile(
    path.join(folderPath, 'tasks', '1.md'),
    taskMarkdown(change.tasks[0] as TaskSpec),
    'utf8',
  );
  await writeAt(folderPath, path.posix.join('specs', change.capability, 'spec.md'), change.delta);
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
  readonly config: OsqConfig;
}

/** A committed temp repository that holds the living specs, ready for changes. */
async function makeRepo(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcs-land-stacked-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktreeRoot = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, 'src', 'seed.txt'), 'seed\n', 'utf8');
  await writeAt(repo, ORDERS, ORDERS_SPEC);
  await writeAt(repo, BILLING, BILLING_SPEC);
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot,
  };
  const config = defineConfig({
    vcs,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
  });
  return { repo, config };
}

/** Approve `change` into its worktree and run the watcher until it archives. */
async function approveAndArchive(project: Project, change: ChangeDef): Promise<string> {
  const id = change.folder.split('-')[0] as string;
  await writeChange(path.join(project.repo, CHANGES, change.folder), change);
  const result = await approveSpec(project.repo, id, project.config);
  assert.ok(result.worktreePath, `approval created a worktree for ${id}`);
  await runWatcherOnce(project.repo, project.config, new ActingAdapter());
  return result.worktreePath;
}

/**
 * Write `folder`'s `.run/stacked-on` into its archived folder in `worktree`,
 * naming each entry there, and commit it on the worktree's branch.
 */
async function writeStackedOn(
  worktree: string,
  folder: string,
  names: readonly string[],
): Promise<void> {
  const relative = path.posix.join(ARCHIVE, folder, '.run', 'stacked-on');
  const body = `${names.map((name) => `${name} ${BOGUS_HASH}`).join('\n')}\n`;
  await writeAt(worktree, relative, body);
  await git(['add', '--', relative], worktree);
  await git(['commit', '-qm', `stacked-on ${folder}`], worktree);
}

describe('osq land on stacked changes', () => {
  it('Earlier change shares a capability', async () => {
    const project = await makeRepo();
    await approveAndArchive(project, ONE_ORDERS);
    await approveAndArchive(project, TWO_ORDERS);

    const capture = await captureLand(project.repo, project.config, '002');

    assert.equal(capture.exitCode, 1);
    assert.equal(capture.stdout, '');
    assert.equal(
      capture.stderr,
      '001-order-flow archived before 002-second and also writes orders; land it first\n',
    );
  });

  it('Earlier change stacked on this one', async () => {
    const project = await makeRepo();
    const second = await approveAndArchive(project, TWO_ORDERS);
    await writeStackedOn(second, TWO_ORDERS.folder, [ONE_ORDERS.folder]);
    await approveAndArchive(project, ONE_ORDERS);

    const first = await captureLand(project.repo, project.config, '001');
    assert.equal(first.exitCode, 0);
    assert.equal(first.stderr, '');
    assert.ok(first.stdout.startsWith('Landed 001-order-flow as '));

    const later = await captureLand(project.repo, project.config, '002');
    assert.equal(later.exitCode, 0);
    assert.ok(later.stdout.startsWith('Landed 002-second as '));
  });

  it('Earlier change stacked through another', async () => {
    const project = await makeRepo();
    const third = await approveAndArchive(project, THREE_ORDERS);
    await writeStackedOn(third, THREE_ORDERS.folder, [TWO_ORDERS.folder]);
    const second = await approveAndArchive(project, TWO_BILLING);
    await writeStackedOn(second, TWO_BILLING.folder, [ONE_ORDERS.folder]);
    await approveAndArchive(project, ONE_ORDERS);

    const capture = await captureLand(project.repo, project.config, '001');

    assert.equal(capture.exitCode, 0);
    assert.equal(capture.stderr, '');
    assert.ok(capture.stdout.startsWith('Landed 001-order-flow as '));
  });
});
