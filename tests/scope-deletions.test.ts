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
const ARCHIVE_REL = path.posix.join('openspec', 'changes', 'archive', CHANGE_ID);
const SCOPED_SOURCE = 'src/old.ts';
const SCOPED_TEST = 'tests/old.test.ts';
const OUTSIDE_SOURCE = 'src/out.ts';

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

/** Every non-empty porcelain status line, untracked files one by one. */
async function statusLines(cwd: string): Promise<string[]> {
  const output = await git(['status', '--porcelain'], cwd);
  return output.split('\n').filter((line) => line.trim().length > 0);
}

async function findCommit(cwd: string, subject: string): Promise<string> {
  return git(['log', '--format=%H', '-1', '--fixed-strings', `--grep=${subject}`], cwd);
}

/** `git show --name-status` lines, tab-separated like `D\tsrc/old.ts`. */
async function commitNameStatus(cwd: string, sha: string): Promise<string[]> {
  const output = await git(['show', '--pretty=format:', '--name-status', sha], cwd);
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

async function readEvents(specFolder: string, target = '1'): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(specFolder, '.run', 'events', `${target}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

const PASSING_VERIFY = 'process.exit(0);\n';

interface TaskSpec {
  readonly title: string;
  readonly scope: string[];
  readonly testsModify?: boolean;
}

const DELETE_SCOPED: TaskSpec = {
  title: 'Delete scoped files',
  scope: [SCOPED_SOURCE, 'tests/*.test.ts'],
  testsModify: true,
};

const DELETE_OUTSIDE: TaskSpec = {
  title: 'Delete an out-of-scope file',
  scope: [SCOPED_SOURCE],
};

interface Project {
  readonly repo: string;
  readonly worktree: string;
  readonly worktreeFolder: string;
  readonly config: OsqConfig;
}

function proposalMarkdown(): string {
  return [
    '---',
    'title: Scope deletions',
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    'Delete scoped files.',
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
  const lines = [
    '---',
    `title: ${spec.title}`,
    'verify: node verify.cjs',
    `scope: ${JSON.stringify(spec.scope)}`,
    'entry: []',
    'skills: []',
  ];
  if (spec.testsModify === true) lines.push('tests.modify: true');
  lines.push('---', '## Acceptance', '- [ ] deletes the files', '');
  return lines.join('\n');
}

async function writeChange(folderPath: string, spec: TaskSpec): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMarkdown(), 'utf8');
  await fs.writeFile(
    path.join(folderPath, 'tasks.md'),
    `# Tasks\n\n- [ ] 1. ${spec.title}\n`,
    'utf8',
  );
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMarkdown(spec), 'utf8');
}

/** A committed temp repository with one change approved into a linked worktree. */
async function setupProject(spec: TaskSpec): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-scope-deletions-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), PASSING_VERIFY, 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.mkdir(path.join(repo, 'tests'), { recursive: true });
  await fs.writeFile(path.join(repo, SCOPED_SOURCE), 'export const old = true;\n', 'utf8');
  await fs.writeFile(path.join(repo, SCOPED_TEST), 'export {};\n', 'utf8');
  await fs.writeFile(path.join(repo, OUTSIDE_SOURCE), 'export const out = true;\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const checkoutFolder = path.join(repo, CHANGE_REL);
  await writeChange(checkoutFolder, spec);

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
  return { repo, worktree, worktreeFolder: path.join(worktree, CHANGE_REL), config };
}

/** Fake adapter that runs a deletion in the task's project root and writes a result. */
class DeletingAdapter implements HarnessAdapter {
  readonly name = 'deleting';
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

describe('Scoped deletions', () => {
  it('commits both scoped deletions and leaves the worktree clean outside .run/', async () => {
    const project = await setupProject(DELETE_SCOPED);
    const adapter = new DeletingAdapter(async (options) => {
      await fs.rm(path.join(options.projectRoot, SCOPED_SOURCE), { force: true });
      await fs.rm(path.join(options.projectRoot, SCOPED_TEST), { force: true });
    });

    await runWatcherCycle(project.repo, project.config, adapter);

    assert.equal(adapter.calls.length, 1);
    const sha = await findCommit(project.worktree, 'osq: 001 task 1 verified');
    assert.notEqual(sha, '');
    const nameStatus = await commitNameStatus(project.worktree, sha);
    assert.ok(nameStatus.includes(`D\t${SCOPED_SOURCE}`), `missing source deletion: ${nameStatus}`);
    assert.ok(nameStatus.includes(`D\t${SCOPED_TEST}`), `missing test deletion: ${nameStatus}`);

    const outside = (await statusLines(project.worktree)).filter(
      (line) => !line.includes('/.run/'),
    );
    assert.deepEqual(outside, []);

    const archivedData = await readEvents(path.join(project.worktree, ARCHIVE_REL), '1');
    assert.ok(!archivedData.some((event) => event.type === 'scope_violation'));
  });

  it('records a scope_violation when a tracked file outside the scope is deleted', async () => {
    const project = await setupProject(DELETE_OUTSIDE);
    const adapter = new DeletingAdapter(async (options) => {
      await fs.rm(path.join(options.projectRoot, OUTSIDE_SOURCE), { force: true });
    });

    await runWatcherCycle(project.repo, project.config, adapter);

    assert.equal(adapter.calls.length, 1);
    const events = await readEvents(project.worktreeFolder, '1');
    const violation = events.find((event) => event.type === 'scope_violation');
    assert.ok(violation, 'a scope_violation event is recorded');
    assert.deepEqual(violation.data?.files, [OUTSIDE_SOURCE]);

    const dead = await fs.readFile(
      path.join(project.worktreeFolder, '.run', 'dead', '1.md'),
      'utf8',
    );
    assert.match(dead, /scope_violation/);
  });
});
