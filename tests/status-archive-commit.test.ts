import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { scenario } from '@matteeh/osq/testing';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { readDispatchItems } from '../src/core/status/dispatch-items.js';
import { readInbox } from '../src/core/status/inbox-projection.js';
import { formatInboxText } from '../src/core/status/inbox.js';
import { formatNextStep, readNextStep } from '../src/core/status/next-step.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGES = path.posix.join('openspec', 'changes');
const TWO_SCOPE = 'src/two.txt';
const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHANGE_DIR = '302-archive-commit-recovery';

// The living status spec repeats a scenario name, so the helper's global lookup
// cannot read it. Prove this change's delta over a clean base spec instead.
const LOOKUP_ROOT = fsSync.mkdtempSync(path.join(os.tmpdir(), 'osq-status-archive-spec-'));
const livingSpec = path.join(LOOKUP_ROOT, 'openspec', 'specs', 'status-inspection', 'spec.md');
fsSync.mkdirSync(path.dirname(livingSpec), { recursive: true });
fsSync.writeFileSync(
  livingSpec,
  [
    '# status-inspection Specification',
    '',
    '## Purpose',
    '',
    'Status inspection.',
    '',
    '## Requirements',
    '',
    '### Requirement: Next step detail and format',
    'Old.',
    '',
    '### Requirement: Change next step',
    'Old.',
    '',
  ].join('\n'),
  'utf8',
);
const deltaSource = path.join(
  REPO_ROOT,
  'openspec',
  'changes',
  'archive',
  CHANGE_DIR,
  'specs',
  'status-inspection',
  'spec.md',
);
const deltaTarget = path.join(
  LOOKUP_ROOT,
  'openspec',
  'changes',
  CHANGE_DIR,
  'specs',
  'status-inspection',
  'spec.md',
);
fsSync.mkdirSync(path.dirname(deltaTarget), { recursive: true });
fsSync.copyFileSync(deltaSource, deltaTarget);
process.chdir(LOOKUP_ROOT);
process.env.OSQ_CHANGE = path.join(LOOKUP_ROOT, 'openspec', 'changes', CHANGE_DIR);
const COMMIT_FAILED_MARKER = '---\nreason: commit_failed\n---\nblocked by hook\n';
const SYNC_CONFLICT_MARKER = '---\nreason: sync_conflict\n---\nconflict\n';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

after(() => {
  process.chdir(REPO_ROOT);
  fsSync.rmSync(LOOKUP_ROOT, { recursive: true, force: true });
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

async function writeAt(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

interface ChangeDef {
  readonly folder: string;
  readonly title: string;
  readonly capability: string;
  readonly scope: string;
  readonly delta: string;
}

const ORDERS: ChangeDef = {
  folder: '002-orders',
  title: 'Orders',
  capability: 'orders',
  scope: TWO_SCOPE,
  delta: `# Spec Delta: orders

## ADDED Requirements

### Requirement: Order totals
The system SHALL total orders.

#### Scenario: Totals
- **WHEN** an order arrives
- **THEN** it is totalled
`,
};

const ORDERS_SPEC = `# orders Specification

## Purpose

Orders are totalled.

## Requirements

### Requirement: Existing orders
The system SHALL keep orders.
`;

const PROPOSAL = [
  '---',
  'title: Orders',
  'depends_on: []',
  'verify: node verify.cjs',
  'features:',
  '  reads: []',
  '---',
  '## Goal',
  'Run the task.',
  '',
  '## Surface',
  'None.',
  '',
  '## Human steps',
  'None',
  '',
].join('\n');

const TASK = [
  '---',
  'title: Orders task',
  'verify: node verify.cjs',
  `scope: ${JSON.stringify([TWO_SCOPE])}`,
  'entry: []',
  'skills: []',
  '---',
  '## Acceptance',
  '- [ ] does the thing',
  '',
].join('\n');

async function writeChange(folderPath: string, change: ChangeDef): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), PROPOSAL, 'utf8');
  await fs.writeFile(
    path.join(folderPath, 'tasks.md'),
    '# Tasks\n\n- [ ] 1. Orders task\n',
    'utf8',
  );
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), TASK, 'utf8');
  await writeAt(folderPath, path.posix.join('specs', change.capability, 'spec.md'), change.delta);
}

/** Fake adapter whose spawn edits the task's scoped file under its project root. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await fs.writeFile(path.join(options.projectRoot, TWO_SCOPE), 'task 1\n', 'utf8');
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(path.join(resultsDir, '1.md'), '# Agent result\n', 'utf8');
    return { exitCode: 0 };
  }
}

interface Project {
  readonly repo: string;
  readonly worktree: string;
  readonly archivedFolder: string;
  readonly config: OsqConfig;
  readonly home: string;
}

/** A committed temp repository whose change 002 is approved, run and archived in its worktree. */
async function setupProject(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-status-archive-commit-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktreeRoot = path.join(root, 'worktrees');
  const home = path.join(root, 'home');
  await fs.mkdir(home, { recursive: true });
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, 'src', 'seed.txt'), 'seed\n', 'utf8');
  await writeAt(repo, path.posix.join('openspec', 'specs', 'orders', 'spec.md'), ORDERS_SPEC);
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);
  await writeChange(path.join(repo, CHANGES, ORDERS.folder), ORDERS);

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot,
  };
  const config = defineConfig({
    vcs,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
  });
  const approval = await approveSpec(repo, '002', config);
  assert.ok(approval.worktreePath, 'approval created a worktree for 002');
  await runWatcherOnce(repo, config, new ActingAdapter());

  return {
    repo,
    worktree: approval.worktreePath,
    archivedFolder: path.join(
      approval.worktreePath,
      'openspec',
      'changes',
      'archive',
      ORDERS.folder,
    ),
    config,
    home,
  };
}

async function writeMarker(folderPath: string, content: string): Promise<void> {
  await writeAt(folderPath, path.posix.join('.run', 'regressed', 'change.md'), content);
}

scenario(
  'status-inspection',
  'Failed archive commit in show and the inbox',
  { covers: readNextStep },
  async ({ run, then }) => {
    const project = await setupProject();
    await writeMarker(project.archivedFolder, COMMIT_FAILED_MARKER);

    await then(
      'its next step formats as `dead (archive commit failed) — osq retry 002 change`, `osq --json` holds one needs-you `change-regressed` item for it with command `osq retry 002 change` and no `change-archived` item, its inbox text row is `  002: Orders — change regressed — osq retry 002 change`, and `readDispatchItems` holds one `halt` item for 002 with the commands `osq retry 002 change` and `osq show 002` and no `land` item',
      async () => {
        const step = await run(project.repo, project.archivedFolder, project.config);
        assert.deepEqual(step, {
          state: 'dead',
          command: 'osq retry 002 change',
          detail: 'archive commit failed',
        });
        assert.equal(formatNextStep(step), 'dead (archive commit failed) — osq retry 002 change');

        const inbox = await readInbox(project.repo, { config: project.config, home: project.home });
        const items = inbox.needsYou.filter((item) => item.change.id === '002');
        assert.equal(items.length, 1);
        assert.equal(items[0]?.kind, 'change-regressed');
        assert.equal(items[0]?.command, 'osq retry 002 change');
        assert.equal(
          inbox.needsYou.some(
            (item) => item.change.id === '002' && item.kind === 'change-archived',
          ),
          false,
        );
        const text = formatInboxText(inbox);
        assert.ok(text.includes('  002: Orders — change regressed — osq retry 002 change'), text);

        const dispatch = await readDispatchItems(project.repo, project.config);
        const halts = dispatch.items.filter((item) => item.change.id === '002');
        assert.equal(halts.length, 1);
        assert.equal(halts[0]?.kind, 'halt');
        assert.equal(halts[0]?.task, null);
        assert.deepEqual(halts[0]?.commands, ['osq retry 002 change', 'osq show 002']);
        assert.equal(
          dispatch.items.some((item) => item.kind === 'land' && item.change.id === '002'),
          false,
        );
      },
    );
  },
);

scenario(
  'status-inspection',
  'Other archived halts unchanged',
  { covers: readNextStep },
  async ({ run, then }) => {
    const project = await setupProject();
    await writeMarker(project.archivedFolder, SYNC_CONFLICT_MARKER);

    await then(
      'its next step command is still `osq plan 002` and its inbox row is still the steering row',
      async () => {
        const step = await run(project.repo, project.archivedFolder, project.config);
        assert.equal(step.state, 'dead');
        assert.equal(step.command, 'osq plan 002');

        const inbox = await readInbox(project.repo, { config: project.config, home: project.home });
        const text = formatInboxText(inbox);
        assert.ok(
          text.includes('  002: Orders — needs steering: conflict (sync_conflict) — osq plan 002'),
          text,
        );
      },
    );
  },
);
