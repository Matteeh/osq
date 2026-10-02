import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { CommandError } from '../src/cli/command-error.js';
import { lintCommand } from '../src/cli/lint.js';
import { planCommand } from '../src/cli/plan.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import {
  type HarnessAdapter,
  type InteractiveSessionOptions,
  NULL_INTERACTIVE_USAGE,
  type ReadInteractiveUsageOptions,
  type SpawnResult,
} from '../src/harness/types.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGE_ID = '001-order-flow';
const CHANGE_REL = path.posix.join('openspec', 'changes', CHANGE_ID);
const WORKTREES = 'worktrees';

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
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
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

function taskMarkdown(title: string, scope: string[]): string {
  return [
    '---',
    `title: ${title}`,
    'verify: node verify.cjs',
    `scope: ${JSON.stringify(scope)}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] does the thing',
    '',
  ].join('\n');
}

/** A change folder with a brief and one task per scope string given. */
async function writeChange(folderPath: string, scopes: readonly string[]): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMarkdown('Order Flow'), 'utf8');
  await fs.writeFile(path.join(folderPath, 'brief.md'), '# Brief\n\nRevise the plan.\n', 'utf8');
  const tasks = ['# Tasks', ''];
  scopes.forEach((_scope, index) => tasks.push(`- [ ] ${index + 1}. Task ${index + 1}`));
  tasks.push('');
  await fs.writeFile(path.join(folderPath, 'tasks.md'), tasks.join('\n'), 'utf8');
  for (let index = 0; index < scopes.length; index += 1) {
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${index + 1}.md`),
      taskMarkdown(`Task ${index + 1}`, [scopes[index] as string]),
      'utf8',
    );
  }
}

/** A committed temp repository with one two-task change approved into a worktree. */
async function setupWorktree(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-steering-plan-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, WORKTREES);
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(
    path.join(repo, 'osq.config.ts'),
    `export default {
  harness: "mock",
  planner: { harness: "mock", model: "mock-planner-model", agent: "mock-planner" },
  vcs: { enabled: true, author: "Osq <osq@example.invalid>", worktreeRoot: ${JSON.stringify(worktrees)} }
};\n`,
    'utf8',
  );
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  await writeChange(path.join(repo, CHANGE_REL), ['src/one.txt', 'src/two.txt']);
  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({ vcs });
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

async function activeFolders(repo: string): Promise<string[]> {
  const entries = await fs.readdir(path.join(repo, 'openspec', 'changes'));
  return entries.filter((entry) => entry !== 'archive' && entry !== 'rejected').sort();
}

/** Fake planner that records the working directory of the spawn and usage read. */
class RecordingPlanner implements HarnessAdapter {
  readonly name = 'recording';
  readonly spawns: InteractiveSessionOptions[] = [];
  readonly usageReads: ReadInteractiveUsageOptions[] = [];

  async setup(): Promise<void> {}

  async spawn(): Promise<SpawnResult> {
    throw new Error('task spawn is unused by this test');
  }

  async spawnInteractive(options: InteractiveSessionOptions): Promise<number> {
    this.spawns.push(options);
    return 0;
  }

  readInteractiveUsage = async (options: ReadInteractiveUsageOptions) => {
    this.usageReads.push(options);
    return NULL_INTERACTIVE_USAGE;
  };
}

describe('osq plan a change that needs steering', () => {
  it('writes the steering prompt into the worktree change folder', async () => {
    const project = await setupWorktree();
    await markDone(project.worktreeFolder, '1');
    await markBlocked(project.worktreeFolder, '2', 'Needs src/three.txt');

    const stdout = await captureStdout(() => planCommand('001', { cwd: project.repo }));

    const promptPath = path.join(project.worktreeFolder, 'plan-prompt.md');
    const prompt = await fs.readFile(promptPath, 'utf8');
    assert.ok(prompt.includes('## Steering'));
    assert.ok(prompt.includes('osq halted this change and asks you to revise its plan.'));
    assert.ok(prompt.includes('### task 2 blocked (blocked)'));
    assert.ok(
      prompt.includes(`Evidence: ${path.join(project.worktreeFolder, '.run', 'dead', '2.md')}`),
    );
    assert.ok(prompt.includes('Needs src/three.txt'));
    assert.ok(
      prompt.includes(
        `The change runs in ${project.worktree}; read its code there. Edit only ${project.worktreeFolder}.`,
      ),
    );
    assert.ok(
      prompt.includes(
        'Done tasks stay done: 1. Add a task for new work instead of rewriting a done one.',
      ),
    );
    assert.ok(
      prompt.trimEnd().endsWith('and the run continues from the first task that is not done.'),
    );

    assert.equal(await exists(path.join(project.repo, CHANGE_REL)), false, 'checkout has no copy');
    assert.deepEqual(await activeFolders(project.repo), [], 'no new change folder was created');
    assert.ok(stdout.includes(project.worktreeFolder), 'handoff line names the worktree folder');
  });

  it('starts the planner in the worktree with the steering prompt', async () => {
    const project = await setupWorktree();
    await markDone(project.worktreeFolder, '1');
    await markBlocked(project.worktreeFolder, '2', 'Needs src/three.txt');
    const adapter = new RecordingPlanner();

    await captureStdout(() => planCommand('001', { cwd: project.repo, session: true, adapter }));

    assert.equal(adapter.spawns.length, 1);
    const spawn = adapter.spawns[0];
    assert.ok(spawn);
    assert.equal(spawn.cwd, project.worktree);
    assert.ok(spawn.prompt.includes('## Steering'));
    assert.ok(spawn.prompt.includes('### task 2 blocked (blocked)'));
    assert.equal(adapter.usageReads.length, 1);
    assert.equal(adapter.usageReads[0]?.cwd, project.worktree);
  });

  it('refuses an approved change outside the checkout that needs no steering', async () => {
    const project = await setupWorktree();

    await assert.rejects(planCommand('001', { cwd: project.repo }), /needs no steering/);
    assert.equal(await exists(path.join(project.worktreeFolder, 'plan-prompt.md')), false);
    assert.equal(await exists(path.join(project.repo, CHANGE_REL)), false);
  });
});

describe('osq lint finds a change in any tree', () => {
  it('lints a change in its worktree and reports its finding', async () => {
    const project = await setupWorktree();
    const taskPath = path.join(project.worktreeFolder, 'tasks', '2.md');
    const content = await fs.readFile(taskPath, 'utf8');
    await fs.writeFile(taskPath, content.replace(/^verify:.*$/m, 'verify:'), 'utf8');

    const chunks: string[] = [];
    await assert.rejects(
      lintCommand(['001'], {
        cwd: project.repo,
        config: project.config,
        json: true,
        stdout: (text) => chunks.push(text),
      }),
      (error: unknown) => {
        assert.ok(error instanceof CommandError);
        assert.equal(error.message, '');
        assert.equal(error.exitCode, 1);
        return true;
      },
    );

    const document = JSON.parse(chunks.join('')) as {
      valid: boolean;
      changes: Array<{ change: string; findings: Array<{ message: string }> }>;
    };
    assert.equal(document.valid, false);
    assert.equal(document.changes.length, 1);
    assert.equal(document.changes[0]?.change, path.basename(project.worktreeFolder));
    assert.ok(
      document.changes[0]?.findings.some((finding) =>
        finding.message.includes('verify command is empty'),
      ),
      JSON.stringify(document.changes[0]?.findings),
    );
  });
});
