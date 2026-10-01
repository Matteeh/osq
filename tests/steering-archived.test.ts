import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { landCommand } from '../src/cli/land.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { readDispatchItems } from '../src/core/status/dispatch-items.js';
import { readInbox } from '../src/core/status/inbox-projection.js';
import { formatInboxText } from '../src/core/status/inbox.js';
import { formatNextStep, readNextStep } from '../src/core/status/next-step.js';
import { findSteeringChange, listArchivedSteering } from '../src/core/status/steering-change.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGES = path.posix.join('openspec', 'changes');
const TWO_SCOPE = 'src/two.txt';
const THREE_SCOPE = 'src/three.txt';

const tmpDirs: string[] = [];

after(async () => {
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

interface Capture {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

async function captureLand(cwd: string, config: OsqConfig, id: string): Promise<Capture> {
  let stdout = '';
  let stderr = '';
  let exitCode: number | null = null;
  await landCommand(id, {
    cwd,
    config,
    stdout: (msg) => {
      stdout += msg;
    },
    stderr: (msg) => {
      stderr += msg;
    },
    exit: (code) => {
      exitCode = code;
    },
  });
  return { stdout, stderr, exitCode };
}

interface TaskSpec {
  readonly title: string;
  readonly scope: string;
}

interface ChangeDef {
  readonly folder: string;
  readonly title: string;
  readonly capability: string;
  readonly tasks: readonly TaskSpec[];
  readonly delta: string;
}

const ORDERS: ChangeDef = {
  folder: '002-orders',
  title: 'Orders',
  capability: 'orders',
  tasks: [{ title: 'Orders task', scope: TWO_SCOPE }],
  delta: `# Spec Delta: orders

## ADDED Requirements

### Requirement: Order totals
The system SHALL total orders.

#### Scenario: Totals
- **WHEN** an order arrives
- **THEN** it is totalled
`,
};

const BILLING: ChangeDef = {
  folder: '003-billing',
  title: 'Billing',
  capability: 'billing',
  tasks: [{ title: 'Billing task', scope: THREE_SCOPE }],
  delta: `# Spec Delta: billing

## ADDED Requirements

### Requirement: Bill totals
The system SHALL total bills.

#### Scenario: Totals
- **WHEN** a bill arrives
- **THEN** it is totalled
`,
};

const ORDERS_SPEC = `# orders Specification

## Purpose

Orders are totalled.

## Requirements

### Requirement: Existing orders
The system SHALL keep orders.
`;

const BILLING_SPEC = `# billing Specification

## Purpose

Bills are totalled.

## Requirements

### Requirement: Existing bills
The system SHALL keep bills.
`;

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
  await writeAt(folderPath, path.posix.join('specs', change.capability, 'spec.md'), change.delta);
}

/** Fake adapter whose spawn edits the task's scoped file under its project root. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    const target = options.scope[0] ?? TWO_SCOPE;
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
  readonly worktrees: Readonly<Record<string, string>>;
  readonly config: OsqConfig;
}

/** A committed temp repository with each change approved into its own worktree. */
async function setupProject(changes: readonly ChangeDef[]): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-steering-archived-'));
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
  await writeAt(repo, path.posix.join('openspec', 'specs', 'orders', 'spec.md'), ORDERS_SPEC);
  await writeAt(repo, path.posix.join('openspec', 'specs', 'billing', 'spec.md'), BILLING_SPEC);
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  for (const change of changes) {
    await writeChange(path.join(repo, CHANGES, change.folder), change);
  }

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot,
  };
  const config = defineConfig({
    vcs,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
  });

  const worktrees: Record<string, string> = {};
  for (const change of changes) {
    const id = change.folder.split('-')[0] as string;
    const result = await approveSpec(repo, id, config);
    assert.ok(result.worktreePath, `approval created a worktree for ${id}`);
    worktrees[change.folder] = result.worktreePath;
  }
  return { repo, worktrees, config };
}

function archivedFolder(worktree: string, folder: string): string {
  return path.join(worktree, 'openspec', 'changes', 'archive', folder);
}

let project: Project;
let home: string;
let ordersFolder: string;

before(async () => {
  project = await setupProject([ORDERS, BILLING]);
  await runWatcherOnce(project.repo, project.config, new ActingAdapter());

  // Main rewrites the file change 002 wrote, so the next land conflicts.
  await writeAt(project.repo, TWO_SCOPE, 'main\n');
  await git(['add', '--', TWO_SCOPE], project.repo);
  await git(['commit', '-qm', 'main moves'], project.repo);

  const ordersWorktree = project.worktrees[ORDERS.folder] as string;
  ordersFolder = archivedFolder(ordersWorktree, ORDERS.folder);
  const capture = await captureLand(project.repo, project.config, '002');
  assert.equal(capture.exitCode, 1, capture.stderr);

  home = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-steering-archived-home-'));
  tmpDirs.push(home);
});

describe('Archived change found for steering', () => {
  it('finds the steered archived change and not the plain one', async () => {
    const steered = await findSteeringChange(project.repo, project.config, '002');
    const plain = await findSteeringChange(project.repo, project.config, '003');

    assert.equal(steered?.change.folderName, ORDERS.folder);
    assert.equal(steered?.change.folderPath, ordersFolder);
    assert.equal(steered?.state.steering?.[0]?.trigger, 'conflict');
    assert.equal(steered?.state.steering?.[0]?.reason, 'sync_conflict');
    assert.equal(plain, null);

    const listed = await listArchivedSteering(project.repo, project.config);
    assert.deepEqual(
      listed.map((entry) => entry.change.folderName),
      [ORDERS.folder],
    );
  });
});

describe('Inbox row for an archived change', () => {
  it('shows one change-regressed item with the steering trigger', async () => {
    const inbox = await readInbox(project.repo, { config: project.config, home });
    const items = inbox.needsYou.filter((item) => item.change.id === '002');

    assert.equal(items.length, 1);
    assert.equal(items[0]?.kind, 'change-regressed');
    assert.equal(items[0]?.task, null);
    assert.equal(items[0]?.command, 'osq plan 002');
    assert.deepEqual(items[0]?.steering, { trigger: 'conflict', reason: 'sync_conflict' });
    assert.ok(
      formatInboxText(inbox).includes(
        '  002: Orders — needs steering: conflict (sync_conflict) — osq plan 002',
      ),
      formatInboxText(inbox),
    );
  });
});

describe('Change next step for an archived change', () => {
  it('points a steered archived change at plan', async () => {
    const step = await readNextStep(project.repo, ordersFolder, project.config);

    assert.deepEqual(step, { state: 'dead', command: 'osq plan 002', detail: 'needs steering' });
    assert.equal(formatNextStep(step), 'dead (needs steering) — osq plan 002');
  });
});

describe('Dispatch items for an archived change', () => {
  it('replaces the land item with one steering halt', async () => {
    const dispatch = await readDispatchItems(project.repo, project.config);
    const orders = dispatch.items.filter((item) => item.change.id === '002');

    assert.equal(orders.length, 1);
    assert.equal(orders[0]?.kind, 'halt');
    assert.equal(orders[0]?.task, null);
    assert.deepEqual(orders[0]?.steering, {
      target: 'change',
      trigger: 'conflict',
      reason: 'sync_conflict',
    });
    assert.deepEqual(orders[0]?.commands, ['osq plan 002', 'osq show 002']);
    assert.equal(
      dispatch.items.some((item) => item.kind === 'land' && item.change.id === '002'),
      false,
    );
  });
});
