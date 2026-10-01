import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { readDispatchItems } from '../src/core/status/dispatch-items.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGES = path.join('openspec', 'changes');

let tmpDir: string;
const created: string[] = [];

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-dispatch-items-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  for (const dir of created.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

function proposalMd(title: string, verify = 'node verify.cjs'): string {
  return [
    '---',
    `title: ${title}`,
    'depends_on: []',
    `verify: ${verify}`,
    '---',
    '## Goal',
    `${title} goal.`,
    '',
  ].join('\n');
}

function taskMd(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'verify: node verify.cjs',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    `- [ ] ${title} criterion`,
    '',
  ].join('\n');
}

async function createChange(
  root: string,
  folderName: string,
  title: string,
  verify = 'node verify.cjs',
): Promise<string> {
  const dir = path.join(root, CHANGES, folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(title, verify), 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), taskMd('Task one'), 'utf8');
  return dir;
}

async function approve(folderPath: string): Promise<void> {
  await fs.mkdir(path.join(folderPath, '.run'), { recursive: true });
  await fs.writeFile(path.join(folderPath, '.run', 'approved'), 'sha256:fixture\n', 'utf8');
}

async function writeMarker(folderPath: string, rel: string, content: string): Promise<void> {
  const target = path.join(folderPath, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

interface ArchivedOptions {
  readonly verification?: { readonly afterLanding: boolean; readonly check: string | null };
}

async function createArchived(
  root: string,
  folderName: string,
  options: ArchivedOptions = {},
): Promise<string> {
  const dir = path.join(root, CHANGES, 'archive', folderName);
  await fs.mkdir(path.join(dir, '.run', 'events'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(folderName), 'utf8');
  const data = options.verification
    ? { archivePath: dir, verification: options.verification }
    : { archivePath: dir };
  await fs.writeFile(
    path.join(dir, '.run', 'events', 'change.jsonl'),
    `${JSON.stringify({ type: 'archived', timestamp: '2026-01-01T00:00:00.000Z', data })}\n`,
    'utf8',
  );
  return dir;
}

describe('dispatch items', () => {
  it('derives an approval and a halt item each with its commands', async () => {
    await createChange(tmpDir, '001-approval', 'Approval change');
    const dead = await createChange(tmpDir, '002-dead', 'Dead change');
    await approve(dead);
    await writeMarker(dead, '.run/dead/1.md', '---\nreason: verify_red\n---\nboom\n');
    await createArchived(tmpDir, '003-checks', {
      verification: { afterLanding: true, check: 'node check.cjs' },
    });

    const dispatch = await readDispatchItems(tmpDir, defineConfig({}));

    assert.deepEqual(
      dispatch.items.map((item) => item.kind),
      ['approval', 'halt'],
    );
    assert.deepEqual(
      dispatch.items.map((item) => item.change.id),
      ['001', '002'],
    );
    assert.deepEqual(dispatch.items[0].commands, ['osq approve 001', 'osq show 001']);
    assert.equal(dispatch.items[0].task, null);
    assert.equal(dispatch.items[1].task?.number, '1');
    assert.deepEqual(dispatch.items[1].commands, ['osq retry 002 1', 'osq show 002']);
    assert.equal(dispatch.watcherIdle, true);
  });

  it('derives no item for an unplanned draft with the planning sentinel', async () => {
    await createChange(tmpDir, '001-draft', 'Draft change', 'node -e "process.exit(0)"');

    const dispatch = await readDispatchItems(tmpDir, defineConfig({}));

    assert.deepEqual(dispatch.items, []);
  });

  it('follows state when the dead marker goes and the approval is written', async () => {
    const pending = await createChange(tmpDir, '001-pending', 'Pending change');
    const dead = await createChange(tmpDir, '002-dead', 'Dead change');
    await approve(dead);
    await writeMarker(dead, '.run/dead/1.md', '---\nreason: verify_red\n---\nboom\n');

    let dispatch = await readDispatchItems(tmpDir, defineConfig({}));
    assert.deepEqual(
      dispatch.items.map((item) => item.kind),
      ['approval', 'halt'],
    );

    await fs.rm(path.join(dead, '.run', 'dead', '1.md'));
    await approve(pending);
    dispatch = await readDispatchItems(tmpDir, defineConfig({}));
    assert.deepEqual(dispatch.items, []);
  });

  it('derives one task-less halt for a change-level regression', async () => {
    const change = await createChange(tmpDir, '004-change', 'Change regression');
    await approve(change);
    await writeMarker(change, '.run/regressed/change.md', '---\nreason: worktree_dirty\n---\nx\n');

    const dispatch = await readDispatchItems(tmpDir, defineConfig({}));
    const halts = dispatch.items.filter((item) => item.kind === 'halt');

    assert.equal(halts.length, 1);
    assert.equal(halts[0].task, null);
    assert.equal(halts[0].change.folder, '004-change');
    assert.deepEqual(halts[0].commands, [
      'osq retry 004 change',
      'osq reject 004 --reason <text>',
      'osq show 004',
    ]);
  });

  it('derives a land item for an untracked archive with the flag off and none once committed', async () => {
    const root = await makeRepo();
    await createArchived(root, '001-uncommitted');

    const off = defineConfig({});
    let dispatch = await readDispatchItems(root, off);
    const lands = dispatch.items.filter((item) => item.kind === 'land');
    assert.equal(lands.length, 1);
    assert.equal(lands[0].change.id, '001');
    assert.deepEqual(lands[0].commands, ['osq show 001']);

    await git(['add', '-A'], root);
    await git(['commit', '-qm', 'archive 001'], root);
    dispatch = await readDispatchItems(root, off);
    assert.equal(dispatch.items.filter((item) => item.kind === 'land').length, 0);
  });

  it('derives no land item when the project is not a git repository', async () => {
    await createArchived(tmpDir, '001-plain');

    const dispatch = await readDispatchItems(tmpDir, defineConfig({}));

    assert.equal(dispatch.items.filter((item) => item.kind === 'land').length, 0);
  });

  it('tracks watcherIdle across a change gaining a pending task', async () => {
    const change = await createChange(tmpDir, '001-approval', 'Approval change');
    const config = defineConfig({});

    let dispatch = await readDispatchItems(tmpDir, config);
    assert.equal(dispatch.watcherIdle, true);

    await approve(change);
    dispatch = await readDispatchItems(tmpDir, config);
    assert.equal(dispatch.watcherIdle, false);
  });
});

describe('dispatch land items from an osq worktree', () => {
  it('derives one land item until the archive reaches the default branch', async () => {
    const project = await makeProject({ changes: [ONE] });
    await approveIntoWorktree(project, '001');
    await runWatcherOnce(project.repo, project.config, new ActingAdapter());

    let dispatch = await readDispatchItems(project.repo, project.config);
    const lands = dispatch.items.filter((item) => item.kind === 'land');
    assert.equal(lands.length, 1);
    assert.equal(lands[0].change.id, '001');
    assert.equal(lands[0].change.folder, '001-a');
    assert.deepEqual(lands[0].commands, ['osq land 001', 'osq show 001']);

    await git(['merge', '--squash', 'osq/001-a'], project.repo);
    await git(['commit', '-qm', 'land 001'], project.repo);
    dispatch = await readDispatchItems(project.repo, project.config);
    assert.equal(dispatch.items.filter((item) => item.kind === 'land').length, 0);
  });
});

/** The git helpers copy `tests/stack-run.test.ts` so the worktree case is real. */
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

async function makeRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-dispatch-git-'));
  created.push(root);
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await fs.writeFile(path.join(root, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'seed'], root);
  return root;
}

const IN_SCOPE = 'src/one.txt';

interface ChangeDef {
  readonly folder: string;
  readonly title: string;
  readonly dependsOn: readonly string[];
}

const ONE: ChangeDef = { folder: '001-a', title: 'One', dependsOn: [] };

function proposalMarkdown(change: ChangeDef): string {
  return [
    '---',
    `title: ${change.title}`,
    `depends_on: [${change.dependsOn.map((id) => JSON.stringify(id)).join(', ')}]`,
    'verify: node verify.cjs',
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
}

interface Project {
  readonly root: string;
  readonly repo: string;
  readonly worktrees: string;
  readonly config: OsqConfig;
  readonly vcs: VcsConfig;
}

interface ProjectOptions {
  readonly changes?: readonly ChangeDef[];
}

async function makeProject(options: ProjectOptions = {}): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-dispatch-worktree-'));
  created.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, IN_SCOPE), 'seed\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  for (const change of options.changes ?? [ONE]) {
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

/** Fake adapter whose spawn edits one scoped file under the spawn's project root. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
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

async function approveIntoWorktree(project: Project, folder: string): Promise<string> {
  const result = await approveSpec(project.repo, folder, project.config);
  assert.ok(result.worktreePath, `expected a worktree for ${folder}`);
  return result.worktreePath;
}
