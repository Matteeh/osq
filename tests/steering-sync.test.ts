import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { DEFAULT_CONFIG, type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { mergeDelta, parseDelta } from '../src/core/spec/delta.js';
import { type SpecData, parseSpecMd } from '../src/core/spec/parser.js';
import { type LocatedChange, listChanges } from '../src/core/status/change-locations.js';
import {
  type ChangeFolderSnapshot,
  deriveSpecState,
  readChangeFolder,
} from '../src/core/status/state.js';
import { deriveSteering, isDefaultBranchTrigger } from '../src/core/status/steering.js';
import { syncWithDefaultBranch } from '../src/core/vcs/sync-main.js';
import { SyncStop } from '../src/core/vcs/sync-stop.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const GIT_AUTHOR = 'Osq Author <author@example.invalid>';
const FOLDER = '002-two-words';
const BRANCH = `osq/${FOLDER}`;
const ORDERS = 'openspec/specs/orders/spec.md';
const ARCHIVE = `openspec/changes/archive/${FOLDER}`;
const ACTIVE = `openspec/changes/${FOLDER}`;

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

async function write(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function exists(target: string): Promise<boolean> {
  return fs.access(target).then(
    () => true,
    () => false,
  );
}

async function headOf(dir: string): Promise<string> {
  return git(['rev-parse', 'HEAD'], dir);
}

async function statusOf(dir: string): Promise<string[]> {
  const output = await git(['status', '--porcelain=v1', '--untracked-files=all'], dir);
  return output.split('\n').filter((line) => line.length > 0);
}

/** Commit one file on the checkout's current (default) branch. */
async function landOnMain(root: string, file: string, content: string): Promise<string> {
  await write(root, file, content);
  await git(['add', '--', file], root);
  await git(['commit', '-qm', `land ${file}`], root);
  return git(['rev-parse', 'HEAD'], root);
}

// ---------------------------------------------------------------------------
// Snapshot scenarios
// ---------------------------------------------------------------------------

const SPEC: SpecData = parseSpecMd(
  ['---', 'title: Snapshot Spec', 'depends_on: []', '---', '## Goal', 'prove steering', ''].join(
    '\n',
  ),
);

function taskFile(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'verify: node verify.cjs',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] passes',
    '',
  ].join('\n');
}

function baseSnapshot(overrides: Partial<ChangeFolderSnapshot> = {}): ChangeFolderSnapshot {
  return {
    folderName: FOLDER,
    folderPath: `/does/not/exist/${FOLDER}`,
    spec: SPEC,
    approvedHash: 'sha256:abc123',
    taskFiles: new Map([['1.md', taskFile('Task one')]]),
    doneMarkers: new Set<string>(),
    deadMarkers: new Map<string, string>(),
    regressedMarkers: new Map<string, string>(),
    runningPids: new Map<string, string>(),
    resultFiles: new Set<string>(),
    unmetDependencies: new Set<string>(),
    ...overrides,
  };
}

function changeMarker(reason: string): string {
  return `---\nreason: ${reason}\n---\n${reason}\n`;
}

describe('Default-branch triggers', () => {
  it('derives a conflict, a requirement_changed, and a sync_verify_red regression', () => {
    const cases = [
      { reason: 'sync_conflict', trigger: 'conflict' },
      { reason: 'requirement_changed', trigger: 'requirement_changed' },
      { reason: 'sync_verify_red', trigger: 'regression' },
    ] as const;
    for (const { reason, trigger } of cases) {
      const snapshot = baseSnapshot({
        regressedMarkers: new Map([['change', changeMarker(reason)]]),
      });
      const triggers = deriveSteering(snapshot);
      assert.deepEqual(triggers, [{ target: 'change', trigger, reason }]);
      assert.equal(isDefaultBranchTrigger(triggers[0] as never), true);
    }
  });
});

describe('Run trigger is not a default-branch trigger', () => {
  it('leaves a verify_red regression off the default-branch list', () => {
    const snapshot = baseSnapshot({
      regressedMarkers: new Map([['change', changeMarker('verify_red')]]),
    });

    const triggers = deriveSteering(snapshot);

    assert.deepEqual(triggers, [{ target: 'change', trigger: 'regression', reason: 'verify_red' }]);
    assert.equal(isDefaultBranchTrigger(triggers[0] as never), false);
  });
});

describe('Archived change', () => {
  it('carries a conflict trigger on its derived state', () => {
    const snapshot = baseSnapshot({
      approvedHash: 'sha256:archived',
      regressedMarkers: new Map([['change', changeMarker('sync_conflict')]]),
    });

    const state = deriveSpecState(snapshot);

    assert.deepEqual(state.steering, [
      { target: 'change', trigger: 'conflict', reason: 'sync_conflict' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Sync scenarios in temporary git repositories
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

const ADD_002 = `# Spec Delta: orders

## Purpose

Adds order 002.

## ADDED Requirements

### Requirement: Order 002
The system SHALL add order 002.

#### Scenario: 002 runs
- **WHEN** 002 runs
- **THEN** order 002 is added
`;

const MODIFY_002 = `# Spec Delta: orders

## Purpose

Changes totals for 002.

## MODIFIED Requirements

### Requirement: Order totals
The system SHALL total orders with 002.

#### Scenario: Totals
- **WHEN** an order arrives
- **THEN** it is totalled with 002
`;

const LANDED_TOTALS = `# Spec Delta: orders

## Purpose

A landed change changes totals.

## MODIFIED Requirements

### Requirement: Order totals
The system SHALL total orders with the landed change.

#### Scenario: Totals
- **WHEN** an order arrives
- **THEN** it is totalled with the landed change
`;

const PROPOSAL = `---
title: Two words
verify: node verify.cjs
---

## Goal

Do two words.
`;

const VERIFY_CJS = `const fs = require('node:fs');
const path = require('node:path');
const marker = path.join(__dirname, 'openspec/changes/archive/${FOLDER}/.run/verify-fail');
if (fs.existsSync(marker)) {
  process.stdout.write(fs.readFileSync(marker, 'utf8'));
  process.exit(1);
}
process.exit(0);
`;

interface ArchiveSetup {
  readonly delta: string;
  readonly verifyFail?: boolean;
  /** Lands commits on the default branch before the change branch is cut. */
  readonly preBranch?: (root: string) => Promise<string | null>;
}

interface ArchiveScenario {
  readonly root: string;
  readonly worktree: string;
  readonly config: OsqConfig;
  readonly change: LocatedChange;
}

/**
 * A repository whose default branch holds `orders`, with a branch
 * `osq/002-two-words` cut from the initial commit in a linked worktree. The
 * branch commit holds the archived change folder, its `.run/base`, and the
 * living spec with the delta applied. `preBranch` can land commits on the
 * default branch first and return the commit approval records as
 * `.run/requirements-base`.
 */
async function setupArchived(options: ArchiveSetup): Promise<ArchiveScenario> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-steering-sync-'));
  tmpDirs.push(parent);
  const root = path.join(parent, 'repo');
  await fs.mkdir(root);
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await write(root, ORDERS, ORDERS_SPEC);
  await write(root, 'src/app.txt', 'base\n');
  await write(root, 'verify.cjs', VERIFY_CJS);
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'init'], root);
  const base = await git(['rev-parse', 'HEAD'], root);

  const requirementsBase = options.preBranch ? await options.preBranch(root) : null;

  await git(['branch', BRANCH, base], root);
  const worktree = path.join(parent, 'worktree');
  await git(['worktree', 'add', worktree, BRANCH], root);
  await write(worktree, `${ARCHIVE}/proposal.md`, PROPOSAL);
  await write(worktree, `${ARCHIVE}/.run/base`, `${base}\n`);
  if (requirementsBase !== null) {
    await write(worktree, `${ARCHIVE}/.run/requirements-base`, `${requirementsBase}\n`);
  }
  await write(worktree, `${ARCHIVE}/specs/orders/spec.md`, options.delta);
  await write(worktree, ORDERS, mergeDelta(ORDERS_SPEC, 'orders', parseDelta(options.delta)));
  if (options.verifyFail) {
    await write(worktree, `${ARCHIVE}/.run/verify-fail`, 'broken\n');
  }
  await git(['add', '-A'], worktree);
  await git(['commit', '-qm', 'osq: 002 archived'], worktree);

  const config: OsqConfig = {
    ...DEFAULT_CONFIG,
    vcs: {
      enabled: true,
      author: GIT_AUTHOR,
      worktreeRoot: path.join(parent, 'worktrees'),
    },
  };
  const located = (await listChanges(root, config, ['archived'])).find(
    (entry) => entry.folderName === FOLDER,
  );
  assert.ok(located, 'setup should locate the archived change in its worktree');
  return { root, worktree, config, change: located };
}

interface ActiveTask {
  readonly n: string;
  readonly done?: boolean;
}

interface ActiveScenario {
  readonly root: string;
  readonly worktree: string;
  readonly config: OsqConfig;
  readonly change: LocatedChange;
}

function taskMd(n: string): string {
  return `---\ntitle: Task ${n}\nverify: node verify.cjs\n---\n\n## Acceptance\n\n- [ ] Task ${n} works\n`;
}

/** A repository with an active `002` on `osq/002-two-words` cut from `base`. */
async function setupActive(options: {
  readonly tasks: readonly ActiveTask[];
  readonly verifyFail?: boolean;
}): Promise<ActiveScenario> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-steering-sync-active-'));
  tmpDirs.push(parent);
  const root = path.join(parent, 'repo');
  await fs.mkdir(root);
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await write(root, ORDERS, ORDERS_SPEC);
  await write(root, 'src/app.txt', 'base\n');
  await write(root, 'verify.cjs', VERIFY_CJS);
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'init'], root);
  const base = await git(['rev-parse', 'HEAD'], root);

  await git(['branch', BRANCH], root);
  const worktree = path.join(parent, 'worktree');
  await git(['worktree', 'add', worktree, BRANCH], root);
  await write(worktree, `${ACTIVE}/proposal.md`, PROPOSAL);
  await write(worktree, `${ACTIVE}/.run/approved`, 'approved\n');
  await write(worktree, `${ACTIVE}/.run/base`, `${base}\n`);
  await write(worktree, `${ACTIVE}/specs/orders/spec.md`, ADD_002);
  for (const task of options.tasks) {
    await write(worktree, `${ACTIVE}/tasks/${task.n}.md`, taskMd(task.n));
    if (task.done) await write(worktree, `${ACTIVE}/.run/done/${task.n}`, 'done\n');
  }
  if (options.verifyFail) await write(worktree, `${ACTIVE}/.run/verify-fail`, 'broken\n');
  await git(['add', '-A'], worktree);
  await git(['commit', '-qm', 'active 002'], worktree);

  const config: OsqConfig = {
    ...DEFAULT_CONFIG,
    vcs: {
      enabled: true,
      author: GIT_AUTHOR,
      worktreeRoot: path.join(parent, 'worktrees'),
    },
  };
  const located = (await listChanges(root, config, ['active'])).find(
    (entry) => entry.folderName === FOLDER,
  );
  assert.ok(located, 'setup should locate the active change in its worktree');
  return { root, worktree, config, change: located };
}

function parseEvents(raw: string): Array<{ type: string; data: Record<string, unknown> }> {
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as { type: string; data: Record<string, unknown> });
}

describe('Requirement changed on the default branch', () => {
  it('stops with requirement_changed and points at osq plan', async () => {
    const { root, config, change, worktree } = await setupArchived({ delta: MODIFY_002 });
    const before = await headOf(worktree);
    const landed = mergeDelta(ORDERS_SPEC, 'orders', parseDelta(LANDED_TOTALS));
    await landOnMain(root, ORDERS, landed);

    await assert.rejects(
      () => syncWithDefaultBranch(root, config, change),
      (error: unknown) => {
        assert.ok(error instanceof SyncStop, 'the stop should be a SyncStop');
        assert.equal(error.reason, 'requirement_changed');
        assert.match(
          error.message,
          /^002-two-words: main changed requirements this change rewrites since it was approved: orders: Order totals; run osq plan 002 to revise the plan against main$/,
        );
        return true;
      },
    );
    assert.equal(await headOf(worktree), before);
    assert.deepEqual(await statusOf(worktree), []);
  });
});

describe('Requirements base after a revised approval', () => {
  it('compares from requirements-base and merges without stopping', async () => {
    const landed = mergeDelta(ORDERS_SPEC, 'orders', parseDelta(LANDED_TOTALS));
    const { root, config, change, worktree } = await setupArchived({
      delta: MODIFY_002,
      preBranch: (repo) => landOnMain(repo, ORDERS, landed),
    });
    await landOnMain(root, 'other.txt', 'moved\n');

    const result = await syncWithDefaultBranch(root, config, change);

    assert.deepEqual(result, { merged: true });
    assert.equal(await git(['log', '-1', '--format=%s'], worktree), 'osq: 002 sync main');
    assert.deepEqual(await statusOf(worktree), []);
  });
});

describe('Red verify after the merge', () => {
  it('stops with a sync_verify_red SyncStop and keeps the worktree', async () => {
    const { root, config, change, worktree } = await setupArchived({
      delta: ADD_002,
      verifyFail: true,
    });
    const before = await headOf(worktree);
    await landOnMain(root, 'other.txt', 'moved\n');

    await assert.rejects(
      () => syncWithDefaultBranch(root, config, change),
      (error: unknown) => {
        assert.ok(error instanceof SyncStop, 'the stop should be a SyncStop');
        assert.equal(error.reason, 'sync_verify_red');
        assert.match(
          error.message,
          /^002-two-words: verify failed on osq\/002-two-words merged with main:\nbroken/,
        );
        return true;
      },
    );
    assert.equal(await headOf(worktree), before);
    assert.deepEqual(await statusOf(worktree), []);
  });
});

describe('Verify skipped on request', () => {
  it('merges without a verify suffix or a verify_ran event', async () => {
    const { root, config, change, worktree } = await setupActive({
      tasks: [{ n: '1', done: true }],
      verifyFail: true,
    });
    await landOnMain(root, 'other.txt', 'moved\n');
    const eventsPath = path.join(worktree, ACTIVE, '.run', 'events', 'change.jsonl');

    const lines: string[] = [];
    const result = await syncWithDefaultBranch(root, config, change, (line) => lines.push(line), {
      skipVerify: true,
    });

    assert.deepEqual(result, { merged: true });
    assert.equal(lines.length, 1);
    assert.match(lines[0] as string, /^main has 1 new commit; merging into osq\/002-two-words$/);
    assert.equal(await git(['log', '-1', '--format=%s'], worktree), 'osq: 002 sync main');
    const events = parseEvents(await fs.readFile(eventsPath, 'utf8'));
    assert.equal(events.at(-1)?.type, 'synced');
    assert.ok(!events.some((event) => event.type === 'verify_ran'));
    assert.deepEqual(await statusOf(worktree), []);
  });
});

// ---------------------------------------------------------------------------
// Watcher scenario in a temporary git repository
// ---------------------------------------------------------------------------

const CHANGE_REL = path.posix.join('openspec', 'changes', '001-order-flow');
const IN_SCOPE = 'src/one.txt';
const SECOND_SCOPE = 'src/two.txt';
const OTHER = 'src/other.txt';

interface TaskSpec {
  readonly title: string;
  readonly scope: string[];
}

const FIRST: TaskSpec = { title: 'First task', scope: [IN_SCOPE] };

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
  const tasks = ['# Tasks', ''];
  specs.forEach((spec, index) => tasks.push(`- [ ] ${index + 1}. ${spec.title}`));
  tasks.push('');
  await fs.writeFile(path.join(folderPath, 'tasks.md'), tasks.join('\n'), 'utf8');
  for (let index = 0; index < specs.length; index += 1) {
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${index + 1}.md`),
      taskMarkdown(specs[index] as TaskSpec),
      'utf8',
    );
  }
}

/** The verify fails once the default branch's `src/other.txt` is in the tree. */
const VERIFY_AFTER_MERGE = [
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  "if (fs.existsSync(path.join(process.cwd(), 'src/other.txt'))) {",
  "  process.stdout.write('verify red\\n');",
  '  process.exit(1);',
  '}',
  'process.exit(0);',
  '',
].join('\n');

interface Project {
  readonly repo: string;
  readonly worktree: string;
  readonly worktreeFolder: string;
  readonly config: OsqConfig;
}

/** A committed temp repository with one change approved into a linked worktree. */
async function setupProject(specs: readonly TaskSpec[]): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-steering-sync-watch-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), VERIFY_AFTER_MERGE, 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, IN_SCOPE), 'seed one\n', 'utf8');
  await fs.writeFile(path.join(repo, SECOND_SCOPE), 'seed two\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  await writeChange(path.join(repo, CHANGE_REL), 'Order Flow', specs);

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
  return { repo, worktree, worktreeFolder: path.join(worktree, CHANGE_REL), config };
}

/** Fake adapter whose spawn writes the task's scoped file, then acts. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';
  readonly calls: SpawnTaskOptions[] = [];

  constructor(private readonly act: () => Promise<void> = async () => {}) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.calls.push({ ...options });
    const target = options.taskNumber === '1' ? IN_SCOPE : SECOND_SCOPE;
    await fs.writeFile(path.join(options.projectRoot, target), `task ${options.taskNumber}\n`);
    await this.act();
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(path.join(resultsDir, `${options.taskNumber}.md`), '# Agent result\n');
    return { exitCode: 0 };
  }
}

async function moveMain(project: Project): Promise<void> {
  await write(project.repo, OTHER, 'moved\n');
  await git(['add', '--', OTHER], project.repo);
  await git(['commit', '-qm', 'main moves'], project.repo);
}

describe('Red verify before archive needs steering', () => {
  it('halts with sync_verify_red and later cycles leave the change alone', async () => {
    const project = await setupProject([FIRST]);
    const adapter = new ActingAdapter(() => moveMain(project));

    await runWatcherCycle(project.repo, project.config, adapter);

    const marker = await fs.readFile(
      path.join(project.worktreeFolder, '.run', 'regressed', 'change.md'),
      'utf8',
    );
    assert.match(marker, /reason: sync_verify_red/);
    assert.match(marker, /verify red/);
    assert.equal(
      await exists(path.join(project.worktree, 'openspec', 'changes', 'archive')),
      false,
    );
    const headAfterHalt = await headOf(project.worktree);
    assert.equal(
      await git(['log', '-1', '--format=%s'], project.worktree),
      'osq: 001 task 1 verified',
    );

    await runWatcherCycle(project.repo, project.config, adapter);
    assert.equal(adapter.calls.length, 1);
    assert.equal(await headOf(project.worktree), headAfterHalt);

    const state = deriveSpecState(await readChangeFolder(project.worktree, project.worktreeFolder));
    assert.deepEqual(state.steering, [
      { target: 'change', trigger: 'regression', reason: 'sync_verify_red' },
    ]);
  });
});
