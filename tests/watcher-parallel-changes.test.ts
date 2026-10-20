import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { writeUsagePause } from '../src/core/run/usage-pause.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { type LocatedChange, listChanges } from '../src/core/status/change-locations.js';
import { worktreePath } from '../src/core/vcs/worktree.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherCycle, runWatcherOnce, startWatcher } from '../src/watcher/loop.js';
import { BuildChangedError } from '../src/watcher/service-build.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);

const CHANGES = path.join('openspec', 'changes');
const ARCHIVE = path.join('openspec', 'changes', 'archive');
const IN_SCOPE = 'src/one.txt';

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ChangeDef {
  readonly folder: string;
  readonly title: string;
  readonly caps: readonly string[];
}

const ONE: ChangeDef = { folder: '001-a', title: 'One', caps: ['orders'] };
const TWO: ChangeDef = { folder: '002-b', title: 'Two', caps: ['billing'] };
const THREE: ChangeDef = { folder: '003-c', title: 'Three', caps: ['search'] };

function deltaSpec(capability: string): string {
  return [
    `# Spec Delta: ${capability}`,
    '',
    '## Purpose',
    '',
    `The ${capability} capability for the test.`,
    '',
    '## ADDED Requirements',
    '',
    `### Requirement: ${capability} works`,
    '',
    `The ${capability} capability SHALL work.`,
    '',
    `#### Scenario: ${capability} runs`,
    '- **WHEN** it runs',
    '- **THEN** it works',
    '',
  ].join('\n');
}

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

function taskMarkdown(change: ChangeDef): string {
  return [
    '---',
    `title: ${change.title} task`,
    'verify: node verify.cjs',
    `scope: ${JSON.stringify([IN_SCOPE])}`,
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
  await fs.writeFile(path.join(folderPath, 'tasks.md'), '# Tasks\n\n- [ ] 1. Task\n', 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMarkdown(change), 'utf8');
  for (const capability of change.caps) {
    const dir = path.join(folderPath, 'specs', capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), deltaSpec(capability), 'utf8');
  }
}

interface Project {
  readonly root: string;
  readonly repo: string;
  readonly worktrees: string;
  readonly config: OsqConfig;
  readonly vcs: VcsConfig;
}

async function makeProject(
  changes: readonly ChangeDef[],
  maxConcurrency: number,
): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-parallel-changes-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, IN_SCOPE), 'seed\n', 'utf8');
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
    worktreeRoot: worktrees,
  };
  const config = defineConfig({ vcs, gates: { preSpawnVerify: 'off' }, maxConcurrency });
  return { root, repo, worktrees, config, vcs };
}

interface SpawnRecord {
  readonly folder: string;
  readonly folderPath: string;
  readonly start: number;
  end: number;
  ended: Promise<void>;
}

interface AdapterOptions {
  /** A gate every spawn waits on before it writes its files. */
  readonly gate?: Promise<void>;
  /** How long a lone spawn waits for a peer before it finishes. */
  readonly holdMs?: number;
  readonly onSpawn?: (record: SpawnRecord) => void;
}

/** Fake adapter recording spawn overlap, optionally waiting on a gate. */
class LaneAdapter implements HarnessAdapter {
  readonly name = 'lane';
  readonly spawns: SpawnRecord[] = [];
  private active = 0;
  private maxActive = 0;
  private readonly waiters: (() => void)[] = [];
  private readonly gate?: Promise<void>;
  private readonly holdMs: number;
  private readonly onSpawn?: (record: SpawnRecord) => void;

  constructor(options: AdapterOptions = {}) {
    this.gate = options.gate;
    this.holdMs = options.holdMs ?? 100;
    this.onSpawn = options.onSpawn;
  }

  get maxConcurrent(): number {
    return this.maxActive;
  }

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    let markEnded: () => void = () => {};
    const ended = new Promise<void>((resolve) => {
      markEnded = resolve;
    });
    const record: SpawnRecord = {
      folder: path.basename(options.specFolderPath),
      folderPath: options.specFolderPath,
      start: Date.now(),
      end: 0,
      ended,
    };
    this.spawns.push(record);
    this.active++;
    this.maxActive = Math.max(this.maxActive, this.active);
    this.notify();
    this.onSpawn?.(record);

    if (this.gate) {
      await this.gate;
    } else {
      await this.waitForPeerOrDelay();
    }

    await fs.mkdir(path.dirname(path.join(options.projectRoot, IN_SCOPE)), { recursive: true });
    await fs.writeFile(
      path.join(options.projectRoot, IN_SCOPE),
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

    record.end = Date.now();
    this.active--;
    markEnded();
    return { exitCode: 0 };
  }

  private notify(): void {
    for (const wake of this.waiters.splice(0)) wake();
  }

  private waitForPeerOrDelay(): Promise<void> {
    if (this.active > 1) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, this.holdMs);
      this.waiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

async function approveIntoWorktree(project: Project, folder: string): Promise<string> {
  const result = await approveSpec(project.repo, folder, project.config);
  assert.ok(result.worktreePath, `expected a worktree for ${folder}`);
  return result.worktreePath;
}

function archivePath(project: Project, folder: string): string {
  return path.join(worktreePath(project.vcs, project.repo, folder), ARCHIVE, folder);
}

function spawnedIn(adapter: LaneAdapter, folder: string): SpawnRecord[] {
  return adapter.spawns.filter((record) => record.folder === folder);
}

async function activeChange(project: Project, folder: string): Promise<LocatedChange> {
  const active = await listChanges(project.repo, project.config, ['active']);
  const change = active.find((candidate) => candidate.folderName === folder);
  assert.ok(change, `expected ${folder} active`);
  return change;
}

describe('Parallel change lanes', () => {
  it('runs two independent changes at once', async () => {
    const project = await makeProject([ONE, TWO], 2);
    await approveIntoWorktree(project, ONE.folder);
    await approveIntoWorktree(project, TWO.folder);

    // The first spawn waits until its peer arrives, however slow the machine.
    const adapter = new LaneAdapter({ holdMs: 30_000 });
    const summary = await runWatcherOnce(project.repo, project.config, adapter);

    assert.ok(adapter.maxConcurrent >= 2, 'both tasks ran at the same time');
    assert.equal(summary.tasksRun, 2);
    assert.equal(summary.specsArchived, 2);
    assert.equal(await exists(archivePath(project, ONE.folder)), true);
    assert.equal(await exists(archivePath(project, TWO.folder)), true);
  });

  it('holds the cap', async () => {
    const project = await makeProject([ONE, TWO, THREE], 2);
    for (const change of [ONE, TWO, THREE]) {
      await approveIntoWorktree(project, change.folder);
    }

    const adapter = new LaneAdapter({ holdMs: 20 });
    const summary = await runWatcherOnce(project.repo, project.config, adapter);

    assert.ok(adapter.maxConcurrent <= 2, 'never more than two spawns ran at once');
    assert.equal(summary.tasksRun, 3, 'all three tasks ran in one runWatcherOnce');
    assert.equal(summary.specsArchived, 3);
  });

  it('runs one lane as before', async () => {
    const project = await makeProject([ONE, TWO], 1);
    await approveIntoWorktree(project, ONE.folder);
    await approveIntoWorktree(project, TWO.folder);

    const adapter = new LaneAdapter({ holdMs: 20 });
    const summary = await runWatcherOnce(project.repo, project.config, adapter);

    assert.ok(adapter.maxConcurrent === 1, 'no two spawns ran at the same time');
    assert.equal(summary.tasksRun, 2);
    const one = spawnedIn(adapter, ONE.folder);
    const two = spawnedIn(adapter, TWO.folder);
    assert.equal(one.length, 1);
    assert.equal(two.length, 1);
    assert.ok(one[0].start < two[0].start, "001's task spawned before 002's");
  });

  it('waits for a stacked change to be cut', async () => {
    const project = await makeProject(
      [
        { ...ONE, caps: ['orders'] },
        { ...TWO, caps: ['orders'] },
      ],
      3,
    );
    await approveIntoWorktree(project, ONE.folder);
    await approveSpec(project.repo, TWO.folder, project.config);

    const adapter = new LaneAdapter({ holdMs: 20 });
    await runWatcherOnce(project.repo, project.config, adapter);

    const one = spawnedIn(adapter, ONE.folder);
    const two = spawnedIn(adapter, TWO.folder);
    assert.equal(one.length, 1);
    assert.equal(two.length, 1, "002's task spawned once");
    assert.ok(two[0].start >= one[0].end, "002 spawned after 001's task ended");
    assert.equal(
      two[0].folderPath.includes(path.join('.stacked', TWO.folder)),
      false,
      '002 never ran in its stacked tree',
    );
    assert.equal(adapter.maxConcurrent, 1);
  });

  it('starts nothing while a pause is active', async () => {
    const project = await makeProject([ONE, TWO], 3);
    const oneWorktree = await approveIntoWorktree(project, ONE.folder);
    await approveIntoWorktree(project, TWO.folder);
    const paused = await activeChange(project, ONE.folder);
    assert.equal(paused.folderPath.startsWith(oneWorktree), true);
    await writeUsagePause(paused.folderPath, {
      task: '1',
      until: new Date(Date.now() + 3_600_000).toISOString(),
      source: 'harness',
    });

    const adapter = new LaneAdapter({ holdMs: 20 });
    const summary = await runWatcherCycle(project.repo, project.config, adapter);

    assert.equal(summary.tasksRun, 0);
    assert.deepEqual(adapter.spawns, []);
  });
});

describe('Running lanes outlive a cycle and delay stopping', () => {
  it('spawns the second change while the first lane runs', async () => {
    const project = await makeProject([ONE, TWO], 2);
    await approveIntoWorktree(project, ONE.folder);
    await approveIntoWorktree(project, TWO.folder);

    const controller = new AbortController();
    const adapter = new LaneAdapter({
      holdMs: 1000,
      onSpawn: () => {
        if (adapter.spawns.length === 2) controller.abort();
      },
    });

    try {
      await startWatcher(project.repo, project.config, adapter, {
        signal: controller.signal,
        pollIntervalMs: 5,
      });
    } finally {
      controller.abort();
    }

    const one = spawnedIn(adapter, ONE.folder);
    const two = spawnedIn(adapter, TWO.folder);
    assert.equal(one.length, 1, "the first change's task spawned once");
    assert.equal(two.length, 1);
    assert.ok(two[0].start >= one[0].start);
    assert.ok(one[0].end >= two[0].start, 'the second spawned while the first ran');
  });

  it('a new build waits for running lanes', async () => {
    const project = await makeProject([ONE, TWO], 2);
    await approveIntoWorktree(project, ONE.folder);
    await approveIntoWorktree(project, TWO.folder);

    const controller = new AbortController();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const adapter = new LaneAdapter({ gate });
    let markThrew: () => void = () => {};
    const threw = new Promise<void>((resolve) => {
      markThrew = resolve;
    });
    let threwOnce = false;
    const exits: number[] = [];
    let exitedAt = 0;

    const buildCheck = async (): Promise<string | null> => {
      if (adapter.spawns.length === 0) return null;
      if (!threwOnce) {
        threwOnce = true;
        markThrew();
      }
      throw new BuildChangedError('a settled new osq build replaced the running one');
    };

    try {
      const watcher = startWatcher(project.repo, project.config, adapter, {
        signal: controller.signal,
        pollIntervalMs: 5,
        buildCheck,
        exit: (code) => {
          exits.push(code);
          exitedAt = Date.now();
        },
      });

      await threw;
      const atThrow = adapter.spawns.length;
      assert.ok(atThrow >= 1);
      await delay(30);
      assert.deepEqual(exits, [], 'exit waits while the lanes run');
      assert.equal(adapter.spawns.length, atThrow, 'no spawn started after the check threw');

      release();
      await watcher;
    } finally {
      release();
      controller.abort();
    }

    assert.deepEqual(exits, [75]);
    assert.equal(adapter.spawns.length, 2);
    const lastEnd = Math.max(...adapter.spawns.map((record) => record.end));
    assert.ok(exitedAt >= lastEnd, 'exit ran only after every spawned task ended');
  });

  it('abort waits for running lanes and starts none', async () => {
    const project = await makeProject([ONE, TWO], 1);
    await approveIntoWorktree(project, ONE.folder);
    await approveIntoWorktree(project, TWO.folder);

    const controller = new AbortController();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let markSpawned: () => void = () => {};
    const spawned = new Promise<void>((resolve) => {
      markSpawned = resolve;
    });
    const adapter = new LaneAdapter({ gate, onSpawn: () => markSpawned() });

    try {
      let resolvedAt = 0;
      const watcher = startWatcher(project.repo, project.config, adapter, {
        signal: controller.signal,
        pollIntervalMs: 5,
      }).then(() => {
        resolvedAt = Date.now();
      });

      await spawned;
      controller.abort();
      const abortedAt = Date.now();
      await delay(30);
      assert.equal(resolvedAt, 0, 'the watcher promise waits for the running lane');

      release();
      await watcher;

      assert.equal(adapter.spawns.length, 1, 'no task spawned after the abort');
      const only = adapter.spawns[0];
      assert.ok(only.end >= abortedAt);
      assert.ok(resolvedAt >= only.end, 'the promise resolved after the task ended');
    } finally {
      release();
      controller.abort();
    }
  });
});
