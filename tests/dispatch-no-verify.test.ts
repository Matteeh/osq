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
import { readDispatchCard } from '../src/core/status/dispatch-cards.js';
import { type DispatchItem, readDispatchItems } from '../src/core/status/dispatch-items.js';
import { cardKeys } from '../src/core/status/dispatch-keys.js';
import { formatDispatchCardBody } from '../src/core/status/dispatch-text.js';
import { readDispatch } from '../src/core/status/dispatch.js';
import { readInbox } from '../src/core/status/inbox-projection.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGES = path.posix.join('openspec', 'changes');
const IN_SCOPE = 'src/one.txt';

const dirs: string[] = [];

afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

interface ProposalOptions {
  readonly goal?: string;
  readonly check?: string;
  readonly humanSteps?: string;
}

function proposalMd(title: string, options: ProposalOptions = {}): string {
  const lines = ['---', `title: ${title}`, 'depends_on: []', 'verify: node verify.cjs'];
  if (options.check !== undefined) lines.push(`check: ${options.check}`);
  lines.push('---', '## Goal', options.goal ?? `${title} goal.`, '', '## Surface', 'None.', '');
  if (options.humanSteps !== undefined) {
    lines.push('## Human steps', '', '### After landing', options.humanSteps, '');
  }
  return lines.join('\n');
}

function taskMd(title: string, scope: readonly string[] = []): string {
  return [
    '---',
    `title: ${title}`,
    'verify: node verify.cjs',
    `scope: ${JSON.stringify(scope)}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    `- [ ] ${title} criterion`,
    '',
  ].join('\n');
}

async function writeAt(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function createChange(root: string, folderName: string, title: string): Promise<string> {
  const dir = path.join(root, CHANGES, folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(title), 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), taskMd('Task one'), 'utf8');
  return dir;
}

async function approve(folderPath: string): Promise<void> {
  await fs.mkdir(path.join(folderPath, '.run'), { recursive: true });
  await fs.writeFile(path.join(folderPath, '.run', 'approved'), 'sha256:fixture\n', 'utf8');
}

async function createArchived(
  root: string,
  folderName: string,
  options: ProposalOptions = {},
): Promise<string> {
  const dir = path.join(root, CHANGES, 'archive', folderName);
  await fs.mkdir(path.join(dir, '.run', 'events'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(folderName, options), 'utf8');
  const data = {
    archivePath: dir,
    verification: { afterLanding: true, check: options.check ?? null },
  };
  await writeAt(
    dir,
    path.posix.join('.run', 'events', 'change.jsonl'),
    `${JSON.stringify({ type: 'archived', timestamp: '2026-01-01T00:00:00.000Z', data })}\n`,
  );
  return dir;
}

describe('dispatch without verification', () => {
  it('lists each kind and no item for an archived change', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-no-verify-kinds-'));
    dirs.push(root);
    await createChange(root, '001-approval', 'Approval change');
    const dead = await createChange(root, '002-dead', 'Dead change');
    await approve(dead);
    await writeAt(
      dead,
      path.posix.join('.run', 'dead', '1.md'),
      '---\nreason: verify_red\n---\nboom\n',
    );
    await createArchived(root, '003-checks', {
      check: 'node check.cjs',
      humanSteps: 'Tell support the export moved.',
    });

    const dispatch = await readDispatchItems(root, defineConfig({}));

    assert.deepEqual(
      dispatch.items.map((item) => item.kind),
      ['approval', 'halt'],
    );
    assert.deepEqual(
      dispatch.items.map((item) => item.change.id),
      ['001', '002'],
    );
    assert.deepEqual(dispatch.items[0].commands, ['osq approve 001', 'osq show 001']);
    assert.deepEqual(dispatch.items[1].commands, ['osq retry 002 1', 'osq show 002']);
    assert.equal(
      dispatch.items.some((item) => item.change.id === '003'),
      false,
    );
  });

  it('adds no needs-you item for an archived change with after-landing steps', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-no-verify-inbox-'));
    dirs.push(root);
    await createArchived(root, '003-checks', {
      check: 'node check.cjs',
      humanSteps: 'Tell support the export moved.',
    });

    const inbox = await readInbox(root, { config: defineConfig({}), home: root });

    assert.deepEqual(inbox.needsYou, []);
  });

  it('keeps check and verified commands manual with only s as a key', () => {
    const item: DispatchItem = {
      kind: 'land',
      change: { id: '012', folder: '012-checks', title: 'Checks', folderPath: '/tmp/012-checks' },
      task: null,
      commands: ['osq check 012', 'osq verified 012 --passed|--failed', 'osq show 012'],
    };

    const mapped = cardKeys(item);

    assert.deepEqual(
      mapped.keys.map((key) => key.key),
      ['s'],
    );
    assert.deepEqual(mapped.keys[0]?.args, ['show', '012']);
    assert.deepEqual(mapped.manual, ['osq check 012', 'osq verified 012 --passed|--failed']);
  });
});

describe('worktree land card without verification', () => {
  it('holds the check and after-landing steps after the squash message', async () => {
    const project = await setupWorktreeProject();
    const adapter = new ActingAdapter();
    await runWatcherCycle(project.repo, project.config, adapter);
    await runWatcherCycle(project.repo, project.config, adapter);

    const home = path.join(project.repo, '.home');
    const preview = await readDispatch(project.repo, project.config, home);
    const item = preview.items.find((candidate) => candidate.kind === 'land');
    assert.ok(item, 'a land item exists');
    const card = await readDispatchCard(project.repo, project.config, item);
    assert.equal(card.kind, 'land');
    if (card.kind !== 'land') return;

    assert.equal(card.check, 'node check.cjs');
    assert.match(card.afterLanding, /Tell support the export moved\./);
    const body = formatDispatchCardBody(item, card).join('\n');
    const squashAt = body.indexOf('squash:');
    const checkAt = body.indexOf('check: node check.cjs');
    const landingAt = body.indexOf('after landing:');
    assert.ok(squashAt >= 0, body);
    assert.ok(checkAt > squashAt, body);
    assert.ok(landingAt > checkAt, body);
    assert.match(body, /Osq-Change: 001-order-flow/);
  });
});

/** The git helpers copy `tests/dispatch-cards.test.ts` so the worktree case is real. */
function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) {
    Reflect.deleteProperty(env, key);
  }
  return env;
}

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync('git', args, { cwd, env: cleanGitEnv() });
}

interface WorktreeProject {
  readonly repo: string;
  readonly config: OsqConfig;
}

/** A committed repo with one approved change in a linked worktree. */
async function setupWorktreeProject(): Promise<WorktreeProject> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-no-verify-worktree-'));
  dirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.writeFile(path.join(repo, 'check.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, IN_SCOPE), 'seed\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const folder = '001-order-flow';
  const dir = path.join(repo, CHANGES, folder);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'proposal.md'),
    proposalMd('Order Flow', {
      goal: 'Run the tasks.',
      check: 'node check.cjs',
      humanSteps: 'Tell support the export moved.',
    }),
    'utf8',
  );
  await fs.writeFile(path.join(dir, 'tasks.md'), '# Tasks\n\n- [ ] 1. First task\n', 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), taskMd('First task', [IN_SCOPE]), 'utf8');

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({
    vcs,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
  });
  const result = await approveSpec(repo, folder, config);
  assert.ok(result.worktreePath, 'approval created a worktree');
  return { repo, config };
}

/** Fake adapter whose spawn edits the task's scoped file under its project root. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    const target = options.scope[0] ?? IN_SCOPE;
    await fs.writeFile(
      path.join(options.projectRoot, target),
      `task ${options.taskNumber}\n`,
      'utf8',
    );
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
