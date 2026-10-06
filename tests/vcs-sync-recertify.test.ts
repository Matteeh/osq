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
import { computeTaskScopeHash } from '../src/core/run/scope-hash.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';
import { type LocatedChange, listChanges } from '../src/core/status/change-locations.js';
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
const A = 'src/a.txt';
const B = 'src/b.txt';
const OUTSIDE = 'src/other.txt';

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

const PROPOSAL = `---
title: Two words
verify: node verify.cjs
---

## Goal

Do two words.
`;

const VERIFY_CJS = 'process.exit(0);\n';

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

/** Write an executable hook into a repository's shared hooks directory. */
async function writeHook(root: string, name: string, body: string): Promise<void> {
  const dir = path.resolve(root, await git(['rev-parse', '--git-path', 'hooks'], root));
  const file = path.join(dir, name);
  await fs.writeFile(file, `#!/bin/sh\n${body}\n`, 'utf8');
  await fs.chmod(file, 0o755);
}

/** Commit one file on the checkout's current (default) branch. */
async function landOnMain(root: string, file: string, content: string): Promise<void> {
  await write(root, file, content);
  await git(['add', '--', file], root);
  await git(['commit', '-qm', `land ${file}`], root);
}

function configFor(parent: string): OsqConfig {
  return {
    ...DEFAULT_CONFIG,
    vcs: {
      enabled: true,
      author: GIT_AUTHOR,
      worktreeRoot: path.join(parent, 'worktrees'),
    },
  };
}

/** A repository on `main` with the shared fixtures committed. */
async function initRepo(): Promise<{ parent: string; root: string; base: string }> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcsrecert-'));
  tmpDirs.push(parent);
  const root = path.join(parent, 'repo');
  await fs.mkdir(root);
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await write(root, ORDERS, ORDERS_SPEC);
  await write(root, A, 'base a\n');
  await write(root, B, 'base b\n');
  await write(root, OUTSIDE, 'base other\n');
  await write(root, 'verify.cjs', VERIFY_CJS);
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'init'], root);
  return { parent, root, base: await git(['rev-parse', 'HEAD'], root) };
}

function taskMd(number: string, scope: readonly string[]): string {
  return `---\ntitle: Task ${number}\nverify: node verify.cjs\nscope: ${JSON.stringify(scope)}\n---\n\n## Acceptance\n\n- [ ] Task ${number} works\n`;
}

/** Commit everything on the change's branch. */
async function commitBranch(worktree: string): Promise<void> {
  await git(['add', '-A'], worktree);
  await git(['commit', '-qm', 'branch work'], worktree);
}

/** Add an active `002` on `osq/002-two-words` cut from `base`. */
async function addActive002(
  root: string,
  parent: string,
  base: string,
  scope: readonly string[],
): Promise<string> {
  await git(['branch', BRANCH], root);
  const worktree = path.join(parent, 'wt002');
  await git(['worktree', 'add', worktree, BRANCH], root);
  const folder = `openspec/changes/${FOLDER}`;
  await write(worktree, `${folder}/proposal.md`, PROPOSAL);
  await write(worktree, `${folder}/.run/approved`, 'approved\n');
  await write(worktree, `${folder}/.run/base`, `${base}\n`);
  await write(worktree, `${folder}/specs/orders/spec.md`, ADD_002);
  await write(worktree, `${folder}/tasks/1.md`, taskMd('1', scope));
  await commitBranch(worktree);
  return worktree;
}

/** Write task 1's done marker from the tree's real scope hash and commit it. */
async function markDone(worktree: string, scope: readonly string[]): Promise<void> {
  const folder = `openspec/changes/${FOLDER}`;
  const current = await computeTaskScopeHash(worktree, [...scope]);
  const front = `---\nscope_resolver: 2\nscope_hash: "${current.hash}"\nscope_files: ${JSON.stringify(current.fileHashes)}\n---\n`;
  await write(worktree, `${folder}/.run/done/1`, `${front}done\n`);
  await write(worktree, `${folder}/.run/events/1.jsonl`, '{"type":"seed"}\n');
  await commitBranch(worktree);
}

function changeFolder(worktree: string): string {
  return path.join(worktree, `openspec/changes/${FOLDER}`);
}

async function readMarker(worktree: string): Promise<string> {
  return fs.readFile(path.join(changeFolder(worktree), '.run', 'done', '1'), 'utf8');
}

async function readTaskEvents(worktree: string): Promise<string> {
  return fs.readFile(path.join(changeFolder(worktree), '.run', 'events', '1.jsonl'), 'utf8');
}

async function findActive(root: string, config: OsqConfig): Promise<LocatedChange> {
  const found = (await listChanges(root, config, ['active'])).find(
    (change) => change.folderName === FOLDER,
  );
  assert.ok(found, 'the active change should be located in its worktree');
  return found;
}

function eventObjects(content: string): Array<{ type: string; data: Record<string, unknown> }> {
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as { type: string; data: Record<string, unknown> });
}

describe('syncWithDefaultBranch recertification', () => {
  it('recertifies a done task whose file only the merge changed', async () => {
    const { parent, root, base } = await initRepo();
    const config = configFor(parent);
    const worktree = await addActive002(root, parent, base, [A, B]);
    await markDone(worktree, [A, B]);
    await landOnMain(root, A, 'main changes a\n');
    const change = await findActive(root, config);

    await syncWithDefaultBranch(root, config, change);

    const current = await computeTaskScopeHash(worktree, [A, B]);
    const { data } = parseFrontmatter(await readMarker(worktree));
    assert.equal(data.scope_hash, current.hash);
    assert.equal(data.recertification_count, 1);
    assert.equal(data.scope_resolver, 2);
    const events = eventObjects(await readTaskEvents(worktree));
    const last = events.at(-1);
    assert.equal(last?.type, 'recertification');
    assert.equal(last?.data.automatic, true);
    assert.equal(last?.data.outcome, 'passed');
    assert.deepEqual(last?.data.differingPaths, [`${A} (modified)`]);
    assert.deepEqual(last?.data.attribution, [{ path: `${A} (modified)`, attribution: 'sync' }]);
    assert.equal(last?.data.recordedHash !== last?.data.currentHash, true);
    assert.equal(await git(['log', '-1', '--format=%s'], worktree), 'osq: 002 sync main');
    assert.equal(await git(['status', '--porcelain'], worktree), '');
  });

  it('leaves a task changed before the merge alone', async () => {
    const { parent, root, base } = await initRepo();
    const config = configFor(parent);
    const worktree = await addActive002(root, parent, base, [A, B]);
    await markDone(worktree, [A, B]);
    await write(worktree, A, 'branch changes a\n');
    await commitBranch(worktree);
    const beforeMarker = await readMarker(worktree);
    const beforeEvents = await readTaskEvents(worktree);
    await landOnMain(root, B, 'main changes b\n');
    const change = await findActive(root, config);

    await syncWithDefaultBranch(root, config, change);

    assert.equal(await readMarker(worktree), beforeMarker);
    assert.equal(await readTaskEvents(worktree), beforeEvents);
  });

  it('leaves a task alone when the merge changes no scoped file', async () => {
    const { parent, root, base } = await initRepo();
    const config = configFor(parent);
    const worktree = await addActive002(root, parent, base, [A, B]);
    await markDone(worktree, [A, B]);
    const beforeMarker = await readMarker(worktree);
    const beforeEvents = await readTaskEvents(worktree);
    await landOnMain(root, OUTSIDE, 'main changes other\n');
    const change = await findActive(root, config);

    await syncWithDefaultBranch(root, config, change);

    assert.equal(await readMarker(worktree), beforeMarker);
    assert.equal(await readTaskEvents(worktree), beforeEvents);
  });

  it('writes the done marker and task stream back when the sync commit fails', async () => {
    const { parent, root, base } = await initRepo();
    const config = configFor(parent);
    const worktree = await addActive002(root, parent, base, [A, B]);
    await markDone(worktree, [A, B]);
    const beforeMarker = await readMarker(worktree);
    const beforeEvents = await readTaskEvents(worktree);
    await landOnMain(root, A, 'main changes a\n');
    await writeHook(root, 'pre-commit', 'echo "blocked by hook"\nexit 1');
    const change = await findActive(root, config);

    await assert.rejects(
      () => syncWithDefaultBranch(root, config, change),
      (error: unknown) => {
        assert.ok(error instanceof SyncStop, 'the stop should be a SyncStop');
        assert.equal(error.reason, 'sync_failed');
        return true;
      },
    );
    assert.equal(await readMarker(worktree), beforeMarker);
    assert.equal(await readTaskEvents(worktree), beforeEvents);
  });
});

const WATCH_ID = '001-order-flow';
const WATCH_REL = path.posix.join('openspec', 'changes', WATCH_ID);
const ARCHIVE_REL = path.posix.join('openspec', 'changes', 'archive');
const WATCH_SCOPE = 'src/one.txt';
const APP_SCOPE = 'src/app-scope.txt';

interface WatchProject {
  readonly repo: string;
  readonly worktree: string;
  readonly config: OsqConfig;
}

/** Fake adapter whose spawn runs the scenario's action, then writes its result. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';

  constructor(private readonly act: (options: SpawnTaskOptions) => Promise<void>) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await this.act(options);
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(path.join(resultsDir, `${options.taskNumber}.md`), '# result\n', 'utf8');
    return { exitCode: 0 };
  }
}

function watchTaskMarkdown(): string {
  return [
    '---',
    'title: Only task',
    'verify: node verify.cjs',
    `scope: ${JSON.stringify([WATCH_SCOPE, APP_SCOPE])}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] does the thing',
    '',
  ].join('\n');
}

/** A committed temp repository with one change approved into a linked worktree. */
async function makeWatchProject(): Promise<WatchProject> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcsrecert-watch-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, WATCH_SCOPE), 'seed one\n', 'utf8');
  await fs.writeFile(path.join(repo, APP_SCOPE), 'app seed\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const folder = path.join(repo, WATCH_REL);
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(folder, 'proposal.md'),
    [
      '---',
      'title: Order Flow',
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
    ].join('\n'),
    'utf8',
  );
  await fs.writeFile(path.join(folder, 'tasks.md'), '# Tasks\n\n- [ ] 1. Only task\n', 'utf8');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), watchTaskMarkdown(), 'utf8');

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
  return { repo, worktree: result.worktreePath, config };
}

describe('sync recertification archives the change', () => {
  it('archives after the sync recertifies a done task', async () => {
    const project = await makeWatchProject();
    const adapter = new ActingAdapter(async (options) => {
      await fs.writeFile(path.join(options.projectRoot, WATCH_SCOPE), 'task 1\n', 'utf8');
      await write(project.repo, APP_SCOPE, 'main changes app scope\n');
      await git(['add', '--', APP_SCOPE], project.repo);
      await git(['commit', '-qm', 'main changes app scope'], project.repo);
    });

    await runWatcherCycle(project.repo, project.config, adapter);

    const archived = path.join(project.worktree, ARCHIVE_REL, WATCH_ID);
    assert.equal(await exists(archived), true);
    assert.equal(await exists(path.join(archived, '.run', 'regressed')), false);
    const marker = await fs.readFile(path.join(archived, '.run', 'done', '1'), 'utf8');
    const { data } = parseFrontmatter(marker);
    assert.equal(data.recertification_count, 1);
    const events = eventObjects(
      await fs.readFile(path.join(archived, '.run', 'events', '1.jsonl'), 'utf8'),
    );
    const recertification = events.find((event) => event.type === 'recertification');
    assert.equal(recertification?.data.automatic, true);
  });
});

async function exists(target: string): Promise<boolean> {
  return fs.access(target).then(
    () => true,
    () => false,
  );
}
