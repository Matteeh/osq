import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import { DEFAULT_CONFIG, type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { readUsagePause, writeUsagePause } from '../src/core/run/usage-pause.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { parseTaskMd } from '../src/core/spec/parser.js';
import {
  type HarnessAdapter,
  type SpawnResult,
  type SpawnTaskOptions,
  appendHarnessEvent,
} from '../src/harness/types.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { spawnTaskAgent } from '../src/watcher/spawn.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const RESET_MS = 3_600_000;
const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function exists(target: string): Promise<boolean> {
  return fs.access(target).then(
    () => true,
    () => false,
  );
}

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

async function readEvents(folder: string, target = '1'): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(folder, '.run', 'events', `${target}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

const TASK_DATA = parseTaskMd(
  [
    '---',
    'title: Usage limit',
    'verify: node --version',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] pauses',
    '',
  ].join('\n'),
);

/** Adapter that appends one `usage_limit` event (or none) before it returns. */
class LimitAdapter implements HarnessAdapter {
  readonly name = 'limit-stub';

  constructor(
    private readonly limit: Record<string, unknown> | null,
    private readonly result: SpawnResult = { exitCode: 1 },
    readonly pid = 4321,
  ) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await options.onSpawn?.(this.pid);
    if (this.limit !== null) {
      await appendHarnessEvent(options.specFolderPath, options.taskNumber, {
        type: 'usage_limit',
        timestamp: new Date().toISOString(),
        data: this.limit,
      });
    }
    return { ...this.result, pid: this.pid };
  }
}

const configWith = (gates: Partial<typeof DEFAULT_GATES_CONFIG> = {}): OsqConfig => ({
  ...DEFAULT_CONFIG,
  gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off', ...gates },
});

async function agentFolder(): Promise<{ root: string; folder: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-usage-pause-agent-'));
  tmpDirs.push(root);
  const folder = path.join(root, 'openspec', 'changes', '001-usage');
  await fs.mkdir(path.join(folder, '.run', 'events'), { recursive: true });
  return { root, folder };
}

async function spawnOnce(
  folder: string,
  root: string,
  adapter: HarnessAdapter,
  config: OsqConfig = configWith(),
): Promise<{ outcome: Awaited<ReturnType<typeof spawnTaskAgent>>; logs: unknown[] }> {
  const logs: unknown[] = [];
  const outcome = await spawnTaskAgent({
    projectRoot: root,
    specFolderPath: folder,
    taskNumber: '1',
    taskData: TASK_DATA,
    config,
    adapter,
    logOutcome: (success, reason, extra) => logs.push({ success, reason, extra }),
  });
  return { outcome, logs };
}

describe('spawn pauses on a usage limit', () => {
  it('pauses with the harness reset time and writes no dead record', async () => {
    const { root, folder } = await agentFolder();
    const resetsAt = new Date(Date.now() + RESET_MS).toISOString();

    const { outcome, logs } = await spawnOnce(folder, root, new LimitAdapter({ resetsAt }));

    assert.equal(outcome.ok, false);
    if (outcome.ok) throw new Error('unreachable');
    assert.deepEqual(outcome.result.paused, { until: resetsAt });
    assert.equal(outcome.result.reason, undefined);
    assert.equal(logs.length, 0, 'a pause prints no dead line');

    assert.deepEqual(await readUsagePause(folder), {
      task: '1',
      until: resetsAt,
      source: 'harness',
    });
    const events = await readEvents(folder);
    const paused = events.filter((event) => event.type === 'paused');
    assert.equal(paused.length, 1);
    assert.equal(paused[0]?.data?.task, '1');
    assert.equal(paused[0]?.data?.until, resetsAt);
    assert.equal(paused[0]?.data?.source, 'harness');
    assert.equal(
      events.some((event) => event.type === 'dead' || event.type === 'retry'),
      false,
    );
    assert.equal(await exists(path.join(folder, '.run', 'dead', '1.md')), false);
  });

  it('waits the configured seconds when the harness gives no reset time', async () => {
    const { root, folder } = await agentFolder();
    const config = configWith({ usageLimitWaitSeconds: 600 });

    const before = Date.now();
    const { outcome } = await spawnOnce(
      folder,
      root,
      new LimitAdapter({}, { exitCode: 0 }),
      config,
    );
    const after = Date.now();

    assert.equal(outcome.ok, false);
    if (outcome.ok) throw new Error('unreachable');
    const pause = await readUsagePause(folder);
    assert.ok(pause, 'a pause marker exists');
    assert.equal(pause?.source, 'wait');
    const pauseAt = Date.parse(pause?.until ?? '') - 600_000;
    assert.ok(pauseAt >= before && pauseAt <= after, 'the wait is 600 seconds');
    assert.deepEqual(outcome.result.paused, { until: pause?.until });
    assert.equal(outcome.result.reason, undefined);
    assert.equal(await exists(path.join(folder, '.run', 'dead', '1.md')), false);
    assert.equal(
      (await readEvents(folder)).some((event) => event.type === 'dead'),
      false,
    );
  });

  it('judges the attempt normally when the limit is from an earlier attempt', async () => {
    const { root, folder } = await agentFolder();
    const streamPath = path.join(folder, '.run', 'events', '1.jsonl');
    await fs.writeFile(
      streamPath,
      [
        JSON.stringify({
          type: 'started',
          timestamp: new Date().toISOString(),
          data: { attempt: 1 },
        }),
        JSON.stringify({
          type: 'usage_limit',
          timestamp: new Date().toISOString(),
          data: { resetsAt: new Date(Date.now() + RESET_MS).toISOString() },
        }),
        '',
      ].join('\n'),
      'utf8',
    );

    const { outcome } = await spawnOnce(folder, root, new LimitAdapter(null, { exitCode: 1 }));

    assert.equal(outcome.ok, false);
    if (outcome.ok) throw new Error('unreachable');
    assert.equal(outcome.result.reason, 'crashed');
    assert.equal(outcome.result.paused, undefined);
    assert.equal(await exists(path.join(folder, '.run', 'paused.md')), false);
  });
});

const PASSING = 'process.exit(0);\n';
const FAILING = 'process.exit(1);\n';

const TASK_MD = [
  '---',
  'title: A pending task',
  'verify: node verify.cjs',
  'scope: []',
  'entry: []',
  'skills: []',
  '---',
  '## Acceptance',
  '- [ ] does the thing',
  '',
].join('\n');

/** Adapter that records its spawns and writes a passing result. */
class CountingAdapter implements HarnessAdapter {
  readonly name = 'counting';
  calls: SpawnTaskOptions[] = [];

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.calls.push({ ...options });
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

async function setupRepo(verify: string): Promise<{ root: string; config: OsqConfig }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-usage-pause-loop-'));
  tmpDirs.push(root);
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), verify, 'utf8');
  return { root, config: configWith() };
}

async function addChange(root: string, config: OsqConfig, title: string): Promise<string> {
  const spec = await createNewSpec(root, title);
  const folder = spec.folderPath;
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), TASK_MD, 'utf8');
  const proposalPath = path.join(folder, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8');
  await fs.writeFile(
    proposalPath,
    proposal.replace(/^verify:.*$/m, 'verify: node verify.cjs'),
    'utf8',
  );
  await approveSpec(root, path.basename(folder).match(/^(\d+)/)?.[1] ?? folder, config);
  return folder;
}

describe('usage limit wait across changes', () => {
  it('starts nothing on any change while a pause holds', async () => {
    const { root, config } = await setupRepo(PASSING);
    const first = await addChange(root, config, 'First');
    const second = await addChange(root, config, 'Second');
    await writeUsagePause(first, {
      task: '1',
      until: new Date(Date.now() + RESET_MS).toISOString(),
      source: 'harness',
    });

    const adapter = new CountingAdapter();
    const summary = await runWatcherCycle(root, config, adapter);

    assert.equal(summary.tasksRun, 0);
    assert.equal(adapter.calls.length, 0, 'no task spawns on any change');
    assert.equal(await exists(path.join(second, '.run', 'events', '1.jsonl')), false);
    assert.equal(await exists(path.join(second, '.run', 'done', '1')), false);
    assert.ok(await exists(path.join(first, '.run', 'paused.md')));
  });

  it('removes a passed pause and runs the task with its old attempt', async () => {
    const { root, config } = await setupRepo(FAILING);
    const folder = await addChange(root, config, 'Paused');
    await writeUsagePause(folder, {
      task: '1',
      until: new Date(Date.now() - 60_000).toISOString(),
      source: 'harness',
    });

    const adapter = new CountingAdapter();
    const summary = await runWatcherCycle(root, config, adapter);

    assert.equal(summary.tasksRun, 1);
    assert.equal(adapter.calls.length, 1);
    assert.equal(await exists(path.join(folder, '.run', 'paused.md')), false);
    const started = (await readEvents(folder)).filter((event) => event.type === 'started');
    assert.equal(started.length, 1);
    assert.equal(started[0]?.data?.attempt, 1);
  });
});

const CHANGE_REL = path.posix.join('openspec', 'changes', '001-order-flow');

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

function proposalMarkdown(): string {
  return [
    '---',
    'title: Order Flow',
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    'Run the task.',
    '',
    '## Surface',
    'None.',
    '',
    '## Human steps',
    'None',
    '',
  ].join('\n');
}

function taskMarkdown(): string {
  return [
    '---',
    'title: First task',
    'verify: node verify.cjs',
    'scope: ["src/one.txt"]',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] does the thing',
    '',
  ].join('\n');
}

interface WorktreeProject {
  repo: string;
  worktree: string;
  worktreeFolder: string;
  config: OsqConfig;
}

async function setupWorktree(): Promise<WorktreeProject> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-usage-pause-wt-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), PASSING, 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, 'src', 'out.txt'), 'out\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const checkoutFolder = path.join(repo, CHANGE_REL);
  await fs.mkdir(path.join(checkoutFolder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(checkoutFolder, 'proposal.md'), proposalMarkdown(), 'utf8');
  await fs.writeFile(path.join(checkoutFolder, 'tasks', '1.md'), taskMarkdown(), 'utf8');

  const config = defineConfig({
    vcs: {
      enabled: true,
      author: 'Osq <osq@example.invalid>',
      worktreeRoot: worktrees,
    },
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
  });
  const result = await approveSpec(repo, '001', config);
  assert.ok(result.worktreePath, 'approval created a worktree');
  return {
    repo,
    worktree: result.worktreePath,
    worktreeFolder: path.join(result.worktreePath, CHANGE_REL),
    config,
  };
}

/** Adapter that edits a file outside the change folder then hits the limit. */
class PausedWorktreeAdapter implements HarnessAdapter {
  readonly name = 'paused-wt';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await options.onSpawn?.(9876);
    await fs.writeFile(path.join(options.projectRoot, 'src', 'out.txt'), 'agent edit\n', 'utf8');
    await appendHarnessEvent(options.specFolderPath, options.taskNumber, {
      type: 'usage_limit',
      timestamp: new Date().toISOString(),
      data: { resetsAt: new Date(Date.now() + RESET_MS).toISOString() },
    });
    return { exitCode: 1, pid: 9876 };
  }
}

describe('usage limit pause in a worktree', () => {
  it('discards edits outside the change folder and makes no commit', async () => {
    const project = await setupWorktree();

    const summary = await runWatcherCycle(
      project.repo,
      project.config,
      new PausedWorktreeAdapter(),
    );

    assert.equal(summary.tasksRun, 1);
    assert.ok(await exists(path.join(project.worktreeFolder, '.run', 'paused.md')));
    assert.equal(
      await fs.readFile(path.join(project.worktree, 'src', 'out.txt'), 'utf8'),
      'out\n',
      "the agent's edit outside the change folder is gone",
    );
    assert.equal(
      await exists(path.join(project.worktreeFolder, '.run', 'dead', '1.md')),
      false,
      'a pause writes no dead marker',
    );
    assert.equal(
      await git(['log', '--format=%s', '-1'], project.worktree),
      'osq: 001 approved',
      'a pause makes no commit',
    );
    const paused = (await readEvents(project.worktreeFolder)).filter(
      (event) => event.type === 'paused',
    );
    assert.equal(paused.length, 1);
  });
});
