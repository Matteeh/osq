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

/** A first run that prints `first` and fails, then a run that prints `second` and passes. */
const PASS_ON_SECOND = `const fs = require('node:fs');
const path = require('node:path');
const marker = path.join(__dirname, 'runs');
const runs = fs.existsSync(marker) ? Number(fs.readFileSync(marker, 'utf8')) : 0;
const next = runs + 1;
fs.writeFileSync(marker, String(next));
if (next === 1) {
  process.stdout.write('first\\n');
  process.exit(1);
}
process.stdout.write('second\\n');
`;

/** Both runs print a numbered line and fail. */
const RED_BOTH = `const fs = require('node:fs');
const path = require('node:path');
const marker = path.join(__dirname, 'runs');
const runs = fs.existsSync(marker) ? Number(fs.readFileSync(marker, 'utf8')) : 0;
const next = runs + 1;
fs.writeFileSync(marker, String(next));
process.stdout.write('run ' + next + '\\n');
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

/** Commit one file on the checkout's current (default) branch. */
async function landOnMain(root: string, file: string, content: string): Promise<string> {
  await write(root, file, content);
  await git(['add', '--', file], root);
  await git(['commit', '-qm', `land ${file}`], root);
  return git(['rev-parse', 'HEAD'], root);
}

/** The number of runs the verify script recorded in its marker. */
async function runsOf(marker: string): Promise<number> {
  const text = await fs.readFile(marker, 'utf8').catch(() => '0');
  return Number(text);
}

interface Scenario {
  readonly parent: string;
  readonly root: string;
  readonly worktree: string;
  readonly config: OsqConfig;
  readonly change: LocatedChange;
  readonly marker: string;
}

/**
 * Build a repository whose default branch holds `orders`, with a branch
 * `osq/002-two-words` cut from it in a linked worktree. The branch commit
 * holds the archived change folder, its `.run/base`, and the living spec with
 * the delta applied. The proposal's verify is `script`, whose marker sits in
 * `parent`, outside the worktree.
 */
async function setup(script: string): Promise<Scenario> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcssync-twice-'));
  tmpDirs.push(parent);
  const marker = path.join(parent, 'runs');
  await write(parent, 'verify-twice.cjs', script);
  const root = path.join(parent, 'repo');
  await fs.mkdir(root);
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await write(root, ORDERS, ORDERS_SPEC);
  await write(root, 'src/app.txt', 'base\n');
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'init'], root);
  const base = await git(['rev-parse', 'HEAD'], root);

  await git(['branch', BRANCH], root);
  const worktree = path.join(parent, 'worktree');
  await git(['worktree', 'add', worktree, BRANCH], root);
  const proposal = `---
title: Two words
verify: node ${path.join(parent, 'verify-twice.cjs')}
---

## Goal

Do two words.
`;
  await write(worktree, `${ARCHIVE}/proposal.md`, proposal);
  await write(worktree, `${ARCHIVE}/.run/base`, `${base}\n`);
  await write(worktree, `${ARCHIVE}/specs/orders/spec.md`, ADD_002);
  await write(worktree, ORDERS, mergeDelta(ORDERS_SPEC, 'orders', parseDelta(ADD_002)));
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
  return { parent, root, worktree, config, change: located, marker };
}

interface RecordedEvent {
  readonly type: string;
  readonly data: Record<string, unknown>;
}

/** Parse the archived change's event stream in the worktree. */
async function eventsOf(worktree: string): Promise<RecordedEvent[]> {
  const content = await fs.readFile(
    path.join(worktree, ARCHIVE, '.run', 'events', 'change.jsonl'),
    'utf8',
  );
  return content
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as RecordedEvent);
}

describe('sync verify retries once', () => {
  it('commits and records both runs when verify passes on its second run', async () => {
    const { root, config, change, worktree, marker } = await setup(PASS_ON_SECOND);
    await landOnMain(root, 'other.txt', 'moved\n');

    const result = await syncWithDefaultBranch(root, config, change);

    assert.deepEqual(result, { merged: true });
    assert.equal(await runsOf(marker), 2);
    const events = await eventsOf(worktree);
    const verifyRuns = events.filter((event) => event.type === 'verify_ran');
    assert.equal(verifyRuns.length, 2);
    const [failed, passed] = verifyRuns;
    assert.ok(failed && passed);
    assert.notEqual(failed.data.exitCode, 0);
    assert.match(String(failed.data.output), /first/);
    assert.equal(passed.data.exitCode, 0);
    assert.match(String(passed.data.output), /second/);
    assert.equal(typeof failed.data.log, 'string');
    assert.equal(typeof passed.data.log, 'string');
    assert.notEqual(failed.data.log, passed.data.log);
    assert.equal(events.at(-1)?.type, 'synced');
    assert.equal(await git(['log', '-1', '--format=%s'], worktree), 'osq: 002 sync main');
    assert.deepEqual(await statusOf(worktree), []);
  });

  it('stops with the second run when verify is red on both runs', async () => {
    const { root, config, change, worktree, marker } = await setup(RED_BOTH);
    const before = await headOf(worktree);
    await landOnMain(root, 'other.txt', 'moved\n');

    await assert.rejects(
      () => syncWithDefaultBranch(root, config, change),
      (error: unknown) => {
        assert.ok(error instanceof SyncStop);
        assert.equal(error.reason, 'sync_verify_red');
        assert.match(error.message, /run 2/);
        assert.doesNotMatch(error.message, /run 1/);
        return true;
      },
    );

    assert.equal(await runsOf(marker), 2);
    assert.equal(await headOf(worktree), before);
    assert.deepEqual(await statusOf(worktree), []);
  });
});
