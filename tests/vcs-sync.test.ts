import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { mergeDelta, parseDelta } from '../src/core/spec/delta.js';
import { type LocatedChange, listChanges } from '../src/core/status/change-locations.js';
import { syncWithDefaultBranch } from '../src/core/vcs/sync-main.js';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const GIT_AUTHOR = 'Osq Author <author@example.invalid>';
const FOLDER = '002-two-words';
const BRANCH = `osq/${FOLDER}`;
const ORDERS = 'openspec/specs/orders/spec.md';
const ARCHIVE = `openspec/changes/archive/${FOLDER}`;

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
const marker = path.join(__dirname, 'openspec/changes/archive/${'002-two-words'}/.run/verify-fail');
if (fs.existsSync(marker)) {
  process.stdout.write(fs.readFileSync(marker, 'utf8'));
  process.exit(1);
}
process.exit(0);
`;

const PREPARE_CJS = `process.stdout.write('prepare-broke');
process.exit(1);
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

async function statusOf(dir: string): Promise<string[]> {
  const output = await git(['status', '--porcelain=v1', '--untracked-files=all'], dir);
  return output.split('\n').filter((line) => line.length > 0);
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

interface SetupOptions {
  readonly delta: string;
  readonly branchFiles?: Readonly<Record<string, string>>;
  readonly verifyFail?: boolean;
  readonly prepare?: string;
}

interface Scenario {
  readonly parent: string;
  readonly root: string;
  readonly worktree: string;
  readonly config: OsqConfig;
  readonly change: LocatedChange;
}

/**
 * Build a repository whose default branch holds `orders`, with a branch
 * `osq/002-two-words` cut from it in a linked worktree. The branch commit
 * holds the archived change folder, its `.run/base`, and the living spec with
 * the delta applied.
 */
async function setup(options: SetupOptions): Promise<Scenario> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcssync-'));
  tmpDirs.push(parent);
  const root = path.join(parent, 'repo');
  await fs.mkdir(root);
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await write(root, ORDERS, ORDERS_SPEC);
  await write(root, 'src/app.txt', 'base\n');
  await write(root, 'verify.cjs', VERIFY_CJS);
  await write(root, 'prepare.cjs', PREPARE_CJS);
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'init'], root);
  const base = await git(['rev-parse', 'HEAD'], root);

  await git(['branch', BRANCH], root);
  const worktree = path.join(parent, 'worktree');
  await git(['worktree', 'add', worktree, BRANCH], root);
  await write(worktree, `${ARCHIVE}/proposal.md`, PROPOSAL);
  await write(worktree, `${ARCHIVE}/.run/base`, `${base}\n`);
  await write(worktree, `${ARCHIVE}/specs/orders/spec.md`, options.delta);
  await write(worktree, ORDERS, mergeDelta(ORDERS_SPEC, 'orders', parseDelta(options.delta)));
  for (const [file, content] of Object.entries(options.branchFiles ?? {})) {
    await write(worktree, file, content);
  }
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
      ...(options.prepare !== undefined ? { prepare: options.prepare } : {}),
    },
  };
  const located = (await listChanges(root, config, ['archived'])).find(
    (entry) => entry.folderName === FOLDER,
  );
  assert.ok(located, 'setup should locate the archived change in its worktree');
  return { parent, root, worktree, config, change: located };
}

describe('syncWithDefaultBranch', () => {
  it('reports no merge when the default branch is already an ancestor', async () => {
    const { root, config, change, worktree } = await setup({ delta: ADD_002 });
    const before = await headOf(worktree);

    const result = await syncWithDefaultBranch(root, config, change);

    assert.deepEqual(result, { merged: false });
    assert.equal(await headOf(worktree), before);
    assert.deepEqual(await statusOf(worktree), []);
  });

  it('rebuilds the living spec from the default branch copy and the delta', async () => {
    const { root, config, change, worktree } = await setup({ delta: ADD_002 });
    const mainSpec = mergeDelta(ORDERS_SPEC, 'orders', parseDelta(ADD_001));
    const mainSha = await landOnMain(root, ORDERS, mainSpec);

    const result = await syncWithDefaultBranch(root, config, change);

    assert.deepEqual(result, { merged: true });
    const merged = await fs.readFile(path.join(worktree, ORDERS), 'utf8');
    assert.equal(merged, mergeDelta(mainSpec, 'orders', parseDelta(ADD_002)));
    assert.ok(merged.includes('Order 001'));
    assert.ok(merged.includes('Order 002'));
    assert.ok(!merged.includes('<<<<<<<'));
    assert.equal(await git(['log', '-1', '--format=%s'], worktree), 'osq: 002 sync main');
    const parents = (await git(['log', '-1', '--format=%P'], worktree)).split(' ');
    assert.equal(parents.length, 2);
    assert.ok(parents.includes(mainSha), 'the sync commit should merge the default branch');
    assert.deepEqual(await statusOf(worktree), []);
  });

  it('stops when the default branch changed a requirement the change rewrites', async () => {
    const { root, config, change, worktree } = await setup({ delta: MODIFY_002 });
    const before = await headOf(worktree);
    const landed = mergeDelta(ORDERS_SPEC, 'orders', parseDelta(LANDED_TOTALS));
    await landOnMain(root, ORDERS, landed);

    await assert.rejects(
      () => syncWithDefaultBranch(root, config, change),
      /002-two-words: main changed requirements this change rewrites since it was approved: orders: Order totals; reject the change and plan it again against main/,
    );

    assert.equal(await headOf(worktree), before);
    assert.deepEqual(await statusOf(worktree), []);
  });

  it('stops on a code conflict and leaves HEAD and status unchanged', async () => {
    const { root, config, change, worktree } = await setup({
      delta: ADD_002,
      branchFiles: { 'src/app.txt': 'branch\n' },
    });
    const before = await headOf(worktree);
    await landOnMain(root, 'src/app.txt', 'main\n');

    await assert.rejects(
      () => syncWithDefaultBranch(root, config, change),
      /002-two-words: src\/app\.txt conflict with main; merge it into osq\/002-two-words by hand in .*, then run osq land 002 again/,
    );

    assert.equal(await headOf(worktree), before);
    assert.deepEqual(await statusOf(worktree), []);
  });

  it('stops when the merged tree fails the proposal verify', async () => {
    const { root, config, change, worktree } = await setup({
      delta: ADD_002,
      verifyFail: true,
    });
    const before = await headOf(worktree);
    await landOnMain(root, 'other.txt', 'moved\n');

    await assert.rejects(
      () => syncWithDefaultBranch(root, config, change),
      /002-two-words: verify failed on osq\/002-two-words merged with main:\nbroken/,
    );

    assert.equal(await headOf(worktree), before);
    assert.deepEqual(await statusOf(worktree), []);
  });

  it('stops when vcs.prepare fails and leaves HEAD and status unchanged', async () => {
    const { root, config, change, worktree } = await setup({
      delta: ADD_002,
      prepare: 'node prepare.cjs',
    });
    const before = await headOf(worktree);
    await landOnMain(root, 'other.txt', 'moved\n');

    await assert.rejects(() => syncWithDefaultBranch(root, config, change), /prepare-broke/);

    assert.equal(await headOf(worktree), before);
    assert.deepEqual(await statusOf(worktree), []);
  });

  it('stops when a pre-commit hook rejects the sync commit', async () => {
    const { root, config, change, worktree } = await setup({ delta: ADD_002 });
    const before = await headOf(worktree);
    await landOnMain(root, 'other.txt', 'moved\n');
    await writeHook(root, 'pre-commit', 'echo "blocked by sync"\nexit 1');

    await assert.rejects(() => syncWithDefaultBranch(root, config, change), /blocked by sync/);

    assert.equal(await headOf(worktree), before);
    assert.deepEqual(await statusOf(worktree), []);
  });
});

describe('One merge for archive and sync', () => {
  it('uses applyOpenSpecDeltas in both archiver and sync-specs, defining neither', async () => {
    const archiver = await fs.readFile(path.join(ROOT, 'src', 'watcher', 'archiver.ts'), 'utf8');
    const syncSpecs = await fs.readFile(
      path.join(ROOT, 'src', 'core', 'vcs', 'sync-specs.ts'),
      'utf8',
    );

    assert.ok(
      archiver.includes("from '../core/spec/apply-deltas.js'"),
      'archiver must import applyOpenSpecDeltas from core',
    );
    assert.ok(
      archiver.includes('await applyOpenSpecDeltas(projectRoot, specFolderPath, config);'),
      'archiver must call the shared applyOpenSpecDeltas',
    );
    assert.ok(
      syncSpecs.includes("from '../spec/apply-deltas.js'"),
      'sync-specs must import applyOpenSpecDeltas from core',
    );
    assert.ok(
      syncSpecs.includes('await applyOpenSpecDeltas(worktreeRoot, changeFolderPath, config);'),
      'sync-specs must call the shared applyOpenSpecDeltas',
    );
    assert.ok(
      !archiver.includes('function applyOpenSpecDeltas'),
      'archiver must not define a merge',
    );
    assert.ok(
      !syncSpecs.includes('function applyOpenSpecDeltas'),
      'sync-specs must not define a merge',
    );
  });
});
