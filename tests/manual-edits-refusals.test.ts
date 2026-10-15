import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { CommandError } from '../src/cli/command-error.js';
import { landCommand } from '../src/cli/land.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGES = path.posix.join('openspec', 'changes');

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

async function writeAt(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

/** Rewrite a task's scope frontmatter to one exact path. */
async function setTaskScope(folderPath: string, scope: string): Promise<void> {
  const taskPath = path.join(folderPath, 'tasks', '1.md');
  const content = await fs.readFile(taskPath, 'utf8');
  await fs.writeFile(taskPath, content.replace(/^scope:.*$/m, `scope:\n  - ${scope}`), 'utf8');
}

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

/** Replace the seeded planning sentinel with a real local verifier. */
async function installLocalVerifier(root: string, folderPath: string): Promise<void> {
  await fs.writeFile(path.join(root, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  for (const rel of ['proposal.md', path.join('tasks', '1.md')]) {
    const target = path.join(folderPath, rel);
    const content = await fs.readFile(target, 'utf8').catch(() => null);
    if (content === null) continue;
    await fs.writeFile(
      target,
      content.replace(/^verify:.*$/m, `verify: ${PASSING_VERIFY}`),
      'utf8',
    );
  }
}

function makeVcsConfig(worktreeRoot: string, manualEdits?: 'keep' | 'block'): VcsConfig {
  return {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot,
    ...(manualEdits !== undefined ? { manualEdits } : {}),
  };
}

interface ApproveProject {
  readonly repo: string;
  readonly root: string;
  readonly config: OsqConfig;
}

/** A committed temp repository with one uncommitted change draft. */
async function makeApproveProject(manualEdits?: 'keep' | 'block'): Promise<ApproveProject> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-manual-refusals-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const one = await createNewSpec(repo, 'Order Flow');
  await installLocalVerifier(repo, one.folderPath);
  await setTaskScope(one.folderPath, 'src/dirty.ts');
  await writeAt(repo, 'src/dirty.ts', 'clean\n');
  await git(['add', 'src/dirty.ts'], repo);
  await git(['commit', '-qm', 'add dirty'], repo);
  await writeAt(repo, 'src/dirty.ts', 'dirty\n');

  return { repo, root, config: defineConfig({ vcs: makeVcsConfig(worktrees, manualEdits) }) };
}

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

const FOLDER = '001-order-flow';

const PROPOSAL = `---
title: Order Flow
depends_on: []
verify: node verify.cjs
features:
  reads: []
---

## Goal

Run the tasks.

## Surface

None.

## Human steps

None
`;

const TASK = `---
title: Only task
verify: node verify.cjs
scope: ["src/one.txt"]
entry: []
skills: []
---

## Acceptance

- [ ] does the thing
`;

async function writeChange(folderPath: string): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), PROPOSAL, 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks.md'), '# Tasks\n\n- [ ] 1. Only task\n', 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), TASK, 'utf8');
  await writeAt(folderPath, path.posix.join('specs', 'orders', 'spec.md'), ADD_001);
}

/** Fake adapter whose spawn edits the task's scoped file under its project root. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await fs.writeFile(
      path.join(options.projectRoot, options.scope[0] ?? 'src/one.txt'),
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
    return { exitCode: 0 };
  }
}

interface LandProject {
  readonly repo: string;
  readonly worktree: string;
  readonly config: OsqConfig;
}

/** A committed temp repository with the one change archived into its worktree. */
async function setupLandProject(manualEdits?: 'keep' | 'block'): Promise<LandProject> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-manual-refusals-land-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktreeRoot = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, 'src', 'seed.txt'), 'seed\n', 'utf8');
  await fs.writeFile(path.join(repo, 'src', 'one.txt'), 'seed one\n', 'utf8');
  await writeAt(repo, path.posix.join('openspec', 'specs', 'orders', 'spec.md'), ORDERS_SPEC);
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  await writeChange(path.join(repo, CHANGES, FOLDER));
  const config = defineConfig({
    vcs: makeVcsConfig(worktreeRoot, manualEdits),
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
  });
  const result = await approveSpec(repo, '001', config);
  assert.ok(result.worktreePath, 'approval created a worktree');
  await runWatcherOnce(repo, config, new ActingAdapter());
  return { repo, worktree: result.worktreePath, config };
}

interface Capture {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

async function captureLand(cwd: string, config: OsqConfig, id: string): Promise<Capture> {
  let stdout = '';
  let stderr = '';
  let exitCode: number | null = null;
  try {
    await landCommand(id, {
      cwd,
      config,
      stdout: (msg) => {
        stdout += msg;
      },
      stderr: (msg) => {
        stderr += msg;
      },
    });
    exitCode = 0;
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    stderr += error.message.length > 0 ? `${error.message}\n` : '';
    exitCode = error.exitCode;
  }
  return { stdout, stderr, exitCode };
}

describe('Dirty scope under each mode', () => {
  it('unset', async () => {
    const project = await makeApproveProject();

    await assert.rejects(approveSpec(project.repo, '001', project.config), (error: Error) => {
      assert.equal(
        error.message,
        'uncommitted changes in task scope: src/dirty.ts; keep them with osq manual "<why>", commit them, or pass --ignore-dirty',
      );
      return true;
    });
    assert.equal(
      await exists(
        path.join(project.repo, 'openspec', 'changes', '001-order-flow', '.run', 'approved'),
      ),
      false,
    );
  });

  it('block', async () => {
    const project = await makeApproveProject('block');

    await assert.rejects(approveSpec(project.repo, '001', project.config), (error: Error) => {
      assert.equal(
        error.message,
        'uncommitted changes in task scope: src/dirty.ts; commit them or pass --ignore-dirty',
      );
      return true;
    });
  });
});

describe('Uncommitted file under each mode', () => {
  it('unset', async () => {
    const project = await setupLandProject();
    await writeAt(project.repo, 'src/one.txt', 'edited\n');
    const before = await git(['rev-parse', 'HEAD'], project.repo);

    const capture = await captureLand(project.repo, project.config, '001');

    assert.equal(capture.exitCode, 1);
    assert.equal(capture.stdout, '');
    assert.equal(
      capture.stderr,
      'The checkout has uncommitted changes in files this land writes: src/one.txt; keep them with osq manual "<why>", or commit or stash them, then run osq land 001 again\n',
    );
    assert.equal(await git(['rev-parse', 'HEAD'], project.repo), before);
  });

  it('block', async () => {
    const project = await setupLandProject('block');
    await writeAt(project.repo, 'src/one.txt', 'edited\n');

    const capture = await captureLand(project.repo, project.config, '001');

    assert.equal(capture.exitCode, 1);
    assert.equal(capture.stdout, '');
    assert.equal(
      capture.stderr,
      'The checkout has uncommitted changes in files this land writes: src/one.txt; commit or stash them, then run osq land 001 again\n',
    );
  });
});
