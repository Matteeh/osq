import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { planCommand } from '../src/cli/plan.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { readAutoSteerRecord } from '../src/core/run/auto-steer-record.js';
import { readPlanRunRecord } from '../src/core/run/plan-run-record.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { hashChangeFolder } from '../src/core/spec/hasher.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGE_REL = path.posix.join('openspec', 'changes', '001-order-flow');
const SENTINEL = 'node -e "process.exit(0)"';

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

class RecordingAdapter implements HarnessAdapter {
  readonly name = 'recording';
  readonly calls: SpawnTaskOptions[] = [];

  constructor(
    private readonly action: (options: SpawnTaskOptions) => Promise<SpawnResult> = async () => ({
      exitCode: 0,
    }),
  ) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.calls.push({ ...options });
    return this.action(options);
  }
}

interface Project {
  readonly repo: string;
  readonly worktrees: string;
  readonly config: OsqConfig;
}

async function setupRepo(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-run-worker-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);
  const config = defineConfig({
    vcs: { enabled: true, author: 'Osq <osq@example.invalid>', worktreeRoot: worktrees },
  });
  return { repo, worktrees, config };
}

/** Unapproved change 001-order-flow in the checkout, with a brief. */
async function createDraft(project: Project): Promise<string> {
  const spec = await createNewSpec(project.repo, 'Order Flow', { config: project.config });
  await fs.writeFile(path.join(spec.folderPath, 'brief.md'), 'Brief body.\n', 'utf8');
  return spec.folderPath;
}

/** A version of `content` whose frontmatter verify runs the local verifier. */
function cleanVerify(content: string): string {
  return content.replace(/^verify:.*$/m, 'verify: node verify.cjs');
}

function taskMarkdown(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'verify: node verify.cjs',
    'scope: ["src/two.txt"]',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] does the thing',
    '',
  ].join('\n');
}

async function writeApprovedChange(project: Project): Promise<string> {
  const folder = path.join(project.repo, CHANGE_REL);
  await fs.mkdir(path.join(folder, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(folder, 'proposal.md'),
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
  await fs.writeFile(path.join(folder, 'tasks.md'), '# Tasks\n\n- [ ] 1. First task\n', 'utf8');
  await fs.writeFile(path.join(folder, 'brief.md'), 'Revise the blocked task.\n', 'utf8');
  await fs.writeFile(path.join(folder, 'tasks', '1.md'), taskMarkdown('First task'), 'utf8');
  await fs.writeFile(path.join(folder, 'tasks', '2.md'), taskMarkdown('Second task'), 'utf8');
  return folder;
}

async function markDone(folderPath: string, taskNumber: string): Promise<void> {
  const dir = path.join(folderPath, '.run', 'done');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, taskNumber), '', 'utf8');
}

async function markBlocked(folderPath: string, taskNumber: string): Promise<void> {
  const dir = path.join(folderPath, '.run', 'dead');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${taskNumber}.md`), '---\nreason: blocked\n---\nNeeds one\n');
}

async function readChangeEvents(folderPath: string): Promise<Array<{ type: string }>> {
  const file = path.join(folderPath, '.run', 'events', 'change.jsonl');
  const content = await fs.readFile(file, 'utf8').catch(() => '');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as { type: string });
}

async function runWorker(project: Project, adapter: HarnessAdapter, notes?: string): Promise<void> {
  await planCommand('001', {
    cwd: project.repo,
    config: project.config,
    run: true,
    planRunRole: 'worker',
    adapter,
    ...(notes !== undefined ? { notes } : {}),
    stdout: () => {},
    stderr: () => {},
  });
}

/** The planner that rewrites the change's plan files and strays in its tree. */
function scratchPlanner(): RecordingAdapter {
  return new RecordingAdapter(async (options) => {
    const proposal = await fs.readFile(path.join(options.specFolderPath, 'proposal.md'), 'utf8');
    await fs.writeFile(
      path.join(options.specFolderPath, 'proposal.md'),
      cleanVerify(proposal),
      'utf8',
    );
    const task = await fs.readFile(path.join(options.specFolderPath, 'tasks', '1.md'), 'utf8');
    await fs.writeFile(
      path.join(options.specFolderPath, 'tasks', '1.md'),
      cleanVerify(task),
      'utf8',
    );
    await fs.mkdir(path.join(options.projectRoot, 'src'), { recursive: true });
    await fs.writeFile(path.join(options.projectRoot, 'src', 'stray.txt'), 'stray\n', 'utf8');
    return { exitCode: 0 };
  });
}

describe('plan run worker', () => {
  it('Planned in a scratch tree', async () => {
    const project = await setupRepo();
    const folder = await createDraft(project);

    await runWorker(project, scratchPlanner());

    const proposal = await fs.readFile(path.join(folder, 'proposal.md'), 'utf8');
    assert.ok(proposal.includes('verify: node verify.cjs'), proposal);
    assert.equal(
      await fs
        .stat(path.join(folder, 'tasks', '1.md'))
        .then(() => true)
        .catch(() => false),
      true,
    );

    const record = await readPlanRunRecord(folder);
    assert.equal(record?.outcome, 'ready');
    assert.equal(record?.hash, await hashChangeFolder(folder));
    assert.equal(await exists(path.join(project.repo, 'src', 'stray.txt')), false);
    assert.equal(
      await exists(path.join(project.worktrees, 'repo', '.planning', '001-order-flow')),
      false,
    );
  });

  it('Scratch planner outcomes', async () => {
    const rows: Array<{
      readonly label: string;
      readonly planner: (folder: string) => RecordingAdapter;
      readonly outcome: string;
    }> = [
      {
        label: 'exits 1',
        planner: () => new RecordingAdapter(async () => ({ exitCode: 1, error: 'boom' })),
        outcome: 'failed',
      },
      {
        label: 'returns timedOut',
        planner: () => new RecordingAdapter(async () => ({ exitCode: 1, timedOut: true })),
        outcome: 'timed_out',
      },
      {
        label: 'exits 0 without an edit',
        planner: () => new RecordingAdapter(async () => ({ exitCode: 0 })),
        outcome: 'unchanged',
      },
      {
        label: 'keeps the sentinel verify',
        planner: () =>
          new RecordingAdapter(async (options) => {
            const task = await fs.readFile(
              path.join(options.specFolderPath, 'tasks', '1.md'),
              'utf8',
            );
            const edited = task.replace('Acceptance criterion 1', 'still does the thing');
            assert.ok(edited.includes(SENTINEL), edited);
            await fs.writeFile(path.join(options.specFolderPath, 'tasks', '1.md'), edited, 'utf8');
            return { exitCode: 0 };
          }),
        outcome: 'lint_red',
      },
    ];

    for (const row of rows) {
      const project = await setupRepo();
      const folder = await createDraft(project);

      await runWorker(project, row.planner(folder));

      const record = await readPlanRunRecord(folder);
      assert.equal(record?.outcome, row.outcome, row.label);
    }
  });

  it('Steered in place', async () => {
    const project = await setupRepo();
    const checkoutFolder = await writeApprovedChange(project);
    const result = await approveSpec(project.repo, '001', project.config);
    assert.ok(result.worktreePath, 'approval created a worktree');
    const worktreeFolder = path.join(result.worktreePath, CHANGE_REL);
    assert.equal(await exists(checkoutFolder), false);
    await markDone(worktreeFolder, '1');
    await markBlocked(worktreeFolder, '2');

    const planner = new RecordingAdapter(async (options) => {
      await fs.writeFile(
        path.join(options.specFolderPath, 'tasks', '2.md'),
        taskMarkdown('Second task revised'),
        'utf8',
      );
      return { exitCode: 0 };
    });

    await runWorker(project, planner);

    const record = await readAutoSteerRecord(worktreeFolder);
    assert.equal(record?.outcome, 'ready');
    assert.deepEqual(record?.changed, ['tasks/2.md']);
    const runs = (await readChangeEvents(worktreeFolder)).filter(
      (event) => event.type === 'auto_steer_ran',
    );
    assert.equal(runs.length, 1);
  });

  it('Notes reach the prompt', async () => {
    const project = await setupRepo();
    await createDraft(project);
    const planner = new RecordingAdapter(async () => ({ exitCode: 0 }));

    await runWorker(project, planner, 'use the cache');

    const prompt = planner.calls[0]?.prompt ?? '';
    assert.ok(prompt.endsWith('\n\n## Notes from the human\n\nuse the cache'), prompt);
  });
});
