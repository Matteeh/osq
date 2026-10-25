import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { scenario } from '@matteeh/osq/testing';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import type { Logger } from '../src/core/foundation/logger.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { stackedPath, worktreeBranch, worktreePath } from '../src/core/vcs/worktree.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);

const CHANGES = path.join('openspec', 'changes');
const ARCHIVE = path.join('openspec', 'changes', 'archive');
const IN_SCOPE = 'src/one.txt';
const OUT_SCOPE = 'src/out.txt';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCENARIO_HEADER = '#### Scenario: Overlapped change approved again before it lands';
const TEMP_PREFIX = 'osq-stack-overlap-reapproved-lookup-';

const tmpDirs: string[] = [];
let lookupRoot: string | undefined;
let previousChange: string | undefined;

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

after(async () => {
  if (previousChange === undefined) Reflect.deleteProperty(process.env, 'OSQ_CHANGE');
  else process.env.OSQ_CHANGE = previousChange;
  if (lookupRoot !== undefined) await fs.rm(lookupRoot, { recursive: true, force: true });
});

/** Rename every repeated scenario header after its first, for a clean lookup root. */
function dedupeScenarioNames(content: string): string {
  const seen = new Set<string>();
  return content
    .split('\n')
    .map((line) => {
      const match = /^#### Scenario: (.+)$/.exec(line);
      if (match === null) return line;
      const name = match[1] ?? '';
      if (!seen.has(name)) {
        seen.add(name);
        return line;
      }
      return `#### Scenario: ${name} (variant)`;
    })
    .join('\n');
}

/** The active change folder whose watcher delta defines this test's scenario. */
async function deltaFolder(): Promise<string | undefined> {
  const fromEnv = process.env.OSQ_CHANGE?.trim();
  if (fromEnv !== undefined && fromEnv !== '') return path.resolve(process.cwd(), fromEnv);
  const changesDir = path.join(REPO_ROOT, 'openspec', 'changes');
  const entries = await fs.readdir(changesDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'archive') continue;
    const deltaPath = path.join(changesDir, entry.name, 'specs', 'watcher-and-harness', 'spec.md');
    const content = await fs.readFile(deltaPath, 'utf8').catch(() => '');
    if (content.includes(SCENARIO_HEADER)) return path.join(changesDir, entry.name);
  }
  return undefined;
}

/** Point scenario lookup at a deduped living spec merged with this change's delta. */
async function makeLookupRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  const openspec = path.join(root, 'openspec');
  const specDir = path.join(openspec, 'specs', 'watcher-and-harness');
  await fs.mkdir(specDir, { recursive: true });
  const living = await fs.readFile(
    path.join(REPO_ROOT, 'openspec', 'specs', 'watcher-and-harness', 'spec.md'),
    'utf8',
  );
  await fs.writeFile(path.join(specDir, 'spec.md'), dedupeScenarioNames(living), 'utf8');

  const active = await deltaFolder();
  const name = active === undefined ? 'lookup' : path.basename(active);
  if (active !== undefined) {
    const deltaDir = path.join(openspec, 'changes', name, 'specs', 'watcher-and-harness');
    await fs.mkdir(deltaDir, { recursive: true });
    await fs.copyFile(
      path.join(active, 'specs', 'watcher-and-harness', 'spec.md'),
      path.join(deltaDir, 'spec.md'),
    );
  }
  return path.join(openspec, 'changes', name);
}

before(async () => {
  previousChange = process.env.OSQ_CHANGE;
  lookupRoot = await makeLookupRoot();
  process.env.OSQ_CHANGE = lookupRoot;
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

async function exists(target: string): Promise<boolean> {
  return fs.access(target).then(
    () => true,
    () => false,
  );
}

interface ChangeDef {
  readonly folder: string;
  readonly title: string;
  readonly caps: readonly string[];
}

const ONE: ChangeDef = { folder: '001-a', title: 'One', caps: ['orders'] };
const TWO: ChangeDef = { folder: '002-b', title: 'Two', caps: ['orders'] };

function deltaSpec(capability: string): string {
  return [
    `# Spec Delta: ${capability}`,
    '',
    '## Purpose',
    '',
    `The ${capability} capability for the test.`,
    '',
    '## ADDED Requirements',
    '',
    `### Requirement: ${capability} works`,
    '',
    `The ${capability} capability SHALL work.`,
    '',
    `#### Scenario: ${capability} runs`,
    '- **WHEN** it runs',
    '- **THEN** it works',
    '',
  ].join('\n');
}

function proposalMarkdown(change: ChangeDef): string {
  return [
    '---',
    `title: ${change.title}`,
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
}

function taskMarkdown(change: ChangeDef): string {
  return [
    '---',
    `title: ${change.title} task`,
    'verify: node verify.cjs',
    `scope: ${JSON.stringify([IN_SCOPE])}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] does the thing',
    '',
  ].join('\n');
}

async function writeChange(folderPath: string, change: ChangeDef): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMarkdown(change), 'utf8');
  await fs.writeFile(
    path.join(folderPath, 'tasks.md'),
    `# Tasks\n\n- [ ] 1. ${change.title}\n`,
    'utf8',
  );
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMarkdown(change), 'utf8');
  for (const capability of change.caps) {
    const dir = path.join(folderPath, 'specs', capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), deltaSpec(capability), 'utf8');
  }
}

interface Project {
  readonly root: string;
  readonly repo: string;
  readonly worktrees: string;
  readonly config: OsqConfig;
  readonly vcs: VcsConfig;
}

async function makeProject(changes: readonly ChangeDef[]): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-stack-overlap-reapproved-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, IN_SCOPE), 'seed\n', 'utf8');
  await fs.writeFile(path.join(repo, OUT_SCOPE), 'out\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  for (const change of changes) {
    await writeChange(path.join(repo, CHANGES, change.folder), change);
  }

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({
    vcs,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off', autoRetries: 0 },
  });
  return { root, repo, worktrees, config, vcs };
}

/** A logger that keeps every info line. */
class CaptureLogger implements Logger {
  readonly infos: string[] = [];
  readonly errors: string[] = [];
  readonly symbols = false;

  info(msg: string): void {
    this.infos.push(msg);
  }
  verbose(): void {}
  warn(): void {}
  error(msg: string): void {
    this.errors.push(msg);
  }
  status(): void {}
  clearStatus(): void {}
}

/** Fake adapter whose spawn edits one scoped file under the spawn's project root. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await fs.mkdir(path.dirname(path.join(options.projectRoot, IN_SCOPE)), { recursive: true });
    await fs.writeFile(
      path.join(options.projectRoot, IN_SCOPE),
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

function stackedRoot(project: Project, folder: string): string {
  return stackedPath(project.vcs, project.repo, folder);
}

function stackedCopy(project: Project, folder: string): string {
  return path.join(stackedRoot(project, folder), CHANGES, folder);
}

/** Approve `folder` into its worktree and return that worktree's path. */
async function approveIntoWorktree(project: Project, folder: string): Promise<string> {
  const result = await approveSpec(project.repo, folder, project.config);
  assert.ok(result.worktreePath, `expected a worktree for ${folder}`);
  return result.worktreePath;
}

/** Move a freshly approved change into its branch's archive directory. */
async function archiveOnBranch(project: Project, folder: string): Promise<void> {
  const wtPath = worktreePath(project.vcs, project.repo, folder);
  await fs.mkdir(path.join(wtPath, ARCHIVE), { recursive: true });
  await git(['mv', path.join(CHANGES, folder), path.join(ARCHIVE, folder)], wtPath);
  await git(['commit', '-qm', `archive ${folder}`], wtPath);
}

/** Squash-merge a change's archived branch onto `main`. */
async function landOnMain(project: Project, folder: string): Promise<void> {
  await git(['merge', '--squash', worktreeBranch(folder)], project.repo);
  await git(['commit', '-qm', `land ${folder}`], project.repo);
}

/** Give an approved change a different approved hash at its branch tip. */
async function reapproveHash(project: Project, folder: string): Promise<void> {
  const wtPath = worktreePath(project.vcs, project.repo, folder);
  await fs.writeFile(
    path.join(wtPath, CHANGES, folder, '.run', 'approved'),
    'sha256:changed\n',
    'utf8',
  );
  await git(['add', '-A'], wtPath);
  await git(['commit', '-qm', `reapprove ${folder}`], wtPath);
}

async function branchExists(project: Project, branch: string): Promise<boolean> {
  return (
    (await git(['branch', '--format=%(refname:short)', '--list', branch], project.repo)) !== ''
  );
}

async function hasChangeRegression(project: Project, folder: string): Promise<boolean> {
  return exists(path.join(stackedCopy(project, folder), '.run', 'regressed', 'change.md'));
}

scenario(
  'watcher-and-harness',
  'Overlapped change approved again before it lands',
  { covers: runWatcherOnce },
  async ({ run, then }) => {
    const project = await makeProject([ONE, TWO]);
    const oneWorktree = await approveIntoWorktree(project, ONE.folder);
    await approveSpec(project.repo, TWO.folder, project.config);
    await reapproveHash(project, ONE.folder);
    // Dirty a file outside the dependency's scope so its task cannot finish.
    await fs.writeFile(path.join(oneWorktree, OUT_SCOPE), 'dirty\n', 'utf8');

    await then(
      "after that cycle no branch `osq/002-b` exists, `002-b`'s stacked approval remains and `002-b` has no regression marker; once `001-a` is archived on its branch and squash-merged into `main` by hand, the next cycle cuts `osq/002-b` from `main`'s tip",
      async () => {
        await run(project.repo, project.config, new ActingAdapter());

        assert.equal(await branchExists(project, worktreeBranch(TWO.folder)), false);
        assert.equal(await exists(stackedRoot(project, TWO.folder)), true);
        assert.equal(await hasChangeRegression(project, TWO.folder), false);

        await fs.writeFile(path.join(oneWorktree, OUT_SCOPE), 'out\n', 'utf8');
        await archiveOnBranch(project, ONE.folder);
        await landOnMain(project, ONE.folder);

        const logger = new CaptureLogger();
        await run(project.repo, project.config, new ActingAdapter(), logger);

        assert.equal(await branchExists(project, worktreeBranch(TWO.folder)), true);
        assert.ok(
          logger.infos.includes(
            `stacked ${TWO.folder} on main: worktree ${worktreePath(project.vcs, project.repo, TWO.folder)}`,
          ),
          `expected a stacked-on-main log line, got:\n${logger.infos.join('\n')}`,
        );
      },
    );
  },
);
