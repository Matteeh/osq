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
import type { VcsMovedField } from '../src/core/vcs/snapshot.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { formatVcsViolationWarning } from '../src/watcher/git-guard.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const GIT_AUTHOR = ['-c', 'user.name=osq', '-c', 'user.email=osq@example.invalid'];
const CHANGE_FOLDER = '001-worktree-guard';
const IN_SCOPE = 'src/in-scope.txt';
const OUT_SCOPE = 'src/out.txt';
const EXTRA = 'extra.txt';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
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

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync('git', args, { cwd, env: cleanGitEnv() });
}

function proposal(): string {
  return `---
title: Worktree guard
depends_on: []
verify: node pass.cjs
features:
  reads: []
---
## Goal

Kill a worktree task that breaks the git guard.

## Surface

None.

## Human steps

None
`;
}

function taskMarkdown(): string {
  return [
    '---',
    'title: When the agent acts in a worktree, the guard kills',
    'verify: node pass.cjs',
    `scope: ${JSON.stringify([IN_SCOPE])}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] the guard kills the act',
    '',
  ].join('\n');
}

const TASKS_MD = '# Tasks\n\n- [ ] 1. When the agent acts in a worktree, the guard kills\n';

/** A committed temporary repository whose only differences are the agent's edits. */
async function seedRepo(repo: string): Promise<void> {
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'pass.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, IN_SCOPE), 'alpha\n', 'utf8');
  await fs.writeFile(path.join(repo, OUT_SCOPE), 'bravo\n', 'utf8');
  await fs.writeFile(path.join(repo, EXTRA), 'charlie\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);
}

/** Write the change folder into the checkout, before approval. */
async function writeChange(repo: string): Promise<string> {
  const folder = path.join(repo, 'openspec', 'changes', CHANGE_FOLDER);
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), proposal(), 'utf8');
  await fs.writeFile(path.join(folder, 'tasks.md'), TASKS_MD, 'utf8');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), taskMarkdown(), 'utf8');
  return folder;
}

interface Project {
  readonly repo: string;
  /** The root `runTask` receives: the worktree, or the checkout when vcs is off. */
  readonly root: string;
  /** The change folder `runTask` receives, in the same tree as `root`. */
  readonly specFolder: string;
  readonly config: OsqConfig;
}

function guardConfig(vcs?: VcsConfig): OsqConfig {
  return defineConfig({
    ...(vcs ? { vcs } : {}),
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
  });
}

/** A committed temp repository with one change approved into a linked worktree. */
async function makeWorktreeProject(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-worktree-guard-'));
  roots.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await seedRepo(repo);
  const checkoutFolder = await writeChange(repo);
  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = guardConfig(vcs);
  const result = await approveSpec(repo, '001', config);
  const worktree = result.worktreePath;
  assert.ok(worktree, 'approval created a worktree');
  const specFolder = path.join(worktree, path.relative(repo, checkoutFolder));
  return { repo, root: worktree, specFolder, config };
}

/** A committed temp repository with one change approved in place. */
async function makeCheckoutProject(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-worktree-guard-'));
  roots.push(root);
  const repo = path.join(root, 'repo');
  await seedRepo(repo);
  const checkoutFolder = await writeChange(repo);
  const config = guardConfig();
  await approveSpec(repo, '001', config);
  return { repo, root: repo, specFolder: checkoutFolder, config };
}

/** Fake adapter whose spawn performs the scenario's git or file edit, then writes a result. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';

  constructor(private readonly act: (root: string) => Promise<void>) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await this.act(options.projectRoot);
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

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

async function readEvents(specFolder: string, task = '1'): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(specFolder, '.run', 'events', `${task}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as ParsedEvent);
}

async function readDeadMarker(specFolder: string, task = '1'): Promise<string> {
  return fs.readFile(path.join(specFolder, '.run', 'dead', `${task}.md`), 'utf8');
}

function scopeFiles(events: readonly ParsedEvent[]): string[] {
  const violation = events.find((event) => event.type === 'scope_violation');
  return violation ? ((violation.data?.files as string[]) ?? []) : [];
}

function movedOf(events: readonly ParsedEvent[]): string[] {
  const violation = events.find((event) => event.type === 'vcs_violation');
  assert.ok(violation, 'a vcs_violation event is recorded');
  return (violation.data?.moved as string[]) ?? [];
}

describe('Violations kill in a worktree', () => {
  it('kills a worktree task that edits outside its scope before verify', async () => {
    const project = await makeWorktreeProject();
    const adapter = new ActingAdapter(async (root) => {
      await fs.writeFile(path.join(root, OUT_SCOPE), 'bravo changed\n', 'utf8');
    });

    const result = await runTask(project.root, project.specFolder, '1', project.config, adapter);

    assert.equal(result.success, false);
    assert.equal(result.reason, 'scope_violation');
    const marker = await readDeadMarker(project.specFolder);
    assert.match(marker, /reason: scope_violation/);
    assert.match(marker, new RegExp(OUT_SCOPE));
    const events = await readEvents(project.specFolder);
    const violationIndex = events.findIndex((event) => event.type === 'scope_violation');
    assert.ok(violationIndex >= 0, 'the scope violation is recorded');
    assert.equal(
      events.slice(violationIndex + 1).some((event) => event.type === 'verify_ran'),
      false,
      'verify does not run after the violation',
    );
  });

  it('kills a worktree task that commits, with the warning as its marker body', async () => {
    const project = await makeWorktreeProject();
    const adapter = new ActingAdapter(async (root) => {
      await fs.writeFile(path.join(root, IN_SCOPE), 'alpha changed\n', 'utf8');
      await git(['add', IN_SCOPE], root);
      await git([...GIT_AUTHOR, 'commit', '-qm', 'agent commit'], root);
    });

    const result = await runTask(project.root, project.specFolder, '1', project.config, adapter);

    assert.equal(result.success, false);
    assert.equal(result.reason, 'vcs_violation');
    const events = await readEvents(project.specFolder);
    const moved = movedOf(events);
    assert.ok(moved.includes('head'), 'HEAD moved');
    const marker = await readDeadMarker(project.specFolder);
    assert.match(marker, /reason: vcs_violation/);
    assert.ok(marker.includes(formatVcsViolationWarning(moved as VcsMovedField[])));
  });

  it('records the same edit in the checkout and still lands the task', async () => {
    const project = await makeCheckoutProject();
    const adapter = new ActingAdapter(async (root) => {
      await fs.writeFile(path.join(root, OUT_SCOPE), 'bravo changed\n', 'utf8');
    });

    const result = await runTask(project.root, project.specFolder, '1', project.config, adapter);

    assert.equal(result.success, true);
    const events = await readEvents(project.specFolder);
    assert.deepEqual(scopeFiles(events), [OUT_SCOPE]);
    assert.ok(events.some((event) => event.type === 'done'));
  });
});

describe('New test file', () => {
  it('does not record a scope violation in a worktree', async () => {
    const project = await makeWorktreeProject();
    const adapter = new ActingAdapter(async (root) => {
      await fs.mkdir(path.join(root, 'tests'), { recursive: true });
      await fs.writeFile(path.join(root, 'tests', 'extra.test.ts'), 'export {};\n', 'utf8');
    });

    const result = await runTask(project.root, project.specFolder, '1', project.config, adapter);

    assert.equal(result.success, true);
    const events = await readEvents(project.specFolder);
    assert.equal(scopeFiles(events).length, 0);
    assert.ok(events.some((event) => event.type === 'done'));
  });

  it('does not record a scope violation in the checkout', async () => {
    const project = await makeCheckoutProject();
    const adapter = new ActingAdapter(async (root) => {
      await fs.mkdir(path.join(root, 'tests'), { recursive: true });
      await fs.writeFile(path.join(root, 'tests', 'extra.test.ts'), 'export {};\n', 'utf8');
    });

    const result = await runTask(project.root, project.specFolder, '1', project.config, adapter);

    assert.equal(result.success, true);
    const events = await readEvents(project.specFolder);
    assert.equal(scopeFiles(events).length, 0);
    assert.ok(events.some((event) => event.type === 'done'));
  });
});

describe('Both violations', () => {
  it('records both and dies with vcs_violation', async () => {
    const project = await makeWorktreeProject();
    const adapter = new ActingAdapter(async (root) => {
      await fs.writeFile(path.join(root, OUT_SCOPE), 'bravo changed\n', 'utf8');
      await git(['add', OUT_SCOPE], root);
      await git([...GIT_AUTHOR, 'commit', '-qm', 'agent commit'], root);
      await fs.writeFile(path.join(root, EXTRA), 'charlie changed\n', 'utf8');
    });

    const result = await runTask(project.root, project.specFolder, '1', project.config, adapter);

    assert.equal(result.success, false);
    assert.equal(result.reason, 'vcs_violation');
    const events = await readEvents(project.specFolder);
    assert.ok(events.some((event) => event.type === 'vcs_violation'));
    assert.deepEqual(scopeFiles(events), [EXTRA]);
    const marker = await readDeadMarker(project.specFolder);
    assert.match(marker, /reason: vcs_violation/);
  });
});
