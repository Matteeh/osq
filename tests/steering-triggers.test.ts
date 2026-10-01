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
import { type SpecData, parseSpecMd } from '../src/core/spec/parser.js';
import {
  type ChangeFolderSnapshot,
  deriveSpecState,
  readChangeFolder,
} from '../src/core/status/state.js';
import {
  deriveSteering,
  describeTrigger,
  steeringMarkerPath,
} from '../src/core/status/steering.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGE_ID = '001-order-flow';
const CHANGE_REL = path.posix.join('openspec', 'changes', CHANGE_ID);
const IN_SCOPE = 'src/one.txt';
const SECOND_SCOPE = 'src/two.txt';
const OUT_SCOPE = 'src/out.txt';

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
    folderName: '001-snapshot',
    folderPath: '/does/not/exist/001-snapshot',
    spec: SPEC,
    approvedHash: 'sha256:abc123',
    taskFiles: new Map([
      ['1.md', taskFile('Task one')],
      ['2.md', taskFile('Task two')],
    ]),
    doneMarkers: new Set<string>(),
    deadMarkers: new Map<string, string>(),
    regressedMarkers: new Map<string, string>(),
    runningPids: new Map<string, string>(),
    resultFiles: new Set<string>(),
    unmetDependencies: new Set<string>(),
    ...overrides,
  };
}

const STUCK_MARKER = '---\nreason: verify_red\nstuck: true\nfingerprint: sha256:abc\n---\nfailed\n';

describe('deriveSteering', () => {
  it('reports a stuck task and carries it on the derived state', () => {
    const snapshot = baseSnapshot({ deadMarkers: new Map([['2', STUCK_MARKER]]) });
    assert.deepEqual(deriveSteering(snapshot), [
      { target: '2', trigger: 'stuck', reason: 'verify_red' },
    ]);
    const state = deriveSpecState(snapshot);
    assert.deepEqual(state.steering, [{ target: '2', trigger: 'stuck', reason: 'verify_red' }]);
  });

  it('reports a blocked task', () => {
    const snapshot = baseSnapshot({
      deadMarkers: new Map([['1', '---\nreason: blocked\n---\nNeeds src/three.txt\n']]),
    });
    assert.deepEqual(deriveSteering(snapshot), [
      { target: '1', trigger: 'blocked', reason: 'blocked' },
    ]);
  });

  it('reports an archive regression before task triggers', () => {
    const snapshot = baseSnapshot({
      deadMarkers: new Map([['2', STUCK_MARKER]]),
      regressedMarkers: new Map([['change', '---\nreason: verify_red\n---\nred\n']]),
    });
    assert.deepEqual(deriveSteering(snapshot), [
      { target: 'change', trigger: 'regression', reason: 'verify_red' },
      { target: '2', trigger: 'stuck', reason: 'verify_red' },
    ]);
  });

  it('reports a task regression whatever its reason', () => {
    const snapshot = baseSnapshot({
      regressedMarkers: new Map([['1', '---\nreason: scope_regression\n---\nscope\n']]),
    });
    assert.deepEqual(deriveSteering(snapshot), [
      { target: '1', trigger: 'regression', reason: 'scope_regression' },
    ]);
  });

  it('reports a verify_path_missing change regression', () => {
    const snapshot = baseSnapshot({
      regressedMarkers: new Map([['change', '---\nreason: verify_path_missing\n---\nmissing\n']]),
    });
    assert.deepEqual(deriveSteering(snapshot), [
      { target: 'change', trigger: 'regression', reason: 'verify_path_missing' },
    ]);
  });

  it('yields nothing for a dead task without stuck or blocked', () => {
    const snapshot = baseSnapshot({
      deadMarkers: new Map([['1', '---\nreason: verify_red\n---\nfailed\n']]),
      regressedMarkers: new Map([['change', '---\nreason: worktree_dirty\n---\ndirty\n']]),
    });
    assert.deepEqual(deriveSteering(snapshot), []);
    assert.ok(!('steering' in deriveSpecState(snapshot)));
  });

  it('yields nothing for a dead task with a done marker', () => {
    const snapshot = baseSnapshot({
      deadMarkers: new Map([['1', STUCK_MARKER]]),
      doneMarkers: new Set(['1']),
    });
    assert.deepEqual(deriveSteering(snapshot), []);
  });

  it('yields nothing for an unapproved change', () => {
    const snapshot = baseSnapshot({
      approvedHash: null,
      deadMarkers: new Map([['1', STUCK_MARKER]]),
    });
    assert.deepEqual(deriveSteering(snapshot), []);
  });
});

describe('describeTrigger and steeringMarkerPath', () => {
  it('renders task and change labels', () => {
    assert.equal(
      describeTrigger({ target: '2', trigger: 'stuck', reason: 'verify_red' }),
      'task 2 stuck (verify_red)',
    );
    assert.equal(
      describeTrigger({ target: 'change', trigger: 'regression', reason: 'verify_red' }),
      'change regression (verify_red)',
    );
  });

  it('points a regression at its regressed marker and the rest at dead', () => {
    const folder = '/tmp/001-order-flow';
    assert.equal(
      steeringMarkerPath(folder, { target: 'change', trigger: 'regression', reason: 'verify_red' }),
      path.join(folder, '.run', 'regressed', 'change.md'),
    );
    assert.equal(
      steeringMarkerPath(folder, {
        target: '2',
        trigger: 'regression',
        reason: 'scope_regression',
      }),
      path.join(folder, '.run', 'regressed', '2.md'),
    );
    assert.equal(
      steeringMarkerPath(folder, { target: '2', trigger: 'stuck', reason: 'verify_red' }),
      path.join(folder, '.run', 'dead', '2.md'),
    );
    assert.equal(
      steeringMarkerPath(folder, { target: '1', trigger: 'blocked', reason: 'blocked' }),
      path.join(folder, '.run', 'dead', '1.md'),
    );
  });
});

// ---------------------------------------------------------------------------
// Watcher scenarios in a temporary git repository
// ---------------------------------------------------------------------------

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

async function exists(target: string): Promise<boolean> {
  return fs.access(target).then(
    () => true,
    () => false,
  );
}

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

interface Project {
  readonly repo: string;
  readonly worktree: string;
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

/** A committed temp repository with one change approved into a linked worktree. */
async function setupProject(options: ProjectOptions): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-steering-'));
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

/** Fake adapter whose spawn edits files and returns a configurable result file. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';
  readonly calls: SpawnTaskOptions[] = [];

  constructor(
    private readonly act: (options: SpawnTaskOptions) => Promise<void>,
    private readonly result: (options: SpawnTaskOptions) => string = () => '# Agent result\n',
  ) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.calls.push({ ...options });
    await this.act(options);
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(
      path.join(resultsDir, `${options.taskNumber}.md`),
      this.result(options),
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

const blockedResult = (options: SpawnTaskOptions): string =>
  options.taskNumber === '2' ? '## Blocked\nNeeds src/two.txt\n' : '# Agent result\n';

describe('Watcher leaves a change that needs steering', () => {
  it('leaves an edited plan alone when a blocked task can be replanned', async () => {
    const project = await setupProject({ specs: [FIRST, SECOND] });
    const adapter = new ActingAdapter(writeTaskScope, blockedResult);

    await runWatcherCycle(project.repo, project.config, adapter);
    await runWatcherCycle(project.repo, project.config, adapter);
    assert.equal(adapter.calls.length, 2);
    assert.equal(adapter.calls[1]?.taskNumber, '2');
    const state = deriveSpecState(await readFolderState(project));
    assert.deepEqual(state.steering, [{ target: '2', trigger: 'blocked', reason: 'blocked' }]);

    await fs.writeFile(
      path.join(project.worktreeFolder, 'tasks', '2.md'),
      `${taskMarkdown(SECOND)}\n<!-- edited -->\n`,
      'utf8',
    );
    await fs.writeFile(path.join(project.worktreeFolder, 'plan-prompt.md'), '# revised\n', 'utf8');
    const headBefore = await git(['rev-parse', 'HEAD'], project.worktree);
    const callsBefore = adapter.calls.length;

    const summary = await runWatcherCycle(project.repo, project.config, adapter);

    assert.equal(summary.tasksRun, 0);
    assert.equal(adapter.calls.length, callsBefore);
    assert.equal(await git(['rev-parse', 'HEAD'], project.worktree), headBefore);
    assert.equal(
      await exists(path.join(project.worktreeFolder, '.run', 'regressed', 'change.md')),
      false,
    );
  });

  it('marks a second identical death stuck and later cycles spawn nothing', async () => {
    const project = await setupProject({
      specs: [FIRST, SECOND],
      verify: ALWAYS_FAIL_VERIFY,
      gates: { autoRetries: 1 },
    });
    const adapter = new ActingAdapter(writeTaskScope);

    await runWatcherCycle(project.repo, project.config, adapter);
    await runWatcherCycle(project.repo, project.config, adapter);
    assert.equal(adapter.calls.length, 2);

    await runWatcherCycle(project.repo, project.config, adapter);
    assert.equal(adapter.calls.length, 2);
    const dead = await fs.readFile(
      path.join(project.worktreeFolder, '.run', 'dead', '1.md'),
      'utf8',
    );
    assert.match(dead, /stuck: true/);
    const state = deriveSpecState(await readFolderState(project));
    assert.deepEqual(state.steering, [{ target: '1', trigger: 'stuck', reason: 'verify_red' }]);

    await runWatcherCycle(project.repo, project.config, adapter);
    assert.equal(adapter.calls.length, 2);
  });

  it('spawns again once the stuck task is retried', async () => {
    const project = await setupProject({
      specs: [FIRST, SECOND],
      verify: ALWAYS_FAIL_VERIFY,
      gates: { autoRetries: 1 },
    });
    const adapter = new ActingAdapter(writeTaskScope);

    await runWatcherCycle(project.repo, project.config, adapter);
    await runWatcherCycle(project.repo, project.config, adapter);
    await runWatcherCycle(project.repo, project.config, adapter);
    assert.equal(adapter.calls.length, 2);

    await retrySpec(project.repo, '1', '1', project.config);

    const summary = await runWatcherCycle(project.repo, project.config, adapter);

    assert.equal(summary.tasksRun, 1);
    assert.equal(adapter.calls.length, 3);
  });
});

function readFolderState(project: Project): Promise<ChangeFolderSnapshot> {
  return readChangeFolder(project.worktree, project.worktreeFolder);
}
