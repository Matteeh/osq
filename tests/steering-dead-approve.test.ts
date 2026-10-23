import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { scenario } from '@matteeh/osq/testing';
import { approveCommand } from '../src/cli/approve.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { hashChangeFolder } from '../src/core/spec/hasher.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHANGE_SLUG = '308-steer-dead-task';
const CHANGE_ID = '001-order-flow';
const CHANGE_REL = path.posix.join('openspec', 'changes', CHANGE_ID);
const IN_SCOPE = 'src/one.txt';
const SECOND_SCOPE = 'src/two.txt';

const tmpDirs: string[] = [];
let lookupRoot: string | null = null;
let previousChange: string | undefined;

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

/** Rename every repeated scenario header but its last, so lookup accepts the living copy. */
function dedupeScenarioNames(content: string): string {
  const lines = content.split('\n');
  const total = new Map<string, number>();
  for (const line of lines) {
    const match = /^(####\s+(?:Scenario:\s*)?)(.*)$/.exec(line);
    if (match !== null) {
      const name = (match[2] ?? '').trim();
      total.set(name, (total.get(name) ?? 0) + 1);
    }
  }
  const seen = new Map<string, number>();
  return lines
    .map((line) => {
      const match = /^(####\s+(?:Scenario:\s*)?)(.*)$/.exec(line);
      if (match === null) return line;
      const name = (match[2] ?? '').trim();
      const count = (seen.get(name) ?? 0) + 1;
      seen.set(name, count);
      return count === total.get(name) ? line : `${match[1]}${name} (${count})`;
    })
    .join('\n');
}

/** A lookup root with the living spec deduped and this change's delta merged. */
async function setupLookupRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-steering-dead-approve-lookup-'));
  lookupRoot = root;
  const openspec = path.join(root, 'openspec');
  const specDir = path.join(openspec, 'specs', 'spec-lint-and-approve');
  await fs.mkdir(specDir, { recursive: true });
  const living = await fs.readFile(
    path.join(REPO_ROOT, 'openspec', 'specs', 'spec-lint-and-approve', 'spec.md'),
    'utf8',
  );
  await fs.writeFile(path.join(specDir, 'spec.md'), dedupeScenarioNames(living), 'utf8');
  const deltaDir = path.join(openspec, 'changes', CHANGE_SLUG, 'specs', 'spec-lint-and-approve');
  await fs.mkdir(deltaDir, { recursive: true });
  await fs.copyFile(
    path.join(
      REPO_ROOT,
      'openspec',
      'changes',
      CHANGE_SLUG,
      'specs',
      'spec-lint-and-approve',
      'spec.md',
    ),
    path.join(deltaDir, 'spec.md'),
  );
  return path.join(openspec, 'changes', CHANGE_SLUG);
}

before(async () => {
  previousChange = process.env.OSQ_CHANGE;
  process.env.OSQ_CHANGE = await setupLookupRoot();
});

after(async () => {
  if (previousChange === undefined) Reflect.deleteProperty(process.env, 'OSQ_CHANGE');
  else process.env.OSQ_CHANGE = previousChange;
  if (lookupRoot !== null) await fs.rm(lookupRoot, { recursive: true, force: true });
});

/** Test git calls ignore redirecting variables, like osq's reads. */
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

async function captureStdout(run: () => Promise<void>): Promise<string> {
  let output = '';
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Buffer) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    await run();
  } finally {
    process.stdout.write = original;
  }
  return output;
}

interface TaskSpec {
  readonly title: string;
  readonly scope: string[];
}

const FIRST: TaskSpec = { title: 'First task', scope: [IN_SCOPE] };
const SECOND: TaskSpec = { title: 'Second task', scope: [SECOND_SCOPE] };

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

async function writeChange(folderPath: string, specs: readonly TaskSpec[]): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMarkdown('Order Flow'), 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks.md'), tasksMarkdown(specs), 'utf8');
  for (let index = 0; index < specs.length; index += 1) {
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${index + 1}.md`),
      taskMarkdown(specs[index] as TaskSpec),
      'utf8',
    );
  }
}

const PASSING_VERIFY = 'process.exit(0);\n';

interface Project {
  readonly repo: string;
  readonly worktree: string;
  readonly checkoutFolder: string;
  readonly worktreeFolder: string;
  readonly config: OsqConfig;
}

/** A committed temp repository with one change approved into a linked worktree. */
async function setupProject(specs: readonly TaskSpec[]): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-steering-dead-approve-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), PASSING_VERIFY, 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, 'src', 'out.txt'), 'out\n', 'utf8');
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
  const result = await approveSpec(repo, '001', config);
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

async function readApproved(folderPath: string): Promise<string> {
  return (await fs.readFile(path.join(folderPath, '.run', 'approved'), 'utf8')).trim();
}

async function markDone(folderPath: string, taskNumber: string): Promise<void> {
  const dir = path.join(folderPath, '.run', 'done');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, taskNumber), '', 'utf8');
}

async function markDeadTimeout(folderPath: string, taskNumber: string): Promise<void> {
  const dir = path.join(folderPath, '.run', 'dead');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${taskNumber}.md`),
    '---\nreason: timeout\n---\nAgent timed out\n',
    'utf8',
  );
}

async function reviseTask(folderPath: string): Promise<void> {
  const taskPath = path.join(folderPath, 'tasks', '2.md');
  const revised = (await fs.readFile(taskPath, 'utf8')).replace('does the thing', 'does it now');
  await fs.writeFile(taskPath, revised, 'utf8');
}

async function commitFiles(cwd: string, sha: string): Promise<string[]> {
  const output = await git(['show', '--pretty=format:', '--name-only', sha], cwd);
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();
}

/** Fake adapter whose spawn edits the current task's scoped file. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';
  readonly calls: SpawnTaskOptions[] = [];

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.calls.push({ ...options });
    const target = options.taskNumber === '2' ? SECOND_SCOPE : IN_SCOPE;
    await fs.writeFile(path.join(options.projectRoot, target), `task ${options.taskNumber}\n`);
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(path.join(resultsDir, `${options.taskNumber}.md`), '# Agent result\n');
    return { exitCode: 0 };
  }
}

scenario(
  'spec-lint-and-approve',
  'Dead task approved again in its worktree',
  { covers: approveCommand },
  async ({ run, then }) => {
    const project = await setupProject([FIRST, SECOND]);
    await markDone(project.worktreeFolder, '1');
    await markDeadTimeout(project.worktreeFolder, '2');
    await reviseTask(project.worktreeFolder);
    const headBefore = await git(['rev-parse', 'HEAD'], project.worktree);
    const branchesBefore = await git(['branch', '--format=%(refname:short)'], project.repo);

    const stdout = await captureStdout(() =>
      run(['001'], { cwd: project.repo, config: project.config, planningReaders: [] }),
    );

    await then(
      "the worktree's HEAD is a new `osq: <id> approved` commit holding the edited `tasks/2.md`, `.run/approved` holds the edited folder's hash, `.run/dead/2.md` is now `.run/dead/2.1.md`, `.run/done/1` remains, the output says `Continues from task 2`, no branch was created, and the checkout holds no copy of the change",
      async () => {
        const headAfter = await git(['rev-parse', 'HEAD'], project.worktree);
        assert.notEqual(headAfter, headBefore);
        assert.equal(
          await git(['log', '--format=%s', '-1'], project.worktree),
          'osq: 001 approved',
        );
        assert.ok(
          (await commitFiles(project.worktree, headAfter)).includes(`${CHANGE_REL}/tasks/2.md`),
        );
        assert.equal(
          await readApproved(project.worktreeFolder),
          await hashChangeFolder(project.worktreeFolder),
        );
        assert.equal(
          await exists(path.join(project.worktreeFolder, '.run', 'dead', '2.md')),
          false,
        );
        assert.equal(
          await exists(path.join(project.worktreeFolder, '.run', 'dead', '2.1.md')),
          true,
        );
        assert.equal(await exists(path.join(project.worktreeFolder, '.run', 'done', '1')), true);
        assert.ok(stdout.includes('  Continues from task 2'));
        assert.equal(
          await git(['branch', '--format=%(refname:short)'], project.repo),
          branchesBefore,
        );
        assert.equal(await exists(project.checkoutFolder), false, 'checkout holds no copy');
      },
    );
  },
);

scenario(
  'spec-lint-and-approve',
  'The run continues',
  { covers: runWatcherCycle },
  async ({ run, then }) => {
    const project = await setupProject([FIRST, SECOND]);
    await markDone(project.worktreeFolder, '1');
    await markDeadTimeout(project.worktreeFolder, '2');
    await reviseTask(project.worktreeFolder);
    await approveSpec(project.repo, '001', project.config);
    const adapter = new ActingAdapter();

    const summary = await run(project.repo, project.config, adapter);

    await then(
      'task 1 does not run again, task 2 runs and is verified, and the change archives in its worktree',
      async () => {
        assert.equal(summary.tasksRun, 1);
        assert.deepEqual(
          adapter.calls.map((call) => call.taskNumber),
          ['2'],
        );
        assert.equal(summary.specsArchived, 1);
        const archivedFolder = path.join(
          project.worktree,
          'openspec',
          'changes',
          'archive',
          CHANGE_ID,
        );
        assert.equal(await exists(archivedFolder), true);
        assert.equal(await exists(path.join(archivedFolder, '.run', 'done', '2')), true);
      },
    );
  },
);
