import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { inboxDispatchCommand } from '../src/cli/inbox-dispatch.js';
import { inboxCommand } from '../src/cli/inbox.js';
import { messageCommand } from '../src/cli/message.js';
import { queueCommand } from '../src/cli/queue.js';
import { reportCommand } from '../src/cli/report.js';
import { statusCommand } from '../src/cli/status.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { changeTrees, listChanges } from '../src/core/status/change-locations.js';
import { worktreeBranch } from '../src/core/vcs/worktree.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGES = path.posix.join('openspec', 'changes');
const ARCHIVE = path.posix.join(CHANGES, 'archive');
const REJECTED = path.posix.join(CHANGES, 'rejected');
const ONE = '001-order-flow';
const THREE = '003-third';
const OUT_SCOPE = 'src/out.txt';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix)).then((dir) => {
    tmpDirs.push(dir);
    return dir;
  });
}

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

/** Run `git <args>` feeding `input` on stdin, returning stdout. */
function gitWithInput(args: string[], cwd: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, env: cleanGitEnv() });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`git ${args.join(' ')} exited ${code}: ${err}`));
    });
    child.stdin.end(input);
  });
}

/** Initialize a repo with a local identity and one baseline commit. */
async function initRepo(dir: string): Promise<void> {
  await git(['init', '-q', '-b', 'main'], dir);
  await git(['config', 'user.name', 'osq'], dir);
  await git(['config', 'user.email', 'osq@example.invalid'], dir);
  await fs.writeFile(path.join(dir, 'README.md'), 'baseline\n', 'utf8');
  await git(['add', '-A'], dir);
  await git(['commit', '-qm', 'baseline'], dir);
}

interface RepoSetup {
  readonly repo: string;
  readonly wtRoot: string;
  readonly vcs: VcsConfig;
  readonly config: OsqConfig;
}

/** A repository, a worktree root, and a config with vcs enabled. */
async function setupRepo(prefix: string): Promise<RepoSetup> {
  const tmp = await tempDir(prefix);
  const repo = path.join(tmp, 'repo');
  const wtRoot = path.join(tmp, 'wt');
  await fs.mkdir(repo, { recursive: true });
  await fs.mkdir(wtRoot, { recursive: true });
  await initRepo(repo);
  const vcs: VcsConfig = {
    enabled: true,
    author: 'osq <osq@example.invalid>',
    worktreeRoot: wtRoot,
  };
  return { repo, wtRoot, vcs, config: defineConfig({ vcs }) };
}

/** Add a worktree on `osq/<folder>` and return its path. */
async function addWorktree(repo: string, wtRoot: string, folder: string): Promise<string> {
  await git(['branch', `osq/${folder}`], repo);
  const wt = path.join(wtRoot, folder);
  await git(['worktree', 'add', wt, `osq/${folder}`], repo);
  return wt;
}

describe('Change locations with a landed copy', () => {
  it('lists an archive once, from the checkout, while keeping the worktree tree', async () => {
    const { repo, wtRoot, config } = await setupRepo('osq-landed-locations-');
    const wt = await addWorktree(repo, wtRoot, ONE);
    await fs.mkdir(path.join(repo, ARCHIVE, ONE), { recursive: true });
    await fs.mkdir(path.join(wt, ARCHIVE, ONE), { recursive: true });

    const trees = await changeTrees(repo, config);
    assert.equal(trees.length, 2);
    assert.equal(trees[0].root, path.resolve(repo));
    assert.equal(trees[1].worktreeFolder, ONE);

    const changes = await listChanges(repo, config);
    assert.deepEqual(
      changes.map((change) => [
        change.folderName,
        change.location,
        change.tree.root === path.resolve(repo),
      ]),
      [[ONE, 'archived', true]],
    );
  });

  it('lists a rejected folder once, from the checkout, when it is rejected in both', async () => {
    const { repo, wtRoot, config } = await setupRepo('osq-rejected-locations-');
    const wt = await addWorktree(repo, wtRoot, THREE);
    await fs.mkdir(path.join(repo, REJECTED, THREE), { recursive: true });
    await fs.mkdir(path.join(wt, REJECTED, THREE), { recursive: true });

    const trees = await changeTrees(repo, config);
    assert.equal(trees.length, 2);
    assert.equal(trees[1].worktreeFolder, THREE);

    const changes = await listChanges(repo, config);
    assert.deepEqual(
      changes.map((change) => [
        change.folderName,
        change.location,
        change.tree.root === path.resolve(repo),
      ]),
      [[THREE, 'rejected', true]],
    );
  });
});

/** Fake adapter whose spawn edits the task's scoped file under its project root. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    const target = options.scope[0] ?? OUT_SCOPE;
    await fs.writeFile(
      path.join(options.projectRoot, target),
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

const QUEUE = path.posix.join('openspec', 'queue.md');

interface LandedProject {
  readonly repo: string;
  readonly worktree: string;
  readonly config: OsqConfig;
  readonly message: string;
  readonly home: string;
}

/** A real project whose hand-landed change is archived in both checkout and worktree. */
async function setupLandedProject(): Promise<LandedProject> {
  const root = await tempDir('osq-landed-once-');
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  const home = path.join(root, 'home');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, OUT_SCOPE), 'out\n', 'utf8');
  await fs.mkdir(path.join(repo, path.dirname(QUEUE)), { recursive: true });
  await fs.writeFile(
    path.join(repo, QUEUE),
    ['## [alpha] Alpha', 'Depends on: nothing', '', 'Brief body for alpha.', ''].join('\n'),
    'utf8',
  );
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const folderPath = path.join(repo, CHANGES, ONE);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(folderPath, 'proposal.md'),
    [
      '---',
      'title: Order Flow',
      'depends_on: []',
      'verify: node verify.cjs',
      'features:',
      '  reads: []',
      '---',
      '## Goal',
      'Run the tasks.',
      '',
      '## Surface',
      'None.',
      '',
      '## Human steps',
      'None',
      '',
    ].join('\n'),
    'utf8',
  );
  await fs.writeFile(
    path.join(folderPath, 'tasks.md'),
    ['# Tasks', '', '- [ ] 1. First task', ''].join('\n'),
    'utf8',
  );
  await fs.writeFile(
    path.join(folderPath, 'tasks', '1.md'),
    [
      '---',
      'title: First task',
      'verify: node verify.cjs',
      `scope: ${JSON.stringify([OUT_SCOPE])}`,
      'entry: []',
      'skills: []',
      '---',
      '## Acceptance',
      '- [ ] does the thing',
      '',
    ].join('\n'),
    'utf8',
  );
  await fs.writeFile(
    path.join(folderPath, 'brief.md'),
    ['---', 'queue_item: alpha', '---', 'Brief body for alpha.', ''].join('\n'),
    'utf8',
  );

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({
    vcs,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
  });
  const result = await approveSpec(repo, '001', config);
  const worktree = result.worktreePath;
  assert.ok(worktree, 'approval created a worktree');

  const adapter = new ActingAdapter();
  await runWatcherCycle(repo, config, adapter);
  await runWatcherCycle(repo, config, adapter);

  const capture = await captureMessage(repo, config, '001');
  assert.equal(capture.exitCode, null);

  await git(['merge', '--squash', worktreeBranch(ONE)], repo);
  await gitWithInput(['commit', '-F', '-'], repo, capture.stdout);

  return { repo, worktree, config, message: capture.stdout, home };
}

interface Capture {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

/** Run `messageCommand` with every stream captured. */
async function captureMessage(cwd: string, config: OsqConfig, id: string): Promise<Capture> {
  let stdout = '';
  let stderr = '';
  let exitCode: number | null = null;
  await messageCommand(id, {
    cwd,
    config,
    stdout: (msg) => {
      stdout += msg;
    },
    stderr: (msg) => {
      stderr += msg;
    },
    exit: (code) => {
      exitCode = code;
    },
  });
  return { stdout, stderr, exitCode };
}

describe('A landed change counts once', () => {
  it('lists the archive once and reads the same from every command', async () => {
    const project = await setupLandedProject();

    const trees = await changeTrees(project.repo, project.config);
    assert.equal(trees.length, 2);
    assert.equal(trees[1].worktreeFolder, ONE);

    const archived = await listChanges(project.repo, project.config, ['archived']);
    assert.deepEqual(
      archived.map((change) => [change.folderName, change.tree.root === project.repo]),
      [[ONE, true]],
    );

    const queueOut: string[] = [];
    await queueCommand({
      cwd: project.repo,
      config: project.config,
      stdout: (m) => queueOut.push(m),
    });
    assert.match(queueOut.join(''), /alpha: Alpha \[landed\]/);

    const statusOut: string[] = [];
    await statusCommand({
      cwd: project.repo,
      config: project.config,
      stdout: (m) => statusOut.push(m),
    });
    assert.match(statusOut.join(''), /Archived specs: 1/);

    const inboxOut: string[] = [];
    await inboxCommand({
      cwd: project.repo,
      config: project.config,
      json: true,
      home: project.home,
      now: new Date(),
      stdout: (m) => inboxOut.push(m),
    });
    const inbox = JSON.parse(inboxOut.join('')) as {
      landed: Array<{ change: { id: string } }>;
    };
    assert.deepEqual(
      inbox.landed.map((item) => item.change.id),
      ['001'],
    );

    const dispatchOut: string[] = [];
    await inboxDispatchCommand({
      cwd: project.repo,
      config: project.config,
      json: true,
      home: project.home,
      stdout: (m) => dispatchOut.push(m),
    });
    const dispatch = JSON.parse(dispatchOut.join('')) as {
      items: Array<{ kind: string; change: { id: string } }>;
    };
    assert.equal(
      dispatch.items.filter((item) => item.change.id === '001' && item.kind === 'land').length,
      0,
    );

    const reportOut: string[] = [];
    await reportCommand({
      cwd: project.repo,
      config: project.config,
      json: true,
      home: project.home,
      stdout: (m) => reportOut.push(m),
    });
    const report = JSON.parse(reportOut.join('')) as { specs: { archived: number } };
    assert.equal(report.specs.archived, 1);
  });

  it('messages the worktree copy after the checkout already holds the archive', async () => {
    const project = await setupLandedProject();

    const after = await captureMessage(project.repo, project.config, '001');

    assert.equal(after.exitCode, null);
    assert.equal(after.stdout, project.message);
    assert.match(after.stdout, /^osq: 001 order flow\n/);
    assert.deepEqual(
      after.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('Osq-Change:')),
      [`Osq-Change: ${ONE}`],
    );
  });
});
