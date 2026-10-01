import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { approveCommand } from '../src/cli/approve.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { findChange } from '../src/core/status/change-locations.js';
import { deriveSpecState, readChangeFolder } from '../src/core/status/state.js';
import { landChange } from '../src/core/vcs/land.js';
import { syncWithDefaultBranch } from '../src/core/vcs/sync-main.js';
import { worktreeBranch } from '../src/core/vcs/worktree.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGE_ID = '001-order-flow';
const CHANGE_REL = path.posix.join('openspec', 'changes', CHANGE_ID);
const ORDERS = path.posix.join('openspec', 'specs', 'orders', 'spec.md');
const IN_SCOPE = 'src/one.txt';
const SECOND_SCOPE = 'src/two.txt';
const THIRD_SCOPE = 'src/three.txt';

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

// ---------------------------------------------------------------------------
// Fixtures
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

const MODIFY_TOTALS_ROUNDED = `# Spec Delta: orders

## Purpose

Tightens order totals.

## MODIFIED Requirements

### Requirement: Order totals
The system SHALL total orders rounded to cents per line.

#### Scenario: Totals
- **WHEN** an order arrives
- **THEN** it is totalled
`;

/** A verify that stays red until task 3 creates `src/three.txt`. */
const RED_VERIFY = `${[
  "process.exit(require('node:fs').existsSync('src/three.txt') ? 0 : 1);",
].join('\n')}\n`;

const PASSING_VERIFY = 'process.exit(0);\n';

interface TaskSpec {
  readonly title: string;
  readonly scope: string[];
}

const FIRST: TaskSpec = { title: 'First task', scope: [IN_SCOPE] };
const SECOND: TaskSpec = { title: 'Second task', scope: [SECOND_SCOPE] };

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
  specs: readonly TaskSpec[],
  delta: string,
): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMarkdown('Order Flow'), 'utf8');
  const lines = ['# Tasks', ''];
  specs.forEach((spec, index) => lines.push(`- [ ] ${index + 1}. ${spec.title}`));
  lines.push('');
  await fs.writeFile(path.join(folderPath, 'tasks.md'), lines.join('\n'), 'utf8');
  for (const [index, spec] of specs.entries()) {
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${index + 1}.md`),
      taskMarkdown(spec),
      'utf8',
    );
  }
  await writeAt(folderPath, path.posix.join('specs', 'orders', 'spec.md'), delta);
}

interface Project {
  readonly repo: string;
  readonly worktree: string;
  readonly worktreeFolder: string;
  readonly archivedFolder: string;
  readonly config: OsqConfig;
}

interface SetupOptions {
  readonly tasks: readonly TaskSpec[];
  readonly delta: string;
  readonly verifyCjs?: string;
}

/** A committed temp repository with one change approved into a linked worktree. */
async function setupProject(options: SetupOptions): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-steering-db-approve-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), options.verifyCjs ?? PASSING_VERIFY, 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, 'src', 'seed.txt'), 'seed\n', 'utf8');
  await writeAt(repo, ORDERS, ORDERS_SPEC);
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  await writeChange(path.join(repo, CHANGE_REL), options.tasks, options.delta);

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
  return {
    repo,
    worktree,
    worktreeFolder: path.join(worktree, CHANGE_REL),
    archivedFolder: path.join(
      worktree,
      path.posix.join('openspec', 'changes', 'archive', CHANGE_ID),
    ),
    config,
  };
}

/** Fake adapter whose spawn writes the task's first scoped file. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';
  readonly calls: SpawnTaskOptions[] = [];

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.calls.push({ ...options });
    const target = options.scope[0];
    if (target !== undefined) {
      await fs.writeFile(
        path.join(options.projectRoot, target),
        `task ${options.taskNumber}\n`,
        'utf8',
      );
    }
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(path.join(resultsDir, `${options.taskNumber}.md`), '# Agent result\n');
    return { exitCode: 0 };
  }
}

/** Run cycles with the adapter until the change archives in its worktree. */
async function runUntilArchived(project: Project, adapter: HarnessAdapter): Promise<void> {
  for (let cycle = 0; cycle < 8; cycle += 1) {
    await runWatcherCycle(project.repo, project.config, adapter);
    if (await exists(project.archivedFolder)) return;
  }
  assert.fail('the change never archived');
}

/** Commit changes on the checkout's default branch. */
async function commitMain(
  project: Project,
  changes: ReadonlyArray<readonly [string, string]>,
): Promise<string> {
  for (const [relative, content] of changes) await writeAt(project.repo, relative, content);
  await git(['add', '-A'], project.repo);
  await git(['commit', '-qm', 'main moves'], project.repo);
  return git(['rev-parse', 'HEAD'], project.repo);
}

/** Append a task to a change folder's `tasks.md` and add its file. */
async function addTask(
  folderPath: string,
  number: number,
  title: string,
  scope: string[],
): Promise<void> {
  const tasksPath = path.join(folderPath, 'tasks.md');
  const content = await fs.readFile(tasksPath, 'utf8');
  await fs.writeFile(tasksPath, `${content}- [ ] ${number}. ${title}\n`, 'utf8');
  await fs.writeFile(
    path.join(folderPath, 'tasks', `${number}.md`),
    taskMarkdown({ title, scope }),
    'utf8',
  );
}

async function captureApprove(project: Project, id: string): Promise<string> {
  return captureStdout(() =>
    approveCommand([id], {
      cwd: project.repo,
      config: project.config,
      planningReaders: [],
    }),
  );
}

async function commitSubjects(cwd: string): Promise<string[]> {
  const output = await git(['log', '--format=%s'], cwd);
  return output.split('\n').filter((line) => line.trim().length > 0);
}

async function commitFiles(cwd: string, sha: string): Promise<string[]> {
  const output = await git(['show', '--pretty=format:', '--name-only', sha], cwd);
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();
}

// ---------------------------------------------------------------------------
// Conflict: restart
// ---------------------------------------------------------------------------

interface RestartScenario extends Project {
  readonly stdout: string;
}

/** Archive a one-task change, land it into a conflicting default branch, then
 * edit its plan and approve. */
async function setupRestart(): Promise<RestartScenario> {
  const project = await setupProject({ tasks: [FIRST], delta: ADD_001 });
  await runUntilArchived(project, new ActingAdapter());
  await commitMain(project, [[IN_SCOPE, 'main\n']]);
  await assert.rejects(() => landChange(project.repo, project.config, '001'), /conflict with main/);
  assert.equal(
    await git(['log', '-1', '--format=%s', worktreeBranch(CHANGE_ID)], project.repo),
    'osq: 001 land stopped',
  );
  const taskPath = path.join(project.archivedFolder, 'tasks', '1.md');
  const revised = (await fs.readFile(taskPath, 'utf8')).replace('does the thing', 'does it now');
  await fs.writeFile(taskPath, revised, 'utf8');
  const stdout = await captureApprove(project, '001');
  return { ...project, stdout };
}

describe('Approval after a default-branch trigger', () => {
  it('restarts the change from the default branch and keeps the old branch', async () => {
    const project = await setupRestart();
    const branch = worktreeBranch(CHANGE_ID);
    const kept = `${branch}-restarted-1`;
    const mainTip = await git(['rev-parse', 'main'], project.repo);

    assert.equal(await git(['log', '-1', '--format=%s', kept], project.repo), 'osq: 001 replanned');
    assert.equal(
      await git(['log', '-1', '--format=%s', branch], project.repo),
      'osq: 001 approved',
    );
    assert.equal(await git(['rev-parse', `${branch}^`], project.repo), mainTip);
    assert.ok(
      (await commitFiles(project.repo, await git(['rev-parse', branch], project.repo))).includes(
        `${CHANGE_REL}/tasks/1.md`,
      ),
    );
    assert.equal(await exists(path.join(project.worktreeFolder, '.run', 'done', '1')), false);
    assert.equal(
      (await fs.readFile(path.join(project.worktreeFolder, '.run', 'base'), 'utf8')).trim(),
      mainTip,
    );
    assert.equal(await exists(project.archivedFolder), false);
    assert.ok(
      project.stdout.includes(
        '  Restarted from main; kept the old branch as osq/001-order-flow-restarted-1',
      ),
    );
    assert.ok(project.stdout.includes('  Continues from task 1'));
  });

  it('runs every task again after a restart and lands', async () => {
    const project = await setupRestart();
    const adapter = new ActingAdapter();

    await runUntilArchived(project, adapter);

    assert.deepEqual(
      adapter.calls.map((call) => call.taskNumber),
      ['1'],
      'the restarted task runs again',
    );
    assert.ok((await commitSubjects(project.worktree)).includes('osq: 001 archived'));

    const land = await landChange(project.repo, project.config, '001');

    assert.equal(land.code, 0);
    assert.match(land.lines[0] as string, /^Landed 001-order-flow as /);
  });
});

// ---------------------------------------------------------------------------
// Red verify: merge
// ---------------------------------------------------------------------------

interface ReopenScenario extends Project {
  readonly stdout: string;
}

/** Archive a two-task change, land it into a red default branch, add a task,
 * then approve. */
async function setupReopen(): Promise<ReopenScenario> {
  const project = await setupProject({ tasks: [FIRST, SECOND], delta: ADD_001 });
  await runUntilArchived(project, new ActingAdapter());
  await commitMain(project, [['verify.cjs', RED_VERIFY]]);
  await assert.rejects(() => landChange(project.repo, project.config, '001'), /verify failed/);
  await addTask(project.archivedFolder, 3, 'Third task', [THIRD_SCOPE]);
  const stdout = await captureApprove(project, '001');
  return { ...project, stdout };
}

describe('Reopening after a red verify', () => {
  it('merges the default branch and keeps done tasks', async () => {
    const project = await setupReopen();
    const subjects = await commitSubjects(project.worktree);

    assert.equal(await exists(project.archivedFolder), false);
    assert.equal(await exists(project.worktreeFolder), true);
    assert.equal(subjects[0], 'osq: 001 sync main');
    assert.equal(subjects[1], 'osq: 001 approved');
    assert.equal(await exists(path.join(project.worktreeFolder, '.run', 'done', '1')), true);
    assert.equal(await exists(path.join(project.worktreeFolder, '.run', 'done', '2')), true);
    assert.equal(
      await exists(path.join(project.worktreeFolder, '.run', 'regressed', 'change.1.md')),
      true,
    );
    assert.equal(
      await exists(path.join(project.worktreeFolder, '.run', 'regressed', 'change.md')),
      false,
    );
    assert.ok(project.stdout.includes('  Merged main into osq/001-order-flow'));
    assert.ok(project.stdout.includes('  Continues from task 3'));
  });

  it('runs only the new task and archives', async () => {
    const project = await setupReopen();
    const adapter = new ActingAdapter();

    await runUntilArchived(project, adapter);

    assert.deepEqual(
      adapter.calls.map((call) => call.taskNumber),
      ['3'],
      'done tasks do not spawn again',
    );
    assert.ok((await commitSubjects(project.worktree)).includes('osq: 001 archived'));
  });
});

// ---------------------------------------------------------------------------
// Changed requirement
// ---------------------------------------------------------------------------

describe('A changed requirement on the default branch', () => {
  it('is judged against the default branch and later syncs do not stop', async () => {
    const project = await setupProject({ tasks: [FIRST], delta: MODIFY_TOTALS });
    const mainTip = await commitMain(project, [[ORDERS, ORDERS_SPEC_ROUNDED]]);

    await runWatcherCycle(project.repo, project.config, new ActingAdapter());
    const halted = deriveSpecState(
      await readChangeFolder(project.worktree, project.worktreeFolder),
    );
    assert.equal(halted.steering?.[0]?.trigger, 'requirement_changed');

    await writeAt(
      project.worktreeFolder,
      path.posix.join('specs', 'orders', 'spec.md'),
      MODIFY_TOTALS_ROUNDED,
    );
    const stdout = await captureApprove(project, '001');

    assert.equal(
      (
        await fs.readFile(path.join(project.worktreeFolder, '.run', 'requirements-base'), 'utf8')
      ).trim(),
      mainTip,
    );
    assert.equal(await git(['log', '-1', '--format=%s'], project.worktree), 'osq: 001 sync main');
    assert.ok(stdout.includes('  Merged main into osq/001-order-flow'));

    // A later sync compares from the requirements base and does not stop.
    await commitMain(project, [['src/other.txt', 'other\n']]);
    const change = await findChange(project.repo, project.config, '001');
    const result = await syncWithDefaultBranch(project.repo, project.config, change);
    assert.deepEqual(result, { merged: true });
  });

  it('restarts the change when the merge itself conflicts', async () => {
    const project = await setupProject({ tasks: [FIRST, SECOND], delta: MODIFY_TOTALS });

    const first = new ActingAdapter();
    await runWatcherCycle(project.repo, project.config, first);
    assert.equal(first.calls[0]?.taskNumber, '1');

    await commitMain(project, [
      [ORDERS, ORDERS_SPEC_ROUNDED],
      [IN_SCOPE, 'main\n'],
    ]);
    await runWatcherCycle(project.repo, project.config, new ActingAdapter());
    const halted = deriveSpecState(
      await readChangeFolder(project.worktree, project.worktreeFolder),
    );
    assert.equal(halted.steering?.[0]?.trigger, 'requirement_changed');

    await writeAt(
      project.worktreeFolder,
      path.posix.join('specs', 'orders', 'spec.md'),
      MODIFY_TOTALS_ROUNDED,
    );
    const stdout = await captureApprove(project, '001');

    assert.ok(
      stdout.includes(
        '  Restarted from main; kept the old branch as osq/001-order-flow-restarted-1',
      ),
    );
    assert.equal(
      await git(
        ['log', '-1', '--format=%s', `${worktreeBranch(CHANGE_ID)}-restarted-1`],
        project.repo,
      ),
      'osq: 001 approved',
    );
  });
});
