import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { scenario } from '@matteeh/osq/testing';
import { planCommand } from '../src/cli/plan.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import {
  type ChangeFolderSnapshot,
  deriveSpecState,
  readChangeFolder,
} from '../src/core/status/state.js';
import { deriveSteering, describeTrigger, humanSteering } from '../src/core/status/steering.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHANGE_SLUG = '308-steer-dead-task';
const CHANGE_REL = path.posix.join('openspec', 'changes', '001-order-flow');
const WORKTREES = 'worktrees';

const tmpDirs: string[] = [];
let lookupRoot: string | null = null;
let previousChange: string | undefined;

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

/** Rename every repeated scenario header but its first, so lookup accepts the living copy. */
function dedupeScenarioNames(content: string): string {
  const seen = new Map<string, number>();
  return content
    .split('\n')
    .map((line) => {
      const match = /^(####\s+(?:Scenario:\s*)?)(.*)$/.exec(line);
      if (match === null) return line;
      const name = (match[2] ?? '').trim();
      const count = (seen.get(name) ?? 0) + 1;
      seen.set(name, count);
      return count === 1 ? line : `${match[1]}${name} (${count})`;
    })
    .join('\n');
}

/** A lookup root with the real living specs deduped and this change's deltas merged. */
async function setupLookupRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-steering-dead-lookup-'));
  lookupRoot = root;
  const openspec = path.join(root, 'openspec');
  for (const capability of ['status-inspection', 'cli-foundation']) {
    const specDir = path.join(openspec, 'specs', capability);
    await fs.mkdir(specDir, { recursive: true });
    const living = await fs.readFile(
      path.join(REPO_ROOT, 'openspec', 'specs', capability, 'spec.md'),
      'utf8',
    );
    await fs.writeFile(path.join(specDir, 'spec.md'), dedupeScenarioNames(living), 'utf8');
    const deltaDir = path.join(openspec, 'changes', CHANGE_SLUG, 'specs', capability);
    await fs.mkdir(deltaDir, { recursive: true });
    await fs.copyFile(
      path.join(
        REPO_ROOT,
        'openspec',
        'changes',
        'archive',
        CHANGE_SLUG,
        'specs',
        capability,
        'spec.md',
      ),
      path.join(deltaDir, 'spec.md'),
    );
  }
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

function proposalMarkdown(): string {
  return [
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
  ].join('\n');
}

function taskMarkdown(title: string, scope: string): string {
  return [
    '---',
    `title: ${title}`,
    'verify: node verify.cjs',
    `scope: ${JSON.stringify([scope])}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] does the thing',
    '',
  ].join('\n');
}

/** A change folder with two tasks and a brief. */
async function writeChange(folderPath: string): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMarkdown(), 'utf8');
  await fs.writeFile(path.join(folderPath, 'brief.md'), '# Brief\n\nRevise the plan.\n', 'utf8');
  await fs.writeFile(
    path.join(folderPath, 'tasks.md'),
    '# Tasks\n\n- [ ] 1. Task 1\n- [ ] 2. Task 2\n',
    'utf8',
  );
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMarkdown('Task 1', 'src/one.txt'));
  await fs.writeFile(path.join(folderPath, 'tasks', '2.md'), taskMarkdown('Task 2', 'src/two.txt'));
}

/** A committed temp repository with one two-task change approved into a worktree. */
async function setupWorktree(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-steering-dead-plan-'));
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

  await writeChange(path.join(repo, CHANGE_REL));
  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({ vcs });
  const result = await approveSpec(repo, '001', config);
  const worktree = result.worktreePath;
  assert.ok(worktree, 'approval created a worktree');
  return { repo, worktree, worktreeFolder: path.join(worktree, CHANGE_REL), config };
}

async function markDone(folderPath: string, taskNumber: string): Promise<void> {
  const dir = path.join(folderPath, '.run', 'done');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, taskNumber), '', 'utf8');
}

async function markDead(folderPath: string, taskNumber: string, reason: string, body: string) {
  const dir = path.join(folderPath, '.run', 'dead');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${taskNumber}.md`), `---\nreason: ${reason}\n---\n${body}\n`);
}

async function activeFolders(repo: string): Promise<string[]> {
  const entries = await fs.readdir(path.join(repo, 'openspec', 'changes'));
  return entries.filter((entry) => entry !== 'archive' && entry !== 'rejected').sort();
}

async function snapshot(folderPath: string): Promise<ChangeFolderSnapshot> {
  return readChangeFolder(path.dirname(path.dirname(path.dirname(folderPath))), folderPath);
}

/** Every file under `root`, excluding git metadata and installed packages. */
async function treeSnapshot(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const walk = async (dir: string, relative: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      const child = relative === '' ? entry.name : path.posix.join(relative, entry.name);
      if (entry.isDirectory()) {
        await walk(full, child);
      } else if (entry.isSymbolicLink()) {
        files[child] = `link:${await fs.readlink(full)}`;
      } else if (entry.isFile()) {
        files[child] = (await fs.readFile(full)).toString('base64');
      }
    }
  };
  await walk(root, '');
  return files;
}

scenario(
  'status-inspection',
  'Dead task without a trigger',
  { covers: humanSteering },
  async ({ run, then }) => {
    const project = await setupWorktree();
    await markDone(project.worktreeFolder, '1');
    await markDead(project.worktreeFolder, '2', 'timeout', 'Agent timed out');
    const state = deriveSpecState(await snapshot(project.worktreeFolder));

    const triggers = run(state);

    await then(
      '`deriveSteering` returns no trigger, and `humanSteering` returns `[{ target: "2", trigger: "dead", reason: "timeout" }]`, which `describeTrigger` renders as `task 2 dead (timeout)`',
      async () => {
        const current = await snapshot(project.worktreeFolder);
        assert.deepEqual(deriveSteering(current), []);
        assert.deepEqual(triggers, [{ target: '2', trigger: 'dead', reason: 'timeout' }]);
        assert.equal(describeTrigger(triggers[0]), 'task 2 dead (timeout)');
      },
    );
  },
);

scenario(
  'status-inspection',
  'Run triggers win',
  { covers: humanSteering },
  async ({ run, then }) => {
    const project = await setupWorktree();
    await markDead(project.worktreeFolder, '1', 'blocked', 'Needs src/three.txt');
    await markDead(project.worktreeFolder, '2', 'timeout', 'Agent timed out');
    const state = deriveSpecState(await snapshot(project.worktreeFolder));

    const triggers = run(state);

    await then(
      '`humanSteering` returns only the `blocked` trigger for task 1, the same list as `deriveSteering`',
      async () => {
        const current = await snapshot(project.worktreeFolder);
        assert.deepEqual(triggers, [{ target: '1', trigger: 'blocked', reason: 'blocked' }]);
        assert.deepEqual(triggers, deriveSteering(current));
      },
    );
  },
);

scenario('status-inspection', 'Nothing died', { covers: humanSteering }, async ({ run, then }) => {
  const project = await setupWorktree();
  await markDone(project.worktreeFolder, '1');
  const state = deriveSpecState(await snapshot(project.worktreeFolder));

  const triggers = run(state);

  await then('`humanSteering` returns an empty list', () => {
    assert.deepEqual(triggers, []);
  });
});

scenario(
  'cli-foundation',
  'Plan a dead task in its worktree',
  { covers: planCommand },
  async ({ run, then }) => {
    const project = await setupWorktree();
    await markDone(project.worktreeFolder, '1');
    await markDead(project.worktreeFolder, '2', 'timeout', 'Agent timed out');

    await captureStdout(() => run('001', { cwd: project.repo }));

    await then(
      "the worktree's change folder holds `plan-prompt.md` ending in the `## Steering` section with `A task of this change died, and a human asked to revise its plan.`, `### task 2 dead (timeout)`, the dead marker's path, `Agent timed out`, and `Done tasks stay done: 1.`, the checkout holds no copy of the change, and no new change folder was created",
      async () => {
        const prompt = await fs.readFile(
          path.join(project.worktreeFolder, 'plan-prompt.md'),
          'utf8',
        );
        const section = prompt.slice(prompt.indexOf('## Steering'));
        assert.ok(section.startsWith('## Steering'));
        assert.ok(
          section.includes('A task of this change died, and a human asked to revise its plan.'),
        );
        assert.ok(section.includes('### task 2 dead (timeout)'));
        assert.ok(
          section.includes(
            `Evidence: ${path.join(project.worktreeFolder, '.run', 'dead', '2.md')}`,
          ),
        );
        assert.ok(section.includes('Agent timed out'));
        assert.ok(section.includes('Done tasks stay done: 1.'));
        assert.equal(await exists(path.join(project.repo, CHANGE_REL)), false);
        assert.deepEqual(await activeFolders(project.repo), []);
      },
    );
  },
);

scenario(
  'cli-foundation',
  'Approved change needs no steering',
  { covers: planCommand },
  async ({ run, then }) => {
    const project = await setupWorktree();
    const worktreeBefore = await treeSnapshot(project.worktree);
    const checkoutBefore = await treeSnapshot(project.repo);
    let failure: unknown;

    try {
      await captureStdout(() => run('001', { cwd: project.repo }));
    } catch (error) {
      failure = error;
    }

    await then(
      'the command fails with `needs no steering` and no file changes in the worktree or the checkout',
      async () => {
        assert.ok(failure instanceof Error);
        assert.match(failure.message, /needs no steering/);
        assert.deepEqual(await treeSnapshot(project.worktree), worktreeBefore);
        assert.deepEqual(await treeSnapshot(project.repo), checkoutBefore);
      },
    );
  },
);
