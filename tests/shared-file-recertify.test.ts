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
import { runWatcherCycle } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGE_ID = '001-order-flow';
const CHANGE_REL = path.posix.join('openspec', 'changes', CHANGE_ID);
const ONE = 'src/one.txt';
const THREE = 'src/three.txt';
const OUT = 'src/out.txt';

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
  return fs.access(target).then(
    () => true,
    () => false,
  );
}

async function commitSubjects(cwd: string): Promise<string[]> {
  const output = await git(['log', '--format=%s'], cwd);
  return output.split('\n').filter((line) => line.trim().length > 0);
}

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

async function readEvents(specFolder: string, target: string): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(specFolder, '.run', 'events', `${target}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

/** A verify script that passes while recording where it ran. */
const PASSING_VERIFY = [
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  'if (process.env.OSQ_CHANGE) {',
  "  const dir = path.join(process.env.OSQ_CHANGE, '.run');",
  '  fs.mkdirSync(dir, { recursive: true });',
  "  fs.writeFileSync(path.join(dir, 'verify-env.json'), JSON.stringify({ cwd: process.cwd(), change: process.env.OSQ_CHANGE }));",
  '}',
  'process.exit(0);',
  '',
].join('\n');

interface TaskSpec {
  readonly title: string;
  readonly scope: string[];
}

const FIRST: TaskSpec = { title: 'Owns the shared file', scope: [ONE] };
const SHARED: TaskSpec = { title: 'Extends the shared file', scope: [ONE] };
const THIRD: TaskSpec = { title: 'Runs after the shared file', scope: [THREE] };

interface Project {
  readonly repo: string;
  readonly worktree: string;
  readonly worktreeFolder: string;
  readonly config: OsqConfig;
}

function proposalMarkdown(title: string): string {
  return [
    '---',
    `title: ${title}`,
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
  ].join('\n');
}

function taskMarkdown(spec: TaskSpec): string {
  return [
    '---',
    `title: ${spec.title}`,
    'verify: node verify.cjs',
    `scope: ${JSON.stringify(spec.scope)}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] does the thing',
    '',
  ].join('\n');
}

function tasksMarkdown(specs: readonly TaskSpec[]): string {
  const lines = ['# Tasks', ''];
  specs.forEach((spec, index) => lines.push(`- [ ] ${index + 1}. ${spec.title}`));
  lines.push('');
  return lines.join('\n');
}

/** A committed temp repository with one change approved into a linked worktree. */
async function setupProject(specs: readonly TaskSpec[]): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-shared-recert-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), PASSING_VERIFY, 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, OUT), 'out\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const checkoutFolder = path.join(repo, CHANGE_REL);
  await fs.mkdir(path.join(checkoutFolder, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(checkoutFolder, 'proposal.md'),
    proposalMarkdown('Order Flow'),
    'utf8',
  );
  await fs.writeFile(path.join(checkoutFolder, 'tasks.md'), tasksMarkdown(specs), 'utf8');
  for (let index = 0; index < specs.length; index += 1) {
    await fs.writeFile(
      path.join(checkoutFolder, 'tasks', `${index + 1}.md`),
      taskMarkdown(specs[index] as TaskSpec),
      'utf8',
    );
  }

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
  return {
    repo,
    worktree,
    worktreeFolder: path.join(worktree, CHANGE_REL),
    config,
  };
}

/** Fake adapter whose spawn edits files under the task's project root. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';
  readonly calls: SpawnTaskOptions[] = [];

  constructor(private readonly act: (options: SpawnTaskOptions) => Promise<void>) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.calls.push({ ...options });
    await this.act(options);
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

/** Task 1 writes its file; task 2's first attempt oversteps and its retry does not. */
function act(options: SpawnTaskOptions): Promise<void> {
  if (options.taskNumber === '1') {
    return fs.writeFile(path.join(options.projectRoot, ONE), 'one from task 1\n', 'utf8');
  }
  if (options.taskNumber === '2') {
    const content = options.attempt === 1 ? 'two attempt one\n' : 'two attempt two\n';
    const write = fs.writeFile(path.join(options.projectRoot, ONE), content, 'utf8');
    if (options.attempt !== 1) return write;
    return write.then(() =>
      fs.writeFile(path.join(options.projectRoot, OUT), 'out of scope\n', 'utf8'),
    );
  }
  return fs.writeFile(path.join(options.projectRoot, THREE), 'three\n', 'utf8');
}

async function archivedFolder(project: Project): Promise<string | null> {
  const archived = path.join(project.worktree, 'openspec', 'changes', 'archive', CHANGE_ID);
  return (await exists(archived)) ? archived : null;
}

describe('Discarded attempt of the later task', () => {
  it('recertifies the shared file owner and credits the path from measured hashes', async () => {
    const project = await setupProject([FIRST, SHARED, THIRD]);
    const adapter = new ActingAdapter(act);

    for (let cycle = 0; cycle < 8; cycle += 1) {
      await runWatcherCycle(project.repo, project.config, adapter);
      if (await archivedFolder(project)) break;
    }

    const archived = await archivedFolder(project);
    const events =
      archived !== null
        ? await readEvents(archived, '1')
        : await readEvents(project.worktreeFolder, '1');
    const recertifications = events.filter((event) => event.type === 'recertification');
    assert.equal(recertifications.length, 1, 'one automatic recertification');
    assert.equal(recertifications[0]?.data?.outcome, 'passed');
    assert.equal(recertifications[0]?.data?.automatic, true);
    assert.deepEqual(recertifications[0]?.data?.attribution, [
      { path: `${ONE} (modified)`, attribution: '2', source: 'measures' },
    ]);

    assert.equal(
      await exists(path.join(project.worktreeFolder, '.run', 'regressed', '1.md')),
      false,
      'no regression marker in the active folder',
    );
    if (archived !== null) {
      assert.equal(
        await exists(path.join(archived, '.run', 'regressed', '1.md')),
        false,
        'no regression marker in the archive',
      );
    }

    assert.ok(
      (await commitSubjects(project.worktree)).includes('osq: 001 task 3 verified'),
      'task 3 ran',
    );
  });
});
