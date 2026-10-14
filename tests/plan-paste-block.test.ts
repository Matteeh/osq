import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { planCommand } from '../src/cli/plan.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig, loadConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { formatPlanPasteBlock } from '../src/core/foundation/plan-handoff.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { formatNextStep, readNextStep } from '../src/core/status/next-step.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGE_ID = '001-order-flow';
const CHANGE_REL = path.posix.join('openspec', 'changes', CHANGE_ID);

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function write(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
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

const PROPOSAL = [
  '---',
  'title: Demo',
  'depends_on: []',
  'verify: node -e "process.exit(0)"',
  'features:',
  '  reads: []',
  '---',
  '## Goal',
  'Demo goal.',
  '',
].join('\n');

/** A scaffolded project holding an unapproved change `001-demo` with a brief. */
async function setupDemoProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-paste-'));
  tmpDirs.push(root);
  await scaffoldProject(root);
  await write(root, 'openspec/changes/001-demo/brief.md', '# Brief\n\nBody.\n');
  await write(root, 'openspec/changes/001-demo/proposal.md', PROPOSAL);
  return root;
}

/** The next step text `planCommand` computes for `folder` in `root`. */
async function nextStepFor(root: string, folder: string): Promise<string> {
  return formatNextStep(await readNextStep(root, folder, await loadConfig(root)));
}

/** The full expected handoff block, built from the scenario's table. */
function expectedHandoff(folder: string, next: string, slashCommandId: string | null): string {
  const promptPath = path.join(folder, 'plan-prompt.md');
  const name = path.basename(folder);
  let text = `${folder}: ask your planning tool to plan change ${name} \u2014 next: ${next}\n\nPaste this into a new agent session to plan it:\n\nYou are the planner for osq change ${name}.\nRead ${promptPath} and follow it exactly; it is your complete prompt.\n`;
  if (slashCommandId !== null) {
    text += `\nIn Claude Code, /osq-plan ${slashCommandId} does the same.\n`;
  }
  return text;
}

describe('cli-foundation: Plan paste block', () => {
  it('Paste block text', () => {
    assert.equal(
      formatPlanPasteBlock('/p/openspec/changes/190-demo'),
      'You are the planner for osq change 190-demo.\n' +
        'Read /p/openspec/changes/190-demo/plan-prompt.md and follow it exactly; ' +
        'it is your complete prompt.\n',
    );
  });
});

describe('cli-foundation: Plan handoff with the paste block', () => {
  it('Handoff with the Claude Code command', async () => {
    const root = await setupDemoProject();
    assert.ok(
      await exists(path.join(root, '.claude', 'commands', 'osq-plan.md')),
      'scaffold writes the managed command',
    );

    const stdout = await captureStdout(() => planCommand('001', { cwd: root }));

    const folder = path.join(root, 'openspec', 'changes', '001-demo');
    assert.equal(stdout, expectedHandoff(folder, await nextStepFor(root, folder), '001'));
  });

  it('Handoff without the Claude Code command', async () => {
    const root = await setupDemoProject();
    await fs.rm(path.join(root, '.claude', 'commands', 'osq-plan.md'), { force: true });

    const stdout = await captureStdout(() => planCommand('001', { cwd: root }));

    const folder = path.join(root, 'openspec', 'changes', '001-demo');
    assert.equal(stdout, expectedHandoff(folder, await nextStepFor(root, folder), null));
  });

  it('Queue handoff gives the same block', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-paste-queue-'));
    tmpDirs.push(root);
    await scaffoldProject(root);
    await write(
      root,
      'openspec/queue.md',
      '## [demo] Demo\nDepends on: nothing\n\nBrief body for demo.\n',
    );
    await fs.writeFile(
      path.join(root, 'osq.config.ts'),
      "export default { harness: 'mock', queue: { maxPlanningSessions: 10, maxPlanningCost: 100 } };\n",
      'utf8',
    );
    assert.ok(await exists(path.join(root, '.claude', 'commands', 'osq-plan.md')));

    const stdout = await captureStdout(() => planCommand(undefined, { next: true, cwd: root }));

    const folder = path.join(root, 'openspec', 'changes', '001-demo');
    assert.equal(stdout, expectedHandoff(folder, await nextStepFor(root, folder), '001'));
  });
});

describe('cli-foundation: Steered change in its worktree', () => {
  it('Steered change in its worktree', async () => {
    const project = await setupWorktree();
    await markDone(project.worktreeFolder, '1');
    await markBlocked(project.worktreeFolder, '2', 'Needs src/three.txt');
    await write(project.repo, '.claude/commands/osq-plan.md', '# osq plan\n');

    const stdout = await captureStdout(() => planCommand('001', { cwd: project.repo }));

    const folder = project.worktreeFolder;
    const promptPath = path.join(folder, 'plan-prompt.md');
    assert.ok(
      stdout.startsWith(
        `${folder}: ask your planning tool to plan change ${CHANGE_ID} \u2014 next: `,
      ),
      stdout,
    );
    assert.ok(stdout.includes('You are the planner for osq change 001-order-flow.\n'), stdout);
    assert.ok(
      stdout.includes(`Read ${promptPath} and follow it exactly; it is your complete prompt.\n`),
      stdout,
    );
    assert.equal(stdout.includes('/osq-plan'), false, stdout);
  });
});

/** A committed temp repository with one two-task change approved into a worktree. */
async function setupWorktree(): Promise<{
  repo: string;
  worktree: string;
  worktreeFolder: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-paste-worktree-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
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
  const config: OsqConfig = defineConfig({ vcs });
  const result = await approveSpec(repo, '001', config);
  const worktree = result.worktreePath;
  assert.ok(worktree, 'approval created a worktree');
  return { repo, worktree, worktreeFolder: path.join(worktree, CHANGE_REL) };
}

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
