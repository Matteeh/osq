import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { mergeDelta, parseDelta } from '../src/core/spec/delta.js';
import { type LocatedChange, listChanges } from '../src/core/status/change-locations.js';
import { syncWithDefaultBranch } from '../src/core/vcs/sync-main.js';
import { SyncStop } from '../src/core/vcs/sync-stop.js';

const execFileAsync = promisify(execFile);
const GIT_AUTHOR = 'Osq Author <author@example.invalid>';
const FOLDER = '002-two-words';
const BRANCH = `osq/${FOLDER}`;
const ORDERS = 'openspec/specs/orders/spec.md';

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

const PROPOSAL = `---
title: Two words
verify: node verify.cjs
---

## Goal

Do two words.
`;

const VERIFY_CJS = `const fs = require('node:fs');
const path = require('node:path');
const marker = path.join(__dirname, 'openspec/changes/002-two-words/.run/verify-fail');
if (fs.existsSync(marker)) {
  process.stdout.write(fs.readFileSync(marker, 'utf8'));
  process.exit(1);
}
process.exit(0);
`;

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

async function headOf(dir: string): Promise<string> {
  return git(['rev-parse', 'HEAD'], dir);
}

/** Write an executable hook into a repository's shared hooks directory. */
async function writeHook(root: string, name: string, body: string): Promise<void> {
  const dir = path.resolve(root, await git(['rev-parse', '--git-path', 'hooks'], root));
  const file = path.join(dir, name);
  await fs.writeFile(file, `#!/bin/sh\n${body}\n`, 'utf8');
  await fs.chmod(file, 0o755);
}

/** Commit one file on the checkout's current (default) branch. */
async function landOnMain(root: string, file: string, content: string): Promise<string> {
  await write(root, file, content);
  await git(['add', '--', file], root);
  await git(['commit', '-qm', `land ${file}`], root);
  return git(['rev-parse', 'HEAD'], root);
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
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcssyncactive-'));
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
  return { parent, root, base: await git(['rev-parse', 'HEAD'], root) };
}

interface ActiveTask {
  readonly n: string;
  readonly done?: boolean;
  readonly manual?: boolean;
}

interface ActiveOptions {
  readonly tasks: readonly ActiveTask[];
  readonly branchFiles?: Readonly<Record<string, string>>;
  readonly verifyFail?: boolean;
  readonly uncommittedEvents?: string;
}

function taskMd(n: string): string {
  return `---\ntitle: Task ${n}\nverify: node verify.cjs\n---\n\n## Acceptance\n\n- [ ] Task ${n} works\n`;
}

/** Add an active `002` on `osq/002-two-words` cut from `base`. */
async function addActive002(
  root: string,
  parent: string,
  base: string,
  options: ActiveOptions,
): Promise<string> {
  await git(['branch', BRANCH], root);
  const worktree = path.join(parent, 'wt002');
  await git(['worktree', 'add', worktree, BRANCH], root);
  const folder = `openspec/changes/${FOLDER}`;
  await write(worktree, `${folder}/proposal.md`, PROPOSAL);
  await write(worktree, `${folder}/.run/approved`, 'approved\n');
  await write(worktree, `${folder}/.run/base`, `${base}\n`);
  await write(worktree, `${folder}/specs/orders/spec.md`, ADD_002);
  for (const task of options.tasks) {
    await write(worktree, `${folder}/tasks/${task.n}.md`, taskMd(task.n));
    if (task.done) {
      const marker = task.manual ? '---\nmanual: true\n---\n' : 'done\n';
      await write(worktree, `${folder}/.run/done/${task.n}`, marker);
    }
  }
  if (options.verifyFail) await write(worktree, `${folder}/.run/verify-fail`, 'broken\n');
  for (const [file, content] of Object.entries(options.branchFiles ?? {})) {
    await write(worktree, file, content);
  }
  await git(['add', '-A'], worktree);
  await git(['commit', '-qm', 'active 002'], worktree);
  if (options.uncommittedEvents !== undefined) {
    await write(worktree, `${folder}/.run/events/change.jsonl`, options.uncommittedEvents);
  }
  return worktree;
}

async function findActive(root: string, config: OsqConfig): Promise<LocatedChange> {
  const found = (await listChanges(root, config, ['active'])).find(
    (change) => change.folderName === FOLDER,
  );
  assert.ok(found, 'the active change should be located in its worktree');
  return found;
}

/** Parse a change stream into its event objects. */
function parseEvents(content: string): Array<{ type: string; data: Record<string, unknown> }> {
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as { type: string; data: Record<string, unknown> });
}

describe('syncWithDefaultBranch on an active change', () => {
  it('takes the default branch before the first task without running verify', async () => {
    const { parent, root, base } = await initRepo();
    const config = configFor(parent);
    const worktree = await addActive002(root, parent, base, { tasks: [{ n: '1' }] });
    const mainSpec = mergeDelta(ORDERS_SPEC, 'orders', parseDelta(ADD_001));
    await landOnMain(root, ORDERS, mainSpec);
    await landOnMain(root, 'src/other.txt', 'other\n');
    const change = await findActive(root, config);

    const lines: string[] = [];
    const result = await syncWithDefaultBranch(root, config, change, (line) => lines.push(line));

    assert.deepEqual(result, { merged: true });
    assert.equal(lines.length, 1);
    assert.match(lines[0] ?? '', /^main has 2 new commits; merging into osq\/002-two-words$/);
    assert.equal(await fs.readFile(path.join(worktree, ORDERS), 'utf8'), mainSpec);
    assert.equal(await fs.readFile(path.join(worktree, 'src/other.txt'), 'utf8'), 'other\n');
    assert.equal(await git(['log', '-1', '--format=%s'], worktree), 'osq: 002 sync main');
    const events = parseEvents(
      await fs.readFile(
        path.join(worktree, `openspec/changes/${FOLDER}/.run/events/change.jsonl`),
        'utf8',
      ),
    );
    assert.equal(events.at(-1)?.type, 'synced');
    assert.ok(!events.some((event) => event.type === 'verify_ran'));
  });

  it('re-runs the verify of each done non-manual task', async () => {
    const { parent, root, base } = await initRepo();
    const config = configFor(parent);
    const worktree = await addActive002(root, parent, base, {
      tasks: [{ n: '1', done: true }, { n: '2' }, { n: '3', done: true, manual: true }],
    });
    await landOnMain(root, 'src/other.txt', 'other\n');
    const change = await findActive(root, config);

    const lines: string[] = [];
    await syncWithDefaultBranch(root, config, change, (line) => lines.push(line));

    assert.match(lines[0] ?? '', / and re-running verify for tasks 1$/);
    const events = parseEvents(
      await fs.readFile(
        path.join(worktree, `openspec/changes/${FOLDER}/.run/events/change.jsonl`),
        'utf8',
      ),
    );
    const verify = events.find((event) => event.type === 'verify_ran');
    assert.equal(verify?.data.task, '1');
    assert.equal(verify?.data.exitCode, 0);
    assert.equal(events.at(-1)?.type, 'synced');
  });

  it('stops when a done task verify fails after the merge', async () => {
    const { parent, root, base } = await initRepo();
    const config = configFor(parent);
    const worktree = await addActive002(root, parent, base, {
      tasks: [{ n: '1', done: true }],
      verifyFail: true,
    });
    const before = await headOf(worktree);
    await landOnMain(root, 'src/other.txt', 'other\n');
    const change = await findActive(root, config);

    await assert.rejects(
      () => syncWithDefaultBranch(root, config, change),
      (error: unknown) => {
        assert.ok(error instanceof SyncStop, 'the stop should be a SyncStop');
        assert.equal(error.reason, 'sync_verify_red');
        assert.match(
          error.message,
          /^002-two-words: verify of task 1 failed on osq\/002-two-words merged with main:/,
        );
        assert.match(error.message, /broken/);
        return true;
      },
    );
    assert.equal(await headOf(worktree), before);
  });

  it('stops on a code conflict with a sync_conflict SyncStop', async () => {
    const { parent, root, base } = await initRepo();
    const config = configFor(parent);
    const worktree = await addActive002(root, parent, base, {
      tasks: [{ n: '1' }],
      branchFiles: { 'src/app.txt': 'branch\n' },
    });
    const before = await headOf(worktree);
    await landOnMain(root, 'src/app.txt', 'main\n');
    const change = await findActive(root, config);

    await assert.rejects(
      () => syncWithDefaultBranch(root, config, change),
      (error: unknown) => {
        assert.ok(error instanceof SyncStop, 'the stop should be a SyncStop');
        assert.equal(error.reason, 'sync_conflict');
        assert.match(error.message, /src\/app\.txt/);
        assert.match(
          error.message,
          /run osq plan 002, and approving the revised plan restarts osq\/002-two-words from main$/,
        );
        return true;
      },
    );
    assert.equal(await headOf(worktree), before);
  });

  it('keeps uncommitted events when the sync commit fails', async () => {
    const { parent, root, base } = await initRepo();
    const config = configFor(parent);
    const worktree = await addActive002(root, parent, base, {
      tasks: [{ n: '1', done: true }],
      uncommittedEvents: '{"type":"custom"}\n',
    });
    const before = await headOf(worktree);
    const eventsPath = path.join(worktree, `openspec/changes/${FOLDER}/.run/events/change.jsonl`);
    const beforeEvents = await fs.readFile(eventsPath, 'utf8');
    await landOnMain(root, 'src/other.txt', 'other\n');
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
    assert.equal(await headOf(worktree), before);
    assert.equal(await fs.readFile(eventsPath, 'utf8'), beforeEvents);
  });
});

describe('syncWithDefaultBranch on a stacked dependent', () => {
  it('takes a landed dependency archive from the default branch', async () => {
    const { parent, root, base } = await initRepo();
    void base;
    const config = configFor(parent);

    await git(['branch', 'osq/001-one-word'], root);
    const wt001 = path.join(parent, 'wt001');
    await git(['worktree', 'add', wt001, 'osq/001-one-word'], root);
    const archive001 = 'openspec/changes/archive/001-one-word/.run/events/change.jsonl';
    await write(wt001, archive001, '{"type":"archived"}\n');
    await git(['add', '-A'], wt001);
    await git(['commit', '-qm', '001 archive'], wt001);
    const archiveCommit = await git(['rev-parse', 'HEAD'], wt001);

    await git(['branch', BRANCH, archiveCommit], root);
    const wt002 = path.join(parent, 'wt002');
    await git(['worktree', 'add', wt002, BRANCH], root);
    const folder = `openspec/changes/${FOLDER}`;
    await write(wt002, `${folder}/proposal.md`, PROPOSAL);
    await write(wt002, `${folder}/.run/approved`, 'approved\n');
    await write(wt002, `${folder}/.run/base`, `${archiveCommit}\n`);
    await write(wt002, `${folder}/tasks/1.md`, taskMd('1'));
    await git(['add', '-A'], wt002);
    await git(['commit', '-qm', 'active 002'], wt002);

    await landOnMain(root, 'src/other.txt', 'other\n');

    await git(['merge', '-q', '--no-edit', 'main'], wt001);
    await fs.appendFile(path.join(wt001, archive001), '{"type":"synced"}\n', 'utf8');
    await git(['add', '-A'], wt001);
    await git(['commit', '-qm', '001 synced'], wt001);
    const tip001 = await git(['rev-parse', 'HEAD'], wt001);
    const mainTip = await git(['rev-parse', 'HEAD'], root);
    const landed = await git(
      ['commit-tree', `${tip001}^{tree}`, '-p', mainTip, '-m', 'osq: 001 land'],
      root,
    );
    await git(['merge', '--ff-only', landed], root);

    const change = await findActive(root, config);
    const result = await syncWithDefaultBranch(root, config, change);

    assert.deepEqual(result, { merged: true });
    assert.equal(await git(['log', '-1', '--format=%s'], wt002), 'osq: 002 sync main');
    const fromMain = await git(['show', `main:${archive001}`], root);
    const onBranch = await fs.readFile(path.join(wt002, archive001), 'utf8');
    assert.equal(onBranch.trim(), fromMain);
    assert.ok(!onBranch.includes('<<<<<<<'), 'the archive copy should hold no conflict marker');
  });
});
