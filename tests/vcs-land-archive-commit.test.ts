import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after } from 'node:test';
import { promisify } from 'node:util';
import { scenario } from '@matteeh/osq/testing';
import { CommandError } from '../src/cli/command-error.js';
import { landCommand } from '../src/cli/land.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGES = path.posix.join('openspec', 'changes');
const TWO_SCOPE = 'src/two.txt';
const FOLDER = '002-orders';
const COMMIT_FAILED_MARKER = '---\nreason: commit_failed\n---\nblocked by hook\n';

const tmpDirs: string[] = [];

after(async () => {
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

const ORDERS_SPEC = `# orders Specification

## Purpose

Orders are totalled.

## Requirements

### Requirement: Existing orders
The system SHALL keep orders.
`;

const PROPOSAL = [
  '---',
  'title: Orders',
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

const TASK = [
  '---',
  'title: Orders task',
  'verify: node verify.cjs',
  `scope: ${JSON.stringify([TWO_SCOPE])}`,
  'entry: []',
  'skills: []',
  '---',
  '## Acceptance',
  '- [ ] does the thing',
  '',
].join('\n');

const DELTA = `# Spec Delta: orders

## ADDED Requirements

### Requirement: Order totals
The system SHALL total orders.

#### Scenario: Totals
- **WHEN** an order arrives
- **THEN** it is totalled
`;

async function writeChange(folderPath: string): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), PROPOSAL, 'utf8');
  await fs.writeFile(
    path.join(folderPath, 'tasks.md'),
    '# Tasks\n\n- [ ] 1. Orders task\n',
    'utf8',
  );
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), TASK, 'utf8');
  await writeAt(folderPath, path.posix.join('specs', 'orders', 'spec.md'), DELTA);
}

interface Project {
  readonly repo: string;
  readonly worktree: string;
  readonly config: OsqConfig;
}

/** A committed temp repository with change 002 approved into its own worktree. */
async function setupProject(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcs-land-archive-commit-'));
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
  await writeAt(repo, path.posix.join('openspec', 'specs', 'orders', 'spec.md'), ORDERS_SPEC);
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);
  await writeChange(path.join(repo, CHANGES, FOLDER));

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot,
  };
  const config = defineConfig({
    vcs,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
  });
  const approval = await approveSpec(repo, '002', config);
  assert.ok(approval.worktreePath, 'approval created a worktree for 002');
  return { repo, worktree: approval.worktreePath, config };
}

/** Move the change into the worktree's archive and write the halt marker by hand. */
async function archiveByHand(project: Project): Promise<void> {
  const active = path.join(project.worktree, CHANGES, FOLDER);
  const archived = path.join(project.worktree, CHANGES, 'archive', FOLDER);
  await fs.mkdir(path.dirname(archived), { recursive: true });
  await fs.rename(active, archived);
  await writeAt(archived, path.posix.join('.run', 'regressed', 'change.md'), COMMIT_FAILED_MARKER);
}

/** The default branch and the worktree as a land must leave them. */
async function unchangedState(project: Project): Promise<Record<string, string>> {
  return {
    head: await git(['rev-parse', 'HEAD'], project.repo),
    status: await git(['status', '--porcelain=v1', '--untracked-files=all'], project.repo),
    worktreeHead: await git(['rev-parse', 'HEAD'], project.worktree),
    worktreeStatus: await git(
      ['status', '--porcelain=v1', '--untracked-files=all'],
      project.worktree,
    ),
  };
}

scenario(
  'version-control',
  'Land on a failed archive commit',
  { covers: captureLand },
  async ({ run, then }) => {
    const project = await setupProject();
    await archiveByHand(project);
    const before = await unchangedState(project);
    const capture = await run(project.repo, project.config, '002');

    await then(
      "it exits 1 and prints `002-orders's archive commit failed; fix the cause, then run osq retry 002 change`, not the list of uncommitted paths, and the default branch and the worktree are unchanged",
      async () => {
        assert.equal(capture.exitCode, 1);
        assert.equal(capture.stdout, '');
        assert.equal(
          capture.stderr,
          "002-orders's archive commit failed; fix the cause, then run osq retry 002 change\n",
        );
        assert.equal(capture.stderr.includes('uncommitted changes'), false);
        assert.deepEqual(await unchangedState(project), before);
      },
    );
  },
);
