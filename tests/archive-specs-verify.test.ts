import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { DEFAULT_CONFIG, type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { retrySpec } from '../src/core/lifecycle/retry.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { getArchiveDir } from '../src/core/status/layout.js';
import { AgyAdapter } from '../src/harness/agy/agy.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { applyArchiveSpecs, restoreArchiveSpecs } from '../src/watcher/archive-specs.js';
import { checkAndArchiveSpec } from '../src/watcher/archiver.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);

const CHANGE_ID = '001-spec-verify';
const PASSING = 'node pass.cjs';
const CHANGE_VERIFY = 'node verify.cjs';
const PASS_SCRIPT = 'process.exit(0);\n';

/**
 * Local opt-out for scenarios whose subject is the change-level verify seeing
 * the merged specs. Derived from `DEFAULT_CONFIG` so every other default holds.
 */
const ARCHIVE_ONLY_CONFIG: OsqConfig = Object.freeze({
  ...DEFAULT_CONFIG,
  gates: { changeVerifyAfterTask: false },
});

const ORDERS_SPEC = `# orders Specification

## Purpose

Track orders.

## Requirements

### Requirement: Keep
The system SHALL keep.

#### Scenario: Keeps
- **WHEN** kept
- **THEN** kept

### Requirement: Remove
The system SHALL remove.

#### Scenario: Removes
- **WHEN** removed
- **THEN** removed
`;

const ORDERS_SIDECAR = 'group: original\n';

const ORDERS_DELTA = `# Spec Delta: orders

## MODIFIED Requirements

### Requirement: Keep
The system SHALL keep, modified.

#### Scenario: Keeps
- **WHEN** kept
- **THEN** kept

## REMOVED Requirements

### Requirement: Remove

#### Scenario: Removes
- **WHEN** removed
- **THEN** removed
`;

const REMOVE_ONLY_DELTA = `# Spec Delta: orders

## REMOVED Requirements

### Requirement: Remove

#### Scenario: Removes
- **WHEN** removed
- **THEN** removed
`;

const BILLING_DELTA = `# Spec Delta: billing

## Purpose

Bill customers.

## ADDED Requirements

### Requirement: Billing works
The system SHALL bill.

#### Scenario: Bills
- **WHEN** billed
- **THEN** billed
`;

const BILLING_CREATES = '  - name: billing\n    group: inventory';

/** Real on-disk harness binary for the actual `AgyAdapter`. */
const FAKE_HARNESS_SCRIPT = `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const specFolder = process.env.OSQ_SPEC_FOLDER;
const taskNumber = process.env.OSQ_TASK_NUMBER;
if (specFolder && taskNumber) {
  const resultsDir = path.join(specFolder, '.run', 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, taskNumber + '.md'), '# Result\\n', 'utf8');
}
process.exit(0);
`;

function proposal(changeVerify: string, creates?: string): string {
  const lines = [
    '---',
    'title: Archive specs verify',
    'depends_on: []',
    `verify: ${changeVerify}`,
    'features:',
    '  reads: []',
  ];
  if (creates !== undefined) {
    lines.push('creates:', creates);
  }
  lines.push(
    '---',
    '## Goal',
    'Exercise archive-specs verification.',
    '## Contract',
    '| Input | Expected Output |',
    '|---|---|',
    '| a | b |',
    '## Non-goals',
    'None.',
    '## Surface',
    'None.',
    '## Delta',
    'None.',
  );
  return `${lines.join('\n')}\n`;
}

function taskFile(verify: string): string {
  return [
    '---',
    'title: When the task verifies',
    `verify: ${verify}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] observed',
    '',
  ].join('\n');
}

interface InPlaceChangeOptions {
  readonly changeVerify: string;
  readonly taskVerify?: string;
  readonly creates?: string;
}

describe('archive specs verification', () => {
  let tmpDir: string;
  let originalAgyPath: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-archive-specs-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'pass.cjs'), PASS_SCRIPT, 'utf8');
    const fakeAgy = path.join(tmpDir, 'fake-agy.mjs');
    await fs.writeFile(fakeAgy, FAKE_HARNESS_SCRIPT, { mode: 0o755 });
    originalAgyPath = process.env.AGY_PATH;
    process.env.AGY_PATH = fakeAgy;
  });

  afterEach(async () => {
    if (originalAgyPath === undefined) {
      Reflect.deleteProperty(process.env, 'AGY_PATH');
    } else {
      process.env.AGY_PATH = originalAgyPath;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const archivePath = (): string =>
    path.join(getArchiveDir(DEFAULT_CONFIG.paths.openspecRoot, tmpDir), CHANGE_ID);
  const specFolderPath = (): string => path.join(tmpDir, 'openspec', 'changes', CHANGE_ID);

  async function exists(target: string): Promise<boolean> {
    return fs.access(target).then(
      () => true,
      () => false,
    );
  }

  async function createChange(options: InPlaceChangeOptions): Promise<string> {
    const specFolder = specFolderPath();
    await fs.mkdir(path.join(specFolder, 'tasks'), { recursive: true });
    await fs.writeFile(
      path.join(specFolder, 'proposal.md'),
      proposal(options.changeVerify, options.creates),
      'utf8',
    );
    await fs.writeFile(path.join(specFolder, 'tasks.md'), '# Tasks\n\n- [ ] 1. task 1\n', 'utf8');
    await fs.writeFile(
      path.join(specFolder, 'tasks', '1.md'),
      taskFile(options.taskVerify ?? PASSING),
      'utf8',
    );
    return specFolder;
  }

  async function writeLivingSpec(capability: string, content: string): Promise<void> {
    const dir = path.join(tmpDir, 'openspec', 'specs', capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), content, 'utf8');
  }

  async function writeDelta(
    specFolder: string,
    capability: string,
    spec: string,
    sidecar?: string,
  ): Promise<void> {
    const dir = path.join(specFolder, 'specs', capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), spec, 'utf8');
    if (sidecar !== undefined) {
      await fs.writeFile(path.join(dir, 'osq.yml'), sidecar, 'utf8');
    }
  }

  async function runOneTask(specFolder: string, config: OsqConfig): Promise<void> {
    const result = await runTask(tmpDir, specFolder, '1', config, new AgyAdapter());
    assert.equal(result.success, true, JSON.stringify(result));
  }

  it('runs the change verify against the merged living specs', async () => {
    const added = '### Requirement: Added by the change';
    await fs.writeFile(
      path.join(tmpDir, 'verify.cjs'),
      [
        "const fs = require('node:fs');",
        "const spec = fs.readFileSync('openspec/specs/orders/spec.md', 'utf8');",
        `process.exit(spec.includes(${JSON.stringify(added)}) ? 0 : 1);`,
        '',
      ].join('\n'),
      'utf8',
    );
    const specFolder = await createChange({ changeVerify: CHANGE_VERIFY });
    await writeLivingSpec(
      'orders',
      '# orders Specification\n\n## Requirements\n\n### Requirement: Existing\nOld.\n',
    );
    await writeDelta(
      specFolder,
      'orders',
      `# Spec Delta: orders\n\n## ADDED Requirements\n\n${added}\nThe system SHALL add.\n\n#### Scenario: Added\n- **WHEN** it runs\n- **THEN** it adds\n`,
    );
    await approveSpec(tmpDir, '001', ARCHIVE_ONLY_CONFIG);
    await runOneTask(specFolder, ARCHIVE_ONLY_CONFIG);

    // The delta is not visible to a verify that runs before the merge.
    const living = path.join(tmpDir, 'openspec', 'specs', 'orders', 'spec.md');
    assert.equal((await fs.readFile(living, 'utf8')).includes(added), false);

    assert.equal(await checkAndArchiveSpec(tmpDir, specFolder, ARCHIVE_ONLY_CONFIG), true);
    assert.equal((await fs.readFile(living, 'utf8')).includes(added), true);
    assert.equal(await exists(archivePath()), true);
  });

  it('records every living spec and sidecar relative to the project root', async () => {
    const specFolder = await createChange({
      changeVerify: CHANGE_VERIFY,
      creates: BILLING_CREATES,
    });
    await writeLivingSpec('orders', ORDERS_SPEC);
    await fs.writeFile(
      path.join(tmpDir, 'openspec', 'specs', 'orders', 'osq.yml'),
      ORDERS_SIDECAR,
      'utf8',
    );
    await writeDelta(specFolder, 'orders', ORDERS_DELTA, 'group: replacement\n');
    await writeDelta(specFolder, 'billing', BILLING_DELTA);

    await applyArchiveSpecs(tmpDir, specFolder, DEFAULT_CONFIG);

    const raw = await fs.readFile(path.join(specFolder, '.run', 'archive-specs.json'), 'utf8');
    assert.deepEqual(JSON.parse(raw), {
      'openspec/specs/billing/osq.yml': null,
      'openspec/specs/billing/spec.md': null,
      'openspec/specs/orders/osq.yml': ORDERS_SIDECAR,
      'openspec/specs/orders/spec.md': ORDERS_SPEC,
    });
  });

  it('puts the living specs back when the change verify is red', async () => {
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), 'process.exit(1);\n', 'utf8');
    const specFolder = await createChange({
      changeVerify: CHANGE_VERIFY,
      creates: BILLING_CREATES,
    });
    await writeLivingSpec('orders', ORDERS_SPEC);
    await fs.writeFile(
      path.join(tmpDir, 'openspec', 'specs', 'orders', 'osq.yml'),
      ORDERS_SIDECAR,
      'utf8',
    );
    await writeDelta(specFolder, 'orders', ORDERS_DELTA, 'group: replacement\n');
    await writeDelta(specFolder, 'billing', BILLING_DELTA);
    await approveSpec(tmpDir, '001', ARCHIVE_ONLY_CONFIG);
    await runOneTask(specFolder, ARCHIVE_ONLY_CONFIG);

    assert.equal(await checkAndArchiveSpec(tmpDir, specFolder, ARCHIVE_ONLY_CONFIG), false);

    assert.equal(
      await fs.readFile(path.join(tmpDir, 'openspec', 'specs', 'orders', 'spec.md'), 'utf8'),
      ORDERS_SPEC,
    );
    assert.equal(
      await fs.readFile(path.join(tmpDir, 'openspec', 'specs', 'orders', 'osq.yml'), 'utf8'),
      ORDERS_SIDECAR,
    );
    assert.equal(await exists(path.join(tmpDir, 'openspec', 'specs', 'billing')), false);
    assert.equal(await exists(path.join(specFolder, '.run', 'archive-specs.json')), false);
    assert.equal(await exists(archivePath()), false);
    const marker = await fs.readFile(
      path.join(specFolder, '.run', 'regressed', 'change.md'),
      'utf8',
    );
    assert.match(marker, /reason: verify_red/);
  });

  it('recovers an interrupted archive before applying the deltas again', async () => {
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), PASS_SCRIPT, 'utf8');
    const specFolder = await createChange({ changeVerify: CHANGE_VERIFY });
    await writeLivingSpec('orders', ORDERS_SPEC);
    await writeDelta(specFolder, 'orders', REMOVE_ONLY_DELTA);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    await runOneTask(specFolder, DEFAULT_CONFIG);

    // Simulate a watcher stopped after applying: record plus applied specs.
    await applyArchiveSpecs(tmpDir, specFolder, DEFAULT_CONFIG);
    const living = path.join(tmpDir, 'openspec', 'specs', 'orders', 'spec.md');
    assert.equal((await fs.readFile(living, 'utf8')).includes('### Requirement: Remove'), false);
    assert.equal(await exists(path.join(specFolder, '.run', 'archive-specs.json')), true);

    assert.equal(await checkAndArchiveSpec(tmpDir, specFolder, DEFAULT_CONFIG), true);

    const merged = await fs.readFile(living, 'utf8');
    assert.ok(merged.includes('### Requirement: Keep'));
    assert.equal(merged.includes('### Requirement: Remove'), false);
    assert.equal(await exists(path.join(archivePath(), '.run', 'archive-specs.json')), false);
  });

  it('archives with a prompt file and leaves no record behind', async () => {
    await fs.writeFile(path.join(tmpDir, 'verify.cjs'), PASS_SCRIPT, 'utf8');
    const specFolder = await createChange({ changeVerify: CHANGE_VERIFY });
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    await runOneTask(specFolder, DEFAULT_CONFIG);
    await fs.writeFile(path.join(specFolder, 'plan-prompt.md'), 'transient\n', 'utf8');

    assert.equal(await checkAndArchiveSpec(tmpDir, specFolder, DEFAULT_CONFIG), true);

    assert.equal(await exists(path.join(archivePath(), 'plan-prompt.md')), false);
    assert.equal(await exists(path.join(archivePath(), '.run', 'archive-specs.json')), false);
    assert.equal(await exists(path.join(archivePath(), 'proposal.md')), true);
  });

  it('restoreArchiveSpecs changes nothing without a record', async () => {
    const specFolder = await createChange({ changeVerify: CHANGE_VERIFY });
    assert.equal(await restoreArchiveSpecs(tmpDir, specFolder), false);
  });
});

const WORKTREE_CHANGE_ID = '001-order-flow';
const WORKTREE_CHANGE_REL = path.posix.join('openspec', 'changes', WORKTREE_CHANGE_ID);
const IN_SCOPE = 'src/one.txt';

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

/** Fake adapter whose spawn edits the task's scoped file in the worktree. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await fs.writeFile(path.join(options.projectRoot, IN_SCOPE), 'task one\n', 'utf8');
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

interface WorktreeProject {
  readonly repo: string;
  readonly worktree: string;
  readonly worktreeFolder: string;
  readonly config: OsqConfig;
}

/**
 * A committed repo with a change approved into a linked worktree. Its proposal
 * verify reads `osq/<change>/.run/verify-exit` in the worktree, so the test flips
 * it from red to green without ever dirtying a tracked path.
 */
async function setupWorktreeProject(): Promise<WorktreeProject> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-archive-specs-wt-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, IN_SCOPE), 'one\n', 'utf8');
  await fs.writeFile(path.join(repo, 'pass.cjs'), PASS_SCRIPT, 'utf8');
  await fs.writeFile(
    path.join(repo, 'verify.cjs'),
    [
      "const fs = require('node:fs');",
      `const mode = fs.readFileSync('${WORKTREE_CHANGE_REL}/.run/verify-exit', 'utf8').trim();`,
      "process.exit(mode === 'pass' ? 0 : 1);",
      '',
    ].join('\n'),
    'utf8',
  );

  const checkoutFolder = path.join(repo, WORKTREE_CHANGE_REL);
  await fs.mkdir(path.join(checkoutFolder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(checkoutFolder, 'proposal.md'), proposal(CHANGE_VERIFY), 'utf8');
  await fs.writeFile(
    path.join(checkoutFolder, 'tasks.md'),
    '# Tasks\n\n- [ ] 1. First task\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(checkoutFolder, 'tasks', '1.md'),
    taskFile(PASSING).replace('scope: []', `scope: ${JSON.stringify([IN_SCOPE])}`),
    'utf8',
  );
  await fs.mkdir(path.join(checkoutFolder, 'specs', 'orders'), { recursive: true });
  await fs.writeFile(
    path.join(checkoutFolder, 'specs', 'orders', 'spec.md'),
    REMOVE_ONLY_DELTA,
    'utf8',
  );
  const livingDir = path.join(repo, 'openspec', 'specs', 'orders');
  await fs.mkdir(livingDir, { recursive: true });
  await fs.writeFile(path.join(livingDir, 'spec.md'), ORDERS_SPEC, 'utf8');
  await fs.mkdir(path.join(checkoutFolder, '.run'), { recursive: true });
  await fs.writeFile(path.join(checkoutFolder, '.run', 'verify-exit'), 'fail\n', 'utf8');

  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({
    vcs,
    gates: {
      ...DEFAULT_GATES_CONFIG,
      preSpawnVerify: 'off',
      changeVerifyAfterTask: false,
    },
  });
  const result = await approveSpec(repo, '001', config);
  assert.ok(result.worktreePath, 'approval created a worktree');
  const worktree = result.worktreePath;
  return {
    repo,
    worktree,
    worktreeFolder: path.join(worktree, WORKTREE_CHANGE_REL),
    config,
  };
}

async function exists(target: string): Promise<boolean> {
  return fs.access(target).then(
    () => true,
    () => false,
  );
}

describe('interrupted archive in a worktree', () => {
  it('archives instead of halting with worktree_dirty', async () => {
    const project = await setupWorktreeProject();
    const adapter = new ActingAdapter();

    // Run the single task to done; the first archive attempt is red and halts.
    const first = await runWatcherCycle(project.repo, project.config, adapter);
    assert.equal(first.tasksRun, 1);
    assert.equal(first.specsArchived, 0);
    assert.equal(
      await exists(path.join(project.worktreeFolder, '.run', 'regressed', 'change.md')),
      true,
    );

    // A stopped watcher leaves the record and the applied specs in the worktree.
    await applyArchiveSpecs(project.worktree, project.worktreeFolder, project.config);
    await fs.writeFile(path.join(project.worktreeFolder, '.run', 'verify-exit'), 'pass\n', 'utf8');
    assert.equal(
      (
        await fs.readFile(
          path.join(project.worktree, 'openspec', 'specs', 'orders', 'spec.md'),
          'utf8',
        )
      ).includes('### Requirement: Remove'),
      false,
    );

    await retrySpec(project.repo, '001', 'change', project.config);
    const second = await runWatcherCycle(project.repo, project.config, adapter);

    assert.equal(second.specsArchived, 1);
    const merged = await fs.readFile(
      path.join(project.worktree, 'openspec', 'specs', 'orders', 'spec.md'),
      'utf8',
    );
    assert.ok(merged.includes('### Requirement: Keep'));
    assert.equal(merged.includes('### Requirement: Remove'), false);

    const archived = path.join(
      project.worktree,
      'openspec',
      'changes',
      'archive',
      WORKTREE_CHANGE_ID,
    );
    assert.equal(await exists(archived), true);
    assert.equal(await exists(path.join(archived, '.run', 'archive-specs.json')), false);
    assert.equal(await exists(path.join(archived, '.run', 'regressed', 'change.md')), false);
  });
});
