import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { buildSteeringPrompt } from '../src/cli/plan-steer-prompt.js';
import { planCommand } from '../src/cli/plan.js';
import { watchCommand } from '../src/cli/watch.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { readAutoSteerRecord } from '../src/core/run/auto-steer-record.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGE_ID = '001-order-flow';
const CHANGE_REL = path.posix.join('openspec', 'changes', CHANGE_ID);
const FIRST_SCOPE = 'src/one.txt';
const SECOND_SCOPE = 'src/two.txt';
const PASSING_VERIFY = 'process.exit(0);\n';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

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

interface TaskSpec {
  readonly title: string;
  readonly scope: string[];
}

const FIRST: TaskSpec = { title: 'First task', scope: [FIRST_SCOPE] };
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

/** The `vcs-worktree-recreate` config plus an `autoSteer` block. */
async function writeConfig(repo: string, worktrees: string): Promise<void> {
  await fs.writeFile(
    path.join(repo, 'osq.config.ts'),
    [
      'export default {',
      "  harness: 'mock',",
      "  gates: { preSpawnVerify: 'off' },",
      `  vcs: { enabled: true, author: 'Osq <osq@example.invalid>', worktreeRoot: ${JSON.stringify(worktrees)} },`,
      '  autoSteer: { enabled: true },',
      '};',
      '',
    ].join('\n'),
    'utf8',
  );
}

interface Project {
  readonly repo: string;
  readonly worktree: string;
  readonly checkoutFolder: string;
  readonly worktreeFolder: string;
  readonly config: OsqConfig;
}

/** A committed temp repository with one change, holding a brief, approved into a worktree. */
async function setupProject(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-steering-prompt-'));
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

  const checkoutFolder = path.join(repo, CHANGE_REL);
  await writeChange(checkoutFolder, [FIRST, SECOND]);
  await fs.writeFile(path.join(checkoutFolder, 'brief.md'), '# Brief\n\nSteer it.\n', 'utf8');
  await writeConfig(repo, worktrees);

  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const config = defineConfig({
    harness: 'mock',
    vcs: { enabled: true, author: 'Osq <osq@example.invalid>', worktreeRoot: worktrees },
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
    autoSteer: { enabled: true },
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

interface RawEvent {
  readonly type: string;
}

async function readEvents(folderPath: string, stream: string): Promise<RawEvent[]> {
  const file = path.join(folderPath, '.run', 'events', `${stream}.jsonl`);
  const content = await fs.readFile(file, 'utf8').catch(() => '');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as RawEvent);
}

/** A change approved into its worktree with task 1 done and task 2 dead `blocked`. */
async function steeredProject(): Promise<Project> {
  const project = await setupProject();
  await markDone(project.worktreeFolder, '1');
  await markBlocked(project.worktreeFolder, '2', 'Needs src/three.txt');
  return project;
}

describe('Same prompt as osq plan', () => {
  it('builds the prompt osq plan 001 --print prints, and writes nothing', async () => {
    const project = await steeredProject();

    let printed = '';
    await planCommand('001', {
      print: true,
      cwd: project.repo,
      config: project.config,
      stdout: (text) => {
        printed += text;
      },
    });

    const prompt = await buildSteeringPrompt(project.repo, project.config, '001');

    assert.ok(prompt !== null);
    assert.equal(prompt, printed.replace(/\n$/, ''));
    assert.ok(prompt.includes('## Steering'));
    assert.equal(await exists(path.join(project.worktreeFolder, 'plan-prompt.md')), false);
  });
});

describe('Nothing to steer', () => {
  it('returns null when no change matches 042', async () => {
    const project = await steeredProject();
    assert.equal(await buildSteeringPrompt(project.repo, project.config, '042'), null);
  });
});

describe('osq watch starts the planner', () => {
  it('runs the planner once and records unchanged on a second pass', async () => {
    const project = await steeredProject();
    const quiet = () => {};
    const options = {
      once: true,
      allowStale: true,
      cwd: project.repo,
      stdout: quiet,
      stderr: quiet,
    };

    await watchCommand(options);
    await watchCommand(options);

    const record = await readAutoSteerRecord(project.worktreeFolder);
    assert.equal(record?.outcome, 'unchanged');
    const runs = (await readEvents(project.worktreeFolder, 'change')).filter(
      (event) => event.type === 'auto_steer_ran',
    );
    assert.equal(runs.length, 1);
  });
});
