import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { mergeDelta, parseDelta } from '../src/core/spec/delta.js';
import { type LocatedChange, listChanges } from '../src/core/status/change-locations.js';
import { getArchiveDir } from '../src/core/status/layout.js';
import { syncWithDefaultBranch } from '../src/core/vcs/sync-main.js';
import { SyncStop } from '../src/core/vcs/sync-stop.js';
import { checkAndArchiveSpec } from '../src/watcher/archiver.js';

const execFileAsync = promisify(execFile);
const GIT_AUTHOR = 'Osq Author <author@example.invalid>';
const FOLDER = '002-two-words';
const BRANCH = `osq/${FOLDER}`;
const ARCHIVE = `openspec/changes/archive/${FOLDER}`;
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

const ADD_ORDER = `# Spec Delta: orders

## Purpose

Adds a checked order.

## ADDED Requirements

### Requirement: Checked order
The system SHALL check orders.

#### Scenario: Check
- **WHEN** an order arrives
- **THEN** it is checked
`;

const PASS_SCRIPT = 'process.exit(0);\n';
const SMOKE_FAIL_SCRIPT = "console.log('smoke failed');\nprocess.exit(1);\n";
const ENV_SCRIPT =
  "console.log('OSQ_CHANGE=' + (process.env.OSQ_CHANGE ?? ''));\nprocess.exit(0);\n";

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

/** A proposal with an optional verify, check, and after-landing steps. */
function proposal(verify: string, check: string, afterLanding = 'None'): string {
  return [
    '---',
    'title: Change check',
    'depends_on: []',
    `verify: ${verify}`,
    `check: ${check}`,
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    'Exercise the change check.',
    '## Contract',
    '| Input | Expected Output |',
    '|---|---|',
    '| a | b |',
    '## Non-goals',
    'None.',
    '## Surface',
    'None.',
    '## Human steps',
    '### Before approval',
    'None',
    '### After landing',
    afterLanding,
    '## Delta',
    'None.',
  ].join('\n');
}

async function readEvents(eventsPath: string): Promise<ParsedEvent[]> {
  const raw = await fs.readFile(eventsPath, 'utf8').catch(() => '');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

describe('change check at archive', () => {
  let tmpDir: string;
  let folder: string;
  let archived: string;
  let livingSpec: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-change-check-archive-'));
    await scaffoldProject(tmpDir);
    folder = path.join(tmpDir, 'openspec', 'changes', '001-change-check');
    archived = path.join(
      getArchiveDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir),
      '001-change-check',
    );
    livingSpec = path.join(tmpDir, ORDERS);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  /** A done change with one delta and a hand-written approval seal. */
  async function writeDoneChange(check: string, afterLanding?: string): Promise<void> {
    await fs.mkdir(path.join(folder, '.run'), { recursive: true });
    await fs.mkdir(path.join(folder, 'specs', 'orders'), { recursive: true });
    await fs.mkdir(path.dirname(livingSpec), { recursive: true });
    await fs.writeFile(livingSpec, ORDERS_SPEC, 'utf8');
    await fs.writeFile(
      path.join(folder, 'proposal.md'),
      proposal('node verify.cjs', check, afterLanding),
      'utf8',
    );
    await fs.writeFile(path.join(folder, 'specs', 'orders', 'spec.md'), ADD_ORDER, 'utf8');
    await fs.writeFile(path.join(folder, '.run', 'approved'), 'sealed\n', 'utf8');
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), PASS_SCRIPT, 'utf8');
  }

  it('passes the check after the change-level verify and archives', async () => {
    await fs.writeFile(path.join(tmpDir, 'check.cjs'), PASS_SCRIPT, 'utf8');
    await writeDoneChange('node check.cjs');

    assert.equal(await checkAndArchiveSpec(tmpDir, folder, DEFAULT_CONFIG), true);

    assert.equal(await exists(folder), false);
    assert.equal(await exists(archived), true);
    const commands = (await readEvents(path.join(archived, '.run', 'events', 'change.jsonl')))
      .filter((event) => event.type === 'verify_ran')
      .map((event) => event.data?.command);
    assert.ok(commands.includes('node check.cjs'));
  });

  it('fails the check and leaves the change unarchived with a regression', async () => {
    await fs.writeFile(path.join(tmpDir, 'check.cjs'), SMOKE_FAIL_SCRIPT, 'utf8');
    await writeDoneChange('node check.cjs');

    assert.equal(await checkAndArchiveSpec(tmpDir, folder, DEFAULT_CONFIG), false);

    assert.equal(await exists(folder), true);
    assert.equal(await exists(archived), false);
    assert.equal(
      (await readEvents(path.join(folder, '.run', 'events', 'change.jsonl'))).some(
        (event) => event.type === 'archived',
      ),
      false,
    );

    const marker = await fs.readFile(path.join(folder, '.run', 'regressed', 'change.md'), 'utf8');
    assert.match(marker, /reason: verify_red/);
    assert.match(marker, /command: "node check\.cjs"/);
    assert.match(marker, /smoke failed/);

    // The living spec is exactly what it was before archive began.
    assert.equal(await fs.readFile(livingSpec, 'utf8'), ORDERS_SPEC);
  });

  it('writes only the archive path on an archived event with after-landing steps', async () => {
    await fs.writeFile(path.join(tmpDir, 'check.cjs'), PASS_SCRIPT, 'utf8');
    await writeDoneChange('node check.cjs', '- run the smoke test by hand');

    assert.equal(await checkAndArchiveSpec(tmpDir, folder, DEFAULT_CONFIG), true);

    const archivedEvent = (
      await readEvents(path.join(archived, '.run', 'events', 'change.jsonl'))
    ).find((event) => event.type === 'archived');
    assert.deepEqual(archivedEvent?.data, {
      archivePath: 'openspec/changes/archive/001-change-check',
    });
  });
});

const VERIFY_CJS = 'process.exit(0);\n';
const PROPOSAL = `---
title: Two words
verify: node verify.cjs
check: node check.cjs
---

## Goal

Do two words.
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

/** Commit one file on the checkout's default branch so the sync has work. */
async function landOnMain(root: string, file: string, content: string): Promise<void> {
  await write(root, file, content);
  await git(['add', '--', file], root);
  await git(['commit', '-qm', `land ${file}`], root);
}

interface Scenario {
  readonly root: string;
  readonly worktree: string;
  readonly config: OsqConfig;
  readonly change: LocatedChange;
}

/**
 * Build a repository whose default branch holds `orders`, with a branch
 * `osq/002-two-words` cut from it in a linked worktree. The branch commit
 * holds the archived change folder, its `.run/base`, the applied living spec,
 * and the proposal's check command `node check.cjs`.
 */
async function setup(checkScript: string): Promise<Scenario> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-change-check-sync-'));
  tmpDirs.push(parent);
  const root = path.join(parent, 'repo');
  await fs.mkdir(root);
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await write(root, ORDERS, ORDERS_SPEC);
  await write(root, 'verify.cjs', VERIFY_CJS);
  await write(root, 'check.cjs', checkScript);
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'init'], root);
  const base = await git(['rev-parse', 'HEAD'], root);

  await git(['branch', BRANCH], root);
  const worktree = path.join(parent, 'worktree');
  await git(['worktree', 'add', worktree, BRANCH], root);
  await write(worktree, `${ARCHIVE}/proposal.md`, PROPOSAL);
  await write(worktree, `${ARCHIVE}/.run/base`, `${base}\n`);
  await write(worktree, `${ARCHIVE}/specs/orders/spec.md`, ADD_ORDER);
  await write(worktree, ORDERS, mergeDelta(ORDERS_SPEC, 'orders', parseDelta(ADD_ORDER)));
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
  return { root, worktree, config, change: located };
}

describe('change check in a land sync', () => {
  it('stops on a red check after the merge without moving HEAD', async () => {
    const { root, config, change, worktree } = await setup(SMOKE_FAIL_SCRIPT);
    const before = await git(['rev-parse', 'HEAD'], worktree);
    await landOnMain(root, 'other.txt', 'moved\n');

    let stop: SyncStop | undefined;
    try {
      await syncWithDefaultBranch(root, config, change);
    } catch (error) {
      assert.ok(error instanceof SyncStop, 'sync should throw a SyncStop');
      stop = error;
    }
    assert.ok(stop, 'the red check should stop the sync');
    assert.equal(stop.reason, 'sync_verify_red');
    assert.match(
      stop.message,
      /002-two-words: check failed on osq\/002-two-words merged with main:/,
    );
    assert.match(stop.message, /smoke failed/);
    assert.equal(await git(['rev-parse', 'HEAD'], worktree), before);
  });

  it('records the check after the verify and before the synced event', async () => {
    const { root, config, change, worktree } = await setup(PASS_SCRIPT);
    await landOnMain(root, 'other.txt', 'moved\n');

    await syncWithDefaultBranch(root, config, change);

    const events = await readEvents(path.join(worktree, ARCHIVE, '.run', 'events', 'change.jsonl'));
    const tail = events.slice(-3).map((event) => ({
      type: event.type,
      command: event.data?.command,
    }));
    assert.deepEqual(tail, [
      { type: 'verify_ran', command: 'node verify.cjs' },
      { type: 'verify_ran', command: 'node check.cjs' },
      { type: 'synced', command: undefined },
    ]);
  });

  it('runs an archived check without the OSQ_CHANGE osq itself holds', async () => {
    const { root, config, change, worktree } = await setup(ENV_SCRIPT);
    await landOnMain(root, 'other.txt', 'moved\n');
    const previous = process.env.OSQ_CHANGE;
    process.env.OSQ_CHANGE = 'leaked-value';
    try {
      await syncWithDefaultBranch(root, config, change);
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(process.env, 'OSQ_CHANGE');
      } else {
        process.env.OSQ_CHANGE = previous;
      }
    }

    const events = await readEvents(path.join(worktree, ARCHIVE, '.run', 'events', 'change.jsonl'));
    const checkEvent = events.find((event) => event.data?.command === 'node check.cjs');
    assert.ok(checkEvent, 'the check should record a verify_ran event');
    const output = typeof checkEvent.data?.output === 'string' ? checkEvent.data.output : '';
    assert.match(output, /OSQ_CHANGE=\s*$/m);
    assert.ok(!output.includes('leaked-value'));
  });
});
