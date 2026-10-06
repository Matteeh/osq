import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { approveCommand } from '../src/cli/approve.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { hashChangeFolder } from '../src/core/spec/hasher.js';
import { resolveCheckoutRoot } from '../src/core/vcs/checkout-root.js';
import { worktreeBranch, worktreePath } from '../src/core/vcs/worktree.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;
const AUTHOR = 'Osq <osq@example.invalid>';
const CHANGE_ID = '001-steering-flow';
const CHANGE_REL = path.posix.join('openspec', 'changes', CHANGE_ID);
const TEST_SCOPE = 'tests/existing.test.ts';
const OTHER_SCOPE = 'src/two.txt';

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

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

async function readRun(folder: string, marker: string): Promise<string> {
  return (await fs.readFile(path.join(folder, '.run', marker), 'utf8')).trim();
}

/** The config source a temp checkout writes for `loadConfig` to read. */
function configSource(vcs: VcsConfig): string {
  return `export default { vcs: ${JSON.stringify(vcs)} };\n`;
}

interface Repo {
  readonly root: string;
  readonly repo: string;
  readonly worktrees: string;
  readonly config: OsqConfig;
  readonly vcs: VcsConfig;
}

/** A committed temp repository with the vcs block written into its config. */
async function makeRepo(): Promise<Repo> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-approve-from-worktree-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n', 'utf8');
  const vcs: VcsConfig = { enabled: true, author: AUTHOR, worktreeRoot: worktrees };
  await fs.writeFile(path.join(repo, 'osq.config.ts'), configSource(vcs), 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);
  return { root, repo, worktrees, config: defineConfig({ vcs }), vcs };
}

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

interface DraftProject extends Repo {
  readonly folder001: string;
  readonly spec001: string;
  readonly folder002: string;
  readonly spec002: string;
}

/** A committed temp repository with two uncommitted change drafts. */
async function makeDraftProject(): Promise<DraftProject> {
  const base = await makeRepo();
  const one = await createNewSpec(base.repo, 'Order Flow');
  const two = await createNewSpec(base.repo, 'Second Flow');
  await installLocalVerifier(base.repo, one.folderPath);
  await installLocalVerifier(base.repo, two.folderPath);
  return {
    ...base,
    folder001: one.folderName,
    spec001: one.folderPath,
    folder002: two.folderName,
    spec002: two.folderPath,
  };
}

function proposalMarkdown(): string {
  return [
    '---',
    'title: Steering Flow',
    'depends_on: []',
    `verify: ${PASSING_VERIFY}`,
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
  ].join('\n');
}

function taskMarkdown(title: string, scope: string): string {
  return [
    '---',
    `title: ${title}`,
    `verify: ${PASSING_VERIFY}`,
    `scope: ${JSON.stringify([scope])}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] does the thing',
    '',
  ].join('\n');
}

interface SteeringProject extends Repo {
  readonly worktree: string;
  readonly worktreeFolder: string;
}

/** A temp repository whose change 001 was approved into a linked worktree. */
async function makeSteeringProject(): Promise<SteeringProject> {
  const base = await makeRepo();
  await fs.writeFile(path.join(base.repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  const folder = path.join(base.repo, CHANGE_REL);
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folder, 'proposal.md'), proposalMarkdown(), 'utf8');
  await fs.writeFile(
    path.join(folder, 'tasks.md'),
    '# Tasks\n\n- [ ] 1. First task\n- [ ] 2. Second task\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(folder, 'tasks', '1.md'),
    taskMarkdown('First task', TEST_SCOPE),
    'utf8',
  );
  await fs.writeFile(
    path.join(folder, 'tasks', '2.md'),
    taskMarkdown('Second task', OTHER_SCOPE),
    'utf8',
  );

  const result = await approveSpec(base.repo, '001', base.config);
  const worktree = result.worktreePath;
  assert.ok(worktree, 'approval created a worktree');
  return { ...base, worktree, worktreeFolder: path.join(worktree, CHANGE_REL) };
}

async function markDone(folderPath: string, taskNumber: string): Promise<void> {
  const dir = path.join(folderPath, '.run', 'done');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, taskNumber), '', 'utf8');
}

async function markBlocked(folderPath: string, taskNumber: string, need: string): Promise<void> {
  const dir = path.join(folderPath, '.run', 'dead');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${taskNumber}.md`), `---\nreason: blocked\n---\n${need}\n`);
}

describe('osq approve from an osq worktree', () => {
  it('approves a checkout change from inside another change worktree and says so', async () => {
    const p = await makeDraftProject();
    await approveSpec(p.repo, '001', p.config);
    const wt001 = worktreePath(p.vcs, p.repo, p.folder001);
    const headBefore = await git(['rev-parse', 'HEAD'], wt001);
    const statusBefore = await git(['status', '--porcelain'], wt001);
    const stderr: string[] = [];

    await approveCommand(['002'], {
      cwd: wt001,
      stdout: () => {},
      stderr: (text) => stderr.push(text),
      planningReaders: [],
    });

    assert.ok(stderr.join('').includes(`Approving from the checkout ${p.repo}`));
    const wt002 = worktreePath(p.vcs, p.repo, p.folder002);
    const folder002 = path.join(wt002, path.relative(p.repo, p.spec002));
    assert.equal(await readRun(folder002, 'approved'), await hashChangeFolder(folder002));
    assert.equal(await readRun(folder002, 'approver'), AUTHOR.toLowerCase());
    assert.equal(await exists(p.spec002), false);
    assert.equal(await git(['rev-parse', 'HEAD'], wt001), headBefore);
    assert.equal(await git(['status', '--porcelain'], wt001), statusBefore);
  });

  it('approves in place from the checkout and prints nothing', async () => {
    const p = await makeDraftProject();
    const stderr: string[] = [];

    await approveCommand(['002'], {
      cwd: p.repo,
      config: p.config,
      stdout: () => {},
      stderr: (text) => stderr.push(text),
      planningReaders: [],
    });

    assert.equal(stderr.join(''), '');
    const wt002 = worktreePath(p.vcs, p.repo, p.folder002);
    assert.equal(await exists(wt002), true);
    assert.equal(
      await git(
        ['branch', '--format=%(refname:short)', '--list', worktreeBranch(p.folder002)],
        p.repo,
      ),
      worktreeBranch(p.folder002),
    );
  });

  it('approves a steered change when run inside its own worktree', async () => {
    const project = await makeSteeringProject();
    // A test file exists only in the worktree. If lint read the worktree root it
    // would flag task 1's scope; the checkout's lint does not.
    await fs.mkdir(path.join(project.worktree, 'tests'), { recursive: true });
    await fs.writeFile(path.join(project.worktree, TEST_SCOPE), 'export {};\n', 'utf8');
    await markDone(project.worktreeFolder, '1');
    await markBlocked(project.worktreeFolder, '2', `Needs ${OTHER_SCOPE}`);
    const taskPath = path.join(project.worktreeFolder, 'tasks', '2.md');
    const revised = (await fs.readFile(taskPath, 'utf8')).replace('does the thing', 'does it now');
    await fs.writeFile(taskPath, revised, 'utf8');
    const headBefore = await git(['rev-parse', 'HEAD'], project.worktree);
    const stderr: string[] = [];

    await approveCommand(['001'], {
      cwd: project.worktree,
      config: project.config,
      stdout: () => {},
      stderr: (text) => stderr.push(text),
      planningReaders: [],
    });

    assert.ok(stderr.join('').includes(`Approving from the checkout ${project.repo}`));
    assert.notEqual(await git(['rev-parse', 'HEAD'], project.worktree), headBefore);
    assert.equal(await git(['log', '--format=%s', '-1'], project.worktree), 'osq: 001 approved');
    assert.equal(
      await readRun(project.worktreeFolder, 'approved'),
      await hashChangeFolder(project.worktreeFolder),
    );
    assert.equal(await exists(path.join(project.worktreeFolder, '.run', 'dead', '2.1.md')), true);
  });

  it('returns the checkout unchanged for the checkout and a non-osq worktree', async () => {
    const p = await makeDraftProject();
    await approveSpec(p.repo, '001', p.config);
    const topic = path.join(p.root, 'topic');
    await git(['worktree', 'add', '-q', topic, '-b', 'topic'], p.repo);

    assert.equal(await resolveCheckoutRoot(p.repo, p.config), p.repo);
    assert.equal(await resolveCheckoutRoot(topic, p.config), topic);

    const stderr: string[] = [];
    await assert.rejects(
      approveCommand([], {
        cwd: topic,
        config: p.config,
        stdout: () => {},
        stderr: (text) => stderr.push(text),
        planningReaders: [],
      }),
      /specify at least one spec ID/,
    );
    assert.equal(stderr.join(''), '');
  });

  it('resolves a symlinked worktree path back to the checkout', async () => {
    const p = await makeDraftProject();
    await approveSpec(p.repo, '001', p.config);
    const wt001 = worktreePath(p.vcs, p.repo, p.folder001);
    const link = path.join(p.root, 'wt-link');
    await fs.symlink(wt001, link, 'dir');

    assert.equal(await resolveCheckoutRoot(link, p.config), p.repo);
  });

  it('leaves cwd unchanged when git or the vcs block is off', async () => {
    const p = await makeDraftProject();
    const missing = path.join(p.root, 'not-a-repository');
    await fs.mkdir(missing, { recursive: true });

    assert.equal(await resolveCheckoutRoot(missing, p.config), missing);
    assert.equal(await resolveCheckoutRoot(p.repo, defineConfig({})), p.repo);
  });
});
