import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { type LocatedChange, listChanges } from '../src/core/status/change-locations.js';
import { syncWithDefaultBranch } from '../src/core/vcs/sync-main.js';

const execFileAsync = promisify(execFile);
const GIT_AUTHOR = 'Osq Author <author@example.invalid>';
const FOLDER = '002-two-words';
const BRANCH = `osq/${FOLDER}`;
const ORDER_SPEC = 'openspec/specs/orders/spec.md';
const CHANGE = `openspec/changes/${FOLDER}`;

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

const PRINT_100 = "for (let i = 1; i <= 100; i += 1) console.log('line ' + i);\n";

const TASK = `---
title: Task 1
verify: node verify.cjs
---

## Acceptance

- [ ] Task 1 works
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

async function landOnMain(root: string, file: string, content: string): Promise<string> {
  await write(root, file, content);
  await git(['add', '--', file], root);
  await git(['commit', '-qm', `land ${file}`], root);
  return git(['rev-parse', 'HEAD'], root);
}

function numbered(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index + 1}`).join('\n');
}

interface Scenario {
  readonly root: string;
  readonly worktree: string;
  readonly config: OsqConfig;
  readonly change: LocatedChange;
}

/** An active `002` branch with done task 1 whose verify prints 100 lines. */
async function setup(): Promise<Scenario> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-verify-log-sync-'));
  tmpDirs.push(parent);
  const root = path.join(parent, 'repo');
  await fs.mkdir(root);
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await write(root, ORDER_SPEC, ORDERS_SPEC);
  await write(root, 'src/app.txt', 'base\n');
  await write(root, 'verify.cjs', PRINT_100);
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'init'], root);
  const base = await git(['rev-parse', 'HEAD'], root);

  await git(['branch', BRANCH], root);
  const worktree = path.join(parent, 'worktree');
  await git(['worktree', 'add', worktree, BRANCH], root);
  await write(worktree, `${CHANGE}/proposal.md`, PROPOSAL);
  await write(worktree, `${CHANGE}/.run/approved`, 'approved\n');
  await write(worktree, `${CHANGE}/.run/base`, `${base}\n`);
  await write(worktree, `${CHANGE}/specs/orders/spec.md`, ADD_002);
  await write(worktree, `${CHANGE}/tasks/1.md`, TASK);
  await write(worktree, `${CHANGE}/.run/done/1`, 'done\n');
  await git(['add', '-A'], worktree);
  await git(['commit', '-qm', 'active 002'], worktree);

  const config: OsqConfig = {
    ...DEFAULT_CONFIG,
    vcs: {
      enabled: true,
      author: GIT_AUTHOR,
      worktreeRoot: path.join(parent, 'worktrees'),
    },
  };
  const change = (await listChanges(root, config, ['active'])).find(
    (entry) => entry.folderName === FOLDER,
  );
  assert.ok(change, 'the active change should be located in its worktree');
  return { root, worktree, config, change };
}

describe('sync verify log', () => {
  it('covers "Sync verify log": log holds all lines, the event keeps the tail, no log is committed', async () => {
    const { root, worktree, config, change } = await setup();
    await landOnMain(root, 'src/other.txt', 'other\n');

    const result = await syncWithDefaultBranch(root, config, change);

    assert.deepEqual(result, { merged: true });
    const eventsPath = path.join(worktree, CHANGE, '.run', 'events', 'change.jsonl');
    const events = (await fs.readFile(eventsPath, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { type: string; data: Record<string, unknown> });
    const verify = events.find((event) => event.type === 'verify_ran');
    assert.ok(verify, 'the sync should append a verify_ran event');
    assert.equal(verify.data.task, '1');
    assert.equal(verify.data.exitCode, 0);
    assert.equal(verify.data.log, '.run/logs/change-1.log');
    assert.equal(verify.data.output, numbered(100).split('\n').slice(60).join('\n'));

    const log = await fs.readFile(path.join(worktree, CHANGE, '.run/logs/change-1.log'), 'utf8');
    assert.equal(log.trimEnd().split('\n').length, 100);
    assert.match(log, /line 1\n/);
    assert.match(log, /line 100/);

    const committed = await git(['show', '--pretty=format:', '--name-only', 'HEAD'], worktree);
    assert.ok(
      !committed.split('\n').some((line) => line.includes('.run/logs/')),
      'the sync commit holds no file under .run/logs/',
    );
  });
});
