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
import {
  type AutoSteerOutcome,
  autoSteerRecordPath,
  currentAutoSteer,
  readAutoSteerRecord,
  steeringKey,
  writeAutoSteerRecord,
} from '../src/core/run/auto-steer-record.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { deriveSpecState } from '../src/core/status/state.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import type { AutoSteerOptions } from '../src/watcher/auto-steer.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGE_ID = '001-order-flow';
const CHANGE_REL = path.posix.join('openspec', 'changes', CHANGE_ID);
const FIRST_SCOPE = 'src/one.txt';
const SECOND_SCOPE = 'src/two.txt';
const PROMPT = 'STEERING PROMPT';

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

interface TaskSpec {
  readonly title: string;
  readonly scope: string[];
}

const FIRST: TaskSpec = { title: 'First task', scope: [FIRST_SCOPE] };
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

function tasksMarkdown(specs: readonly TaskSpec[]): string {
  const lines = ['# Tasks', ''];
  specs.forEach((spec, index) => lines.push(`- [ ] ${index + 1}. ${spec.title}`));
  lines.push('');
  return lines.join('\n');
}

async function writeChange(folderPath: string, specs: readonly TaskSpec[]): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMarkdown('Order Flow'), 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks.md'), tasksMarkdown(specs), 'utf8');
  for (let index = 0; index < specs.length; index += 1) {
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${index + 1}.md`),
      taskMarkdown(specs[index] as TaskSpec),
      'utf8',
    );
  }
}

interface Project {
  readonly repo: string;
  readonly worktree: string;
  readonly checkoutFolder: string;
  readonly worktreeFolder: string;
  readonly config: OsqConfig;
}

/** The steering-approve fixture plus an optional autoSteer block. */
async function setupProject(
  specs: readonly TaskSpec[],
  autoSteer?: { readonly enabled: boolean },
): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-auto-steer-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, 'src', 'out.txt'), 'out\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const checkoutFolder = path.join(repo, CHANGE_REL);
  await writeChange(checkoutFolder, specs);

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({
    vcs,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
    ...(autoSteer !== undefined ? { autoSteer } : {}),
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

async function markDone(folderPath: string, taskNumber: string): Promise<void> {
  const dir = path.join(folderPath, '.run', 'done');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, taskNumber), '', 'utf8');
}

async function markBlocked(folderPath: string, taskNumber: string, need: string): Promise<void> {
  const dir = path.join(folderPath, '.run', 'dead');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${taskNumber}.md`), `---\nreason: blocked\n---\n${need}\n`);
}

async function writeChangeRegression(folderPath: string, reason: string): Promise<void> {
  const dir = path.join(folderPath, '.run', 'regressed');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'change.md'), `---\nreason: ${reason}\n---\nprior\n`, 'utf8');
}

interface RawEvent {
  readonly type: string;
  readonly data: Record<string, unknown>;
}

async function readEvents(folderPath: string, stream: string): Promise<RawEvent[]> {
  const file = path.join(folderPath, '.run', 'events', `${stream}.jsonl`);
  const content = await fs.readFile(file, 'utf8').catch(() => '');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as RawEvent);
}

type PlannerAction = (options: SpawnTaskOptions) => Promise<SpawnResult>;
type TaskAction = PlannerAction;

class RecordingAdapter implements HarnessAdapter {
  readonly name = 'recording';
  readonly calls: SpawnTaskOptions[] = [];

  constructor(private readonly action: TaskAction = async () => ({ exitCode: 0 })) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.calls.push({ ...options });
    return this.action(options);
  }
}

function plannerAdapter(action: PlannerAction): RecordingAdapter {
  return new RecordingAdapter(action);
}

function steer(
  steeringPrompt: () => Promise<string | null>,
  planner?: RecordingAdapter,
): AutoSteerOptions {
  return {
    steeringPrompt: async () => steeringPrompt(),
    ...(planner !== undefined ? { plannerAdapter: planner } : {}),
  };
}

async function captureStdout(run: () => Promise<void>): Promise<void> {
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    await run();
  } finally {
    process.stdout.write = original;
  }
}

async function runCycle(project: Project, plan: AutoSteerOptions): Promise<number> {
  const taskAdapter = new RecordingAdapter();
  const summary = await runWatcherCycle(
    project.repo,
    project.config,
    taskAdapter,
    undefined,
    undefined,
    plan,
  );
  return summary.tasksRun;
}

describe('Automatic steering run', () => {
  it('runs the planner once on the prompt, puts back outside writes, and records ready', async () => {
    const project = await setupProject([FIRST, SECOND], { enabled: true });
    await markDone(project.worktreeFolder, '1');
    await markBlocked(project.worktreeFolder, '2', 'Needs src/three.txt');

    const taskPath = path.join(project.worktreeFolder, 'tasks', '2.md');
    const revised = (await fs.readFile(taskPath, 'utf8')).replace('does the thing', 'does it now');
    const approvedBefore = await fs.readFile(path.join(project.worktreeFolder, '.run', 'approved'));
    const outBefore = await fs.readFile(path.join(project.worktree, 'src', 'out.txt'));

    const planner = plannerAdapter(async (options) => {
      await fs.writeFile(taskPath, revised, 'utf8');
      await fs.writeFile(path.join(options.projectRoot, 'src', 'out.txt'), 'planner\n', 'utf8');
      await fs.writeFile(path.join(options.specFolderPath, '.run', 'approved'), 'forged\n', 'utf8');
      return { exitCode: 0 };
    });

    await runCycle(
      project,
      steer(async () => PROMPT, planner),
    );

    assert.equal(planner.calls.length, 1);
    assert.equal(planner.calls[0]?.taskNumber, 'planner');
    assert.equal(planner.calls[0]?.taskTitle, 'Steering planner');
    assert.equal(planner.calls[0]?.prompt, PROMPT);

    const record = await readAutoSteerRecord(project.worktreeFolder);
    assert.equal(record?.outcome, 'ready');
    assert.deepEqual(record?.changed, ['tasks/2.md']);
    assert.equal(await fs.readFile(taskPath, 'utf8'), revised);
    assert.deepEqual(
      await fs.readFile(path.join(project.worktreeFolder, '.run', 'approved')),
      approvedBefore,
    );
    assert.deepEqual(await fs.readFile(path.join(project.worktree, 'src', 'out.txt')), outBefore);

    const runs = (await readEvents(project.worktreeFolder, 'change')).filter(
      (event) => event.type === 'auto_steer_ran',
    );
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.data.outcome, 'ready');
    assert.deepEqual(runs[0]?.data.restored, [`${CHANGE_REL}/.run/approved`, 'src/out.txt']);
  });

  it('spawns no second planner and writes no second event for one trigger', async () => {
    const project = await setupProject([FIRST, SECOND], { enabled: true });
    await markDone(project.worktreeFolder, '1');
    await markBlocked(project.worktreeFolder, '2', 'Needs src/three.txt');
    const planner = plannerAdapter(async () => ({ exitCode: 0 }));
    const plan = steer(async () => PROMPT, planner);

    const first = await runCycle(project, plan);
    const second = await runCycle(project, plan);

    assert.equal(first, 0);
    assert.equal(second, 0);
    assert.equal(planner.calls.length, 1);
    const runs = (await readEvents(project.worktreeFolder, 'change')).filter(
      (event) => event.type === 'auto_steer_ran',
    );
    assert.equal(runs.length, 1);
  });

  it('runs task 2 again after the revised plan is approved', async () => {
    const project = await setupProject([FIRST, SECOND], { enabled: true });
    await markDone(project.worktreeFolder, '1');
    await markBlocked(project.worktreeFolder, '2', 'Needs src/three.txt');
    const taskPath = path.join(project.worktreeFolder, 'tasks', '2.md');
    const revised = (await fs.readFile(taskPath, 'utf8')).replace('does the thing', 'does it now');
    const planner = plannerAdapter(async () => {
      await fs.writeFile(taskPath, revised, 'utf8');
      return { exitCode: 0 };
    });
    await runCycle(
      project,
      steer(async () => PROMPT, planner),
    );
    assert.equal((await readAutoSteerRecord(project.worktreeFolder))?.outcome, 'ready');

    await captureStdout(() =>
      approveCommand(['001'], { cwd: project.repo, config: project.config, planningReaders: [] }),
    );

    const adapter = new RecordingAdapter(async (options) => {
      const target = options.taskNumber === '2' ? SECOND_SCOPE : FIRST_SCOPE;
      await fs.writeFile(path.join(options.projectRoot, target), `task ${options.taskNumber}\n`);
      const resultsDir = path.join(options.specFolderPath, '.run', 'results');
      await fs.mkdir(resultsDir, { recursive: true });
      await fs.writeFile(path.join(resultsDir, `${options.taskNumber}.md`), '# result\n');
      return { exitCode: 0 };
    });
    const summary = await runWatcherCycle(project.repo, project.config, adapter);

    assert.equal(summary.tasksRun, 1);
    assert.equal(adapter.calls[0]?.taskNumber, '2');
  });

  it('spawns nothing and writes no record without the autoSteer block', async () => {
    const project = await setupProject([FIRST, SECOND]);
    await markBlocked(project.worktreeFolder, '2', 'Needs src/three.txt');
    const planner = plannerAdapter(async () => ({ exitCode: 0 }));

    await runCycle(
      project,
      steer(async () => PROMPT, planner),
    );

    assert.equal(planner.calls.length, 0);
    assert.equal(await exists(autoSteerRecordPath(project.worktreeFolder)), false);
  });

  it('leaves a default-branch trigger for a human', async () => {
    const project = await setupProject([FIRST, SECOND], { enabled: true });
    await markBlocked(project.worktreeFolder, '2', 'Needs src/three.txt');
    await writeChangeRegression(project.worktreeFolder, 'sync_conflict');
    const planner = plannerAdapter(async () => ({ exitCode: 0 }));

    await runCycle(
      project,
      steer(async () => PROMPT, planner),
    );

    assert.equal(planner.calls.length, 0);
    assert.equal(await exists(autoSteerRecordPath(project.worktreeFolder)), false);
  });

  it('records a failure and carries on when the prompt cannot be built', async () => {
    const project = await setupProject([FIRST, SECOND], { enabled: true });
    await markBlocked(project.worktreeFolder, '2', 'Needs src/three.txt');
    const planner = plannerAdapter(async () => ({ exitCode: 0 }));

    const tasksRun = await runCycle(
      project,
      steer(async () => {
        throw new Error('ENOENT: brief.md');
      }, planner),
    );

    assert.equal(tasksRun, 0);
    assert.equal(planner.calls.length, 0);
    const record = await readAutoSteerRecord(project.worktreeFolder);
    assert.equal(record?.outcome, 'failed');
    assert.ok(record?.detail?.includes('ENOENT: brief.md'));
  });

  it('rewrites a running record as failed without spawning', async () => {
    const project = await setupProject([FIRST, SECOND], { enabled: true });
    await markBlocked(project.worktreeFolder, '2', 'Needs src/three.txt');
    const state = await deriveSpecState(project.worktree, project.worktreeFolder);
    const key = await steeringKey(
      project.worktreeFolder,
      state.approvedHash as string,
      state.steering ?? [],
    );
    await writeAutoSteerRecord(project.worktreeFolder, {
      key,
      outcome: 'running',
      changed: [],
      at: new Date().toISOString(),
    });
    const planner = plannerAdapter(async () => ({ exitCode: 0 }));

    await runCycle(
      project,
      steer(async () => PROMPT, planner),
    );

    assert.equal(planner.calls.length, 0);
    const record = await readAutoSteerRecord(project.worktreeFolder);
    assert.equal(record?.outcome, 'failed');
    assert.ok(record?.detail?.includes('interrupted: the watcher stopped during the run'));
  });

  it('changes the key with the marker and the approved hash', async () => {
    const project = await setupProject([FIRST, SECOND], { enabled: true });
    await markBlocked(project.worktreeFolder, '2', 'Needs src/three.txt');
    const folder = project.worktreeFolder;
    const state = await deriveSpecState(project.worktree, folder);
    const approvedHash = state.approvedHash as string;
    assert.ok((state.steering ?? []).length > 0);

    const key1 = await steeringKey(folder, approvedHash, state.steering ?? []);
    const key2 = await steeringKey(folder, approvedHash, state.steering ?? []);
    assert.equal(key1, key2);

    await fs.writeFile(
      path.join(folder, '.run', 'dead', '2.md'),
      '---\nreason: blocked\n---\nDifferent need\n',
      'utf8',
    );
    const changed = await deriveSpecState(project.worktree, folder);
    const key3 = await steeringKey(folder, approvedHash, changed.steering ?? []);
    assert.notEqual(key3, key1);

    const key4 = await steeringKey(folder, `${approvedHash}-other`, changed.steering ?? []);
    assert.notEqual(key4, key3);
  });

  it('returns null for a record from an earlier trigger', async () => {
    const project = await setupProject([FIRST, SECOND], { enabled: true });
    await markBlocked(project.worktreeFolder, '2', 'Needs src/three.txt');
    const folder = project.worktreeFolder;
    const state = await deriveSpecState(project.worktree, folder);
    const key = await steeringKey(folder, state.approvedHash as string, state.steering ?? []);
    await writeAutoSteerRecord(folder, {
      key,
      outcome: 'ready',
      changed: ['tasks/2.md'],
      at: new Date().toISOString(),
    });
    assert.ok(await currentAutoSteer(state));

    await fs.writeFile(
      path.join(folder, '.run', 'dead', '2.md'),
      '---\nreason: blocked\n---\nAnother need\n',
      'utf8',
    );
    const stale = await deriveSpecState(project.worktree, folder);
    assert.equal(await currentAutoSteer(stale), null);
  });
});

const OUTCOME_ROWS: readonly {
  readonly label: string;
  readonly action: PlannerAction;
  readonly outcome: AutoSteerOutcome;
}[] = [
  { label: 'exits 1', action: async () => ({ exitCode: 1, error: 'boom' }), outcome: 'failed' },
  {
    label: 'times out',
    action: async () => ({ exitCode: 1, timedOut: true }),
    outcome: 'timed_out',
  },
  { label: 'makes no edit', action: async () => ({ exitCode: 0 }), outcome: 'unchanged' },
  {
    label: 'writes the sentinel',
    action: async (options) => {
      const taskPath = path.join(options.specFolderPath, 'tasks', '2.md');
      const content = await fs.readFile(taskPath, 'utf8');
      await fs.writeFile(
        taskPath,
        content.replace('verify: node verify.cjs', 'verify: node -e "process.exit(0)"'),
        'utf8',
      );
      return { exitCode: 0 };
    },
    outcome: 'lint_red',
  },
];

describe('Automatic steering planner outcomes', () => {
  for (const row of OUTCOME_ROWS) {
    it(`records ${row.outcome} when the planner ${row.label}`, async () => {
      const project = await setupProject([FIRST, SECOND], { enabled: true });
      await markBlocked(project.worktreeFolder, '2', 'Needs src/three.txt');
      const planner = plannerAdapter(row.action);

      await runCycle(
        project,
        steer(async () => PROMPT, planner),
      );

      assert.equal(planner.calls.length, 1);
      const record = await readAutoSteerRecord(project.worktreeFolder);
      assert.equal(record?.outcome, row.outcome);
      assert.equal(await exists(path.join(project.worktreeFolder, '.run', 'dead', '2.md')), true);
    });
  }
});
