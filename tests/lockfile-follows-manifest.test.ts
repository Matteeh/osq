import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGE_ID = '001';
const CHANGE_FOLDER = '001-lockfile-follows-manifest';
const CHANGE_REL = path.posix.join('openspec', 'changes', CHANGE_FOLDER);
const VERIFY = 'node verify.cjs';
const CARGO_LOCK = 'Cargo.lock';
const A_MANIFEST = 'crates/a/Cargo.toml';
const B_MANIFEST = 'crates/b/Cargo.toml';
const UI_MANIFEST = 'packages/ui/package.json';
const PNPM_LOCK = 'pnpm-lock.yaml';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
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

async function writeFile(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function exists(target: string): Promise<boolean> {
  return fs.access(target).then(
    () => true,
    () => false,
  );
}

async function statusLines(cwd: string): Promise<string[]> {
  const output = await git(['status', '--porcelain'], cwd);
  return output.split('\n').filter((line) => line.trim().length > 0);
}

async function commitFiles(cwd: string, subject: string): Promise<string[]> {
  const sha = await git(['log', '--format=%H', '-1', '--fixed-strings', `--grep=${subject}`], cwd);
  const output = await git(['show', '--pretty=format:', '--name-only', sha], cwd);
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();
}

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

async function readEvents(specFolder: string, task = '1'): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(specFolder, '.run', 'events', `${task}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as ParsedEvent);
}

function scopeFiles(events: readonly ParsedEvent[]): string[] {
  const violation = events.find((event) => event.type === 'scope_violation');
  return violation ? ((violation.data?.files as string[]) ?? []) : [];
}

interface TaskSpec {
  readonly title: string;
  readonly scope: string[];
}

interface Project {
  readonly repo: string;
  readonly worktree: string;
  readonly checkoutFolder: string;
  readonly worktreeFolder: string;
  readonly config: OsqConfig;
}

function proposalMarkdown(): string {
  return [
    '---',
    'title: Lock file follows manifest',
    'depends_on: []',
    `verify: ${VERIFY}`,
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    'Add dependencies without dying on the workspace lock file.',
    '',
    '## Surface',
    'None.',
    '',
    '## Human steps',
    'None',
    '',
  ].join('\n');
}

function taskMarkdown(spec: TaskSpec): string {
  return [
    '---',
    `title: ${spec.title}`,
    `verify: ${VERIFY}`,
    `scope: ${JSON.stringify(spec.scope)}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] the dependency is added',
    '',
  ].join('\n');
}

function tasksMarkdown(specs: readonly TaskSpec[]): string {
  const lines = ['# Tasks', ''];
  specs.forEach((spec, index) => lines.push(`- [ ] ${index + 1}. ${spec.title}`));
  lines.push('');
  return lines.join('\n');
}

async function writeChange(folderPath: string, specs: readonly TaskSpec[]): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMarkdown(), 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks.md'), tasksMarkdown(specs), 'utf8');
  for (let index = 0; index < specs.length; index += 1) {
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${index + 1}.md`),
      taskMarkdown(specs[index] as TaskSpec),
      'utf8',
    );
  }
}

/** A committed temp repository whose change is approved into a linked worktree. */
async function setupProject(specs: readonly TaskSpec[]): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-lockfile-follows-'));
  roots.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await writeFile(repo, 'Cargo.toml', '[workspace]\nmembers = ["crates/a", "crates/b"]\n');
  await writeFile(repo, CARGO_LOCK, '# seed lock\n');
  await writeFile(repo, A_MANIFEST, '[package]\nname = "a"\nversion = "0.1.0"\n');
  await writeFile(repo, B_MANIFEST, '[package]\nname = "b"\nversion = "0.1.0"\n');
  await writeFile(repo, PNPM_LOCK, 'lockfileVersion: 9\n');
  await writeFile(repo, UI_MANIFEST, '{"name":"ui","version":"0.1.0"}\n');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const checkoutFolder = path.join(repo, CHANGE_REL);
  await writeChange(checkoutFolder, specs);

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({
    vcs,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
  });
  const result = await approveSpec(repo, CHANGE_ID, config);
  const worktree = result.worktreePath;
  assert.ok(worktree, 'approval created a worktree');
  return {
    repo,
    worktree,
    checkoutFolder,
    worktreeFolder: path.join(worktree, CHANGE_REL),
    config,
  };
}

/** Fake adapter whose spawn writes the scenario's files and a result. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';

  constructor(private readonly act: (options: SpawnTaskOptions, root: string) => Promise<void>) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await this.act(options, options.projectRoot);
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

async function addCrateDependency(root: string, crate: 'a' | 'b'): Promise<void> {
  const manifest = crate === 'a' ? A_MANIFEST : B_MANIFEST;
  await writeFile(
    root,
    manifest,
    `[package]\nname = "${crate}"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1"\n`,
  );
  await writeFile(root, CARGO_LOCK, `# lock after crate ${crate}\n`);
}

function archivedFolder(project: Project): string {
  return path.join(project.worktree, 'openspec', 'changes', 'archive', CHANGE_FOLDER);
}

describe('Lock file follows a manifest', () => {
  it('allows and commits the lock file when the task changed its manifest', async () => {
    const project = await setupProject([
      { title: 'Add a dependency to crate a', scope: ['crates/a/**'] },
    ]);
    const adapter = new ActingAdapter(async (_options, root) => addCrateDependency(root, 'a'));

    const result = await runTask(
      project.worktree,
      project.worktreeFolder,
      '1',
      project.config,
      adapter,
    );

    assert.equal(result.success, true);
    assert.deepEqual(scopeFiles(await readEvents(project.worktreeFolder)), []);
    await runWatcherOnce(project.repo, project.config, adapter);
    const files = await commitFiles(project.worktree, 'osq: 001 task 1 verified');
    assert.ok(files.includes(A_MANIFEST), 'the commit holds the changed manifest');
    assert.ok(files.includes(CARGO_LOCK), 'the commit holds the changed lock file');
    assert.deepEqual(await statusLines(project.worktree), []);
  });

  it('kills a task that changes the lock file without a manifest', async () => {
    const project = await setupProject([
      { title: 'Change only the lock file', scope: ['crates/a/**'] },
    ]);
    const adapter = new ActingAdapter(async (_options, root) => {
      await writeFile(root, CARGO_LOCK, '# lock without its manifest\n');
    });

    const result = await runTask(
      project.worktree,
      project.worktreeFolder,
      '1',
      project.config,
      adapter,
    );

    assert.equal(result.success, false);
    assert.equal(result.reason, 'scope_violation');
    const marker = await fs.readFile(
      path.join(project.worktreeFolder, '.run', 'dead', '1.md'),
      'utf8',
    );
    assert.match(marker, /Cargo\.lock/);
    assert.deepEqual(scopeFiles(await readEvents(project.worktreeFolder)), [CARGO_LOCK]);
  });

  it('allows and commits the root pnpm lock when the task changed its package', async () => {
    const project = await setupProject([
      { title: 'Add a package dependency', scope: ['packages/ui/**'] },
    ]);
    const adapter = new ActingAdapter(async (_options, root) => {
      await writeFile(
        root,
        UI_MANIFEST,
        '{"name":"ui","version":"0.1.0","dependencies":{"x":"1"}}\n',
      );
      await writeFile(root, PNPM_LOCK, 'lockfileVersion: 9\npackages:\n  x: 1\n');
    });

    const result = await runTask(
      project.worktree,
      project.worktreeFolder,
      '1',
      project.config,
      adapter,
    );

    assert.equal(result.success, true);
    assert.deepEqual(scopeFiles(await readEvents(project.worktreeFolder)), []);
    await runWatcherOnce(project.repo, project.config, adapter);
    const files = await commitFiles(project.worktree, 'osq: 001 task 1 verified');
    assert.ok(files.includes(UI_MANIFEST), 'the commit holds the changed package manifest');
    assert.ok(files.includes(PNPM_LOCK), 'the commit holds the changed pnpm lock file');
  });

  it('keeps the lock file out of the scope audit for two tasks', async () => {
    const project = await setupProject([
      { title: 'Add a dependency to crate a', scope: ['crates/a/**'] },
      { title: 'Add a dependency to crate b', scope: ['crates/b/**'] },
    ]);
    const adapter = new ActingAdapter(async (options, root) => {
      await addCrateDependency(root, options.taskNumber === '1' ? 'a' : 'b');
    });

    const summary = await runWatcherOnce(project.repo, project.config, adapter);

    assert.equal(summary.tasksRun, 2);
    assert.equal(summary.specsArchived, 1);
    assert.deepEqual(summary.blockedByRegression, []);
    const first = await commitFiles(project.worktree, 'osq: 001 task 1 verified');
    assert.ok(first.includes(A_MANIFEST));
    assert.ok(first.includes(CARGO_LOCK));
    const second = await commitFiles(project.worktree, 'osq: 001 task 2 verified');
    assert.ok(second.includes(B_MANIFEST));
    assert.ok(second.includes(CARGO_LOCK));

    const archived = archivedFolder(project);
    for (const task of ['1', '2']) {
      const marker = await fs.readFile(path.join(archived, '.run', 'done', task), 'utf8');
      assert.equal(marker.includes(CARGO_LOCK), false, `done marker ${task} omits the lock file`);
      assert.equal(await exists(path.join(archived, '.run', 'regressed', task)), false);
      assert.deepEqual(scopeFiles(await readEvents(archived, task)), []);
    }
    assert.equal(await exists(path.join(archived, '.run', 'regressed', 'change.md')), false);
  });
});
