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
import { readDispatchCard } from '../src/core/status/dispatch-cards.js';
import { readDispatchItems } from '../src/core/status/dispatch-items.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGES = path.posix.join('openspec', 'changes');
const ONE = '001-order-flow';
const OUT_SCOPE = 'src/out.txt';
const ADDED_DELTA = `# Spec Delta: Fixture

## ADDED Requirements

### Requirement: Fixture requirement
The system SHALL do a thing.

#### Scenario: A scenario
- **WHEN** x happens
- **THEN** y holds
`;

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

function proposalMd(
  title: string,
  options: { goal?: string; check?: string; humanSteps?: string } = {},
): string {
  const lines = ['---', `title: ${title}`, 'depends_on: []', 'verify: node verify.cjs'];
  if (options.check !== undefined) lines.push(`check: ${options.check}`);
  lines.push('---', '## Goal', options.goal ?? `${title} goal.`, '');
  if (options.humanSteps !== undefined) {
    lines.push('## Human steps', '', '### After landing', options.humanSteps, '');
  }
  return lines.join('\n');
}

function taskMd(title: string, scope: readonly string[] = []): string {
  return [
    '---',
    `title: ${title}`,
    'verify: node verify.cjs',
    `scope: ${JSON.stringify(scope)}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    `- [ ] ${title} criterion`,
    '',
  ].join('\n');
}

async function writeAt(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function createChange(
  root: string,
  folderName: string,
  title: string,
  goal = `${title} goal.`,
): Promise<string> {
  const dir = path.join(root, CHANGES, folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(title, { goal }), 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), taskMd('Task one'), 'utf8');
  await fs.writeFile(path.join(dir, 'tasks.md'), '# Tasks\n\n- [ ] 1. Task one\n', 'utf8');
  return dir;
}

async function approve(folderPath: string): Promise<void> {
  await fs.mkdir(path.join(folderPath, '.run'), { recursive: true });
  await fs.writeFile(path.join(folderPath, '.run', 'approved'), 'sha256:fixture\n', 'utf8');
}

async function writeEvents(folderPath: string, task: string, started: number): Promise<void> {
  const lines = Array.from({ length: started }, (_, index) =>
    JSON.stringify({
      type: 'started',
      timestamp: `2026-01-0${index + 1}T00:00:00.000Z`,
      data: { harness: 'mock', model: 'm', osqVersion: '1.0.0' },
    }),
  );
  await writeAt(
    folderPath,
    path.posix.join('.run', 'events', `${task}.jsonl`),
    `${lines.join('\n')}\n`,
  );
}

interface ArchivedOptions {
  readonly verification?: { readonly afterLanding: boolean; readonly check: string | null };
  readonly goal?: string;
  readonly humanSteps?: string;
  readonly check?: string;
  readonly outcome?: 'passed' | 'failed';
}

async function createArchived(
  root: string,
  folderName: string,
  options: ArchivedOptions = {},
): Promise<string> {
  const dir = path.join(root, CHANGES, 'archive', folderName);
  await fs.mkdir(path.join(dir, '.run', 'events'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'proposal.md'),
    proposalMd(folderName, {
      goal: options.goal,
      check: options.check,
      humanSteps: options.humanSteps,
    }),
    'utf8',
  );
  await fs.writeFile(path.join(dir, 'tasks.md'), '# Tasks\n\n- [ ] 1. Task one\n', 'utf8');
  const data = options.verification
    ? { archivePath: dir, verification: options.verification }
    : { archivePath: dir };
  const lines = [JSON.stringify({ type: 'archived', timestamp: '2026-01-01T00:00:00.000Z', data })];
  if (options.outcome !== undefined) {
    lines.push(
      JSON.stringify({
        type: 'verification_recorded',
        timestamp: '2026-01-02T00:00:00.000Z',
        data: { outcome: options.outcome },
      }),
    );
  }
  await writeAt(dir, path.posix.join('.run', 'events', 'change.jsonl'), `${lines.join('\n')}\n`);
  return dir;
}

describe('dispatch cards', () => {
  it('approval card holds the digest goal, capabilities, decisions, and tasks', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-card-approval-'));
    tmpDirs.push(root);
    const folder = await createChange(
      root,
      '001-approval',
      'Approval change',
      'Approve me first. Then the rest.',
    );
    await writeAt(folder, path.posix.join('specs', 'cli-foundation', 'spec.md'), ADDED_DELTA);
    const config = defineConfig({});

    const dispatch = await readDispatchItems(root, config);
    const item = dispatch.items.find((candidate) => candidate.kind === 'approval');
    assert.ok(item, 'an approval item exists');
    const card = await readDispatchCard(root, config, item);
    assert.equal(card.kind, 'approval');
    if (card.kind !== 'approval') return;

    assert.equal(card.digest.change, '001-approval');
    assert.match(card.digest.goal, /Approve me first\. Then the rest\./);
    assert.equal(card.digest.capabilities[0]?.name, 'cli-foundation');
    assert.ok(Array.isArray(card.digest.decisions));
    assert.deepEqual(
      card.digest.tasks.map((task) => [task.number, task.title]),
      [['1', 'Task one']],
    );
  });

  it('halt card holds the reason, attempt count, trailing output, and no absolute path', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-card-halt-'));
    tmpDirs.push(root);
    const folder = await createChange(root, '002-dead', 'Dead change');
    await approve(folder);
    const body = Array.from({ length: 25 }, (_, index) => `line ${index + 1}`).join('\n');
    await writeAt(
      folder,
      path.posix.join('.run', 'dead', '1.md'),
      `---\nreason: verify_red\n---\n${body}\n`,
    );
    await writeEvents(folder, '1', 2);
    const config = defineConfig({});

    const dispatch = await readDispatchItems(root, config);
    const item = dispatch.items.find((candidate) => candidate.kind === 'halt');
    assert.ok(item, 'a halt item exists');
    const card = await readDispatchCard(root, config, item);
    assert.equal(card.kind, 'halt');
    if (card.kind !== 'halt' || card.target !== 'task') return;

    assert.equal(card.taskNumber, '1');
    assert.equal(card.title, 'Task one');
    assert.equal(card.reason, 'verify_red');
    assert.equal(card.attempts, 2);
    assert.equal(card.output.length, 20);
    assert.equal(card.output.at(-1), 'line 25');
    assert.equal(card.patch, null);
    assert.ok(!JSON.stringify(card).includes(root), 'card adds no absolute path');
  });

  it('halt card with a patch names it by its project-relative path', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-card-patch-'));
    tmpDirs.push(root);
    const folder = await createChange(root, '002-dead', 'Dead change');
    await approve(folder);
    await writeAt(
      folder,
      path.posix.join('.run', 'dead', '1.md'),
      '---\nreason: verify_red\n---\nboom\n',
    );
    await writeAt(folder, path.posix.join('.run', 'dead', '1.patch'), 'diff --git a b\n');
    const config = defineConfig({});

    const dispatch = await readDispatchItems(root, config);
    const item = dispatch.items.find((candidate) => candidate.kind === 'halt');
    assert.ok(item);
    const card = await readDispatchCard(root, config, item);
    assert.equal(card.kind, 'halt');
    if (card.kind !== 'halt' || card.target !== 'task') return;

    assert.equal(
      card.patch,
      path.posix.join('openspec', 'changes', '002-dead', '.run', 'dead', '1.patch'),
    );
  });

  it('halt card for a change-level regression holds the reason and trailing output', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-card-regressed-'));
    tmpDirs.push(root);
    const folder = await createChange(root, '003-change', 'Change regression');
    await approve(folder);
    await writeAt(
      folder,
      path.posix.join('.run', 'regressed', 'change.md'),
      '---\nreason: scope_drift\n---\nfirst\nsecond\n',
    );
    const config = defineConfig({});

    const dispatch = await readDispatchItems(root, config);
    const item = dispatch.items.find((candidate) => candidate.kind === 'halt');
    assert.ok(item);
    const card = await readDispatchCard(root, config, item);
    assert.equal(card.kind, 'halt');
    if (card.kind !== 'halt' || card.target !== 'change') return;

    assert.equal(card.reason, 'scope_drift');
    assert.deepEqual(card.output, ['first', 'second']);
  });

  it('land card holds the check command and after-landing steps', async () => {
    const root = await makeRepo();
    await createArchived(root, '004-checks', {
      check: 'node check.cjs',
      humanSteps: 'Run the manual step.',
      goal: 'Land the checked change.',
    });
    const config = defineConfig({});

    const dispatch = await readDispatchItems(root, config);
    const item = dispatch.items.find((candidate) => candidate.kind === 'land');
    assert.ok(item, 'a land item exists');
    const card = await readDispatchCard(root, config, item);
    assert.equal(card.kind, 'land');
    if (card.kind !== 'land') return;

    assert.equal(card.goal, 'Land the checked change.');
    assert.equal(card.check, 'node check.cjs');
    assert.match(card.afterLanding, /Run the manual step\./);
    assert.equal(card.squash, null);
  });

  it('land card without vcs holds the goal and outcomes and no squash message', async () => {
    const root = await makeRepo();
    await createArchived(root, '001-uncommitted', { goal: 'Land the change.' });
    const config = defineConfig({});

    const dispatch = await readDispatchItems(root, config);
    const item = dispatch.items.find((candidate) => candidate.kind === 'land');
    assert.ok(item, 'a land item exists');
    const card = await readDispatchCard(root, config, item);
    assert.equal(card.kind, 'land');
    if (card.kind !== 'land') return;

    assert.equal(card.goal, 'Land the change.');
    assert.deepEqual(card.outcomes, ['[verified] task 1: Task one']);
    assert.equal(card.check, null);
    assert.equal(card.afterLanding, '');
    assert.equal(card.squash, null);
  });
});

describe('worktree land card', () => {
  it('holds the goal, each outcome line, and the squash message', async () => {
    const project = await setupWorktreeProject();
    const adapter = new ActingAdapter();
    await runWatcherCycle(project.repo, project.config, adapter);
    await runWatcherCycle(project.repo, project.config, adapter);

    const dispatch = await readDispatchItems(project.repo, project.config);
    const item = dispatch.items.find((candidate) => candidate.kind === 'land');
    assert.ok(item, 'a land item exists');
    const card = await readDispatchCard(project.repo, project.config, item);
    assert.equal(card.kind, 'land');
    if (card.kind !== 'land') return;

    assert.equal(card.goal, 'Run the tasks.');
    assert.deepEqual(card.outcomes, [
      '[verified] task 1: First task',
      '[verified] task 2: Second task',
    ]);
    assert.match(card.squash ?? '', /Osq-Change: 001-order-flow/);
  });
});

/** The git helpers copy `tests/squash-message.test.ts` so the worktree case is real. */
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

async function makeRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-card-git-'));
  tmpDirs.push(root);
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await fs.writeFile(path.join(root, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'seed'], root);
  return root;
}

interface WorktreeProject {
  readonly repo: string;
  readonly config: OsqConfig;
}

interface ChangeDef {
  readonly folder: string;
  readonly title: string;
  readonly goal: string;
  readonly tasks: ReadonlyArray<{ readonly title: string; readonly scope: string }>;
}

const ORDER_FLOW: ChangeDef = {
  folder: ONE,
  title: 'Order Flow',
  goal: 'Run the tasks.',
  tasks: [
    { title: 'First task', scope: 'src/one.txt' },
    { title: 'Second task', scope: 'src/two.txt' },
  ],
};

async function writeChange(folderPath: string, change: ChangeDef): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  const proposal = [
    '---',
    `title: ${change.title}`,
    'depends_on: []',
    'verify: node verify.cjs',
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
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposal, 'utf8');
  const lines = ['# Tasks', ''];
  change.tasks.forEach((task, index) => lines.push(`- [ ] ${index + 1}. ${task.title}`));
  lines.push('');
  await fs.writeFile(path.join(folderPath, 'tasks.md'), lines.join('\n'), 'utf8');
  for (const [index, task] of change.tasks.entries()) {
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${index + 1}.md`),
      taskMd(task.title, [task.scope]),
      'utf8',
    );
  }
}

/** A committed repo with one change approved into a linked worktree. */
async function setupWorktreeProject(): Promise<WorktreeProject> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-card-worktree-'));
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

  await writeChange(path.join(repo, CHANGES, ORDER_FLOW.folder), ORDER_FLOW);

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
  assert.ok(result.worktreePath, 'approval created a worktree');
  return { repo, config };
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
