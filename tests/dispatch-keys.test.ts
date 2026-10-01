import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { readDispatchCard } from '../src/core/status/dispatch-cards.js';
import { readDispatchItems } from '../src/core/status/dispatch-items.js';
import { cardKeys, formatCardScreen } from '../src/core/status/dispatch-keys.js';
import { orderDispatchItems } from '../src/core/status/dispatch-order.js';
import { formatDispatchCardBody } from '../src/core/status/dispatch-text.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGES = path.join('openspec', 'changes');
const IN_SCOPE = 'src/one.txt';

let tmpDir: string;
const created: string[] = [];

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-dispatch-keys-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  for (const dir of created.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

function proposalMd(title: string, verify = 'node verify.cjs'): string {
  return [
    '---',
    `title: ${title}`,
    'depends_on: []',
    `verify: ${verify}`,
    '---',
    '## Goal',
    `${title} goal.`,
    '',
  ].join('\n');
}

function taskMd(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'verify: node verify.cjs',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    `- [ ] ${title} criterion`,
    '',
  ].join('\n');
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

async function writeMarker(folderPath: string, rel: string, content: string): Promise<void> {
  const target = path.join(folderPath, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function itemOf(
  kind: string,
): Promise<import('../src/core/status/dispatch-items.js').DispatchItem> {
  const config = defineConfig({});
  const dispatch = await readDispatchItems(tmpDir, config);
  const item = dispatch.items.find((candidate) => candidate.kind === kind);
  assert.ok(item, `expected a ${kind} item`);
  return item;
}

describe('card keys', () => {
  it('maps an approval item to a, s, and no manual commands', async () => {
    await createChange(tmpDir, '001-base', 'Base');

    const item = await itemOf('approval');
    const mapped = cardKeys(item);

    assert.deepEqual(
      mapped.keys.map((key) => key.key),
      ['a', 's'],
    );
    assert.deepEqual(mapped.keys[0]?.args, ['approve', '001']);
    assert.equal(mapped.keys[0]?.label, 'osq approve 001');
    assert.equal(mapped.keys[0]?.asks, null);
    assert.deepEqual(mapped.keys[1]?.args, ['show', '001']);
    assert.deepEqual(mapped.manual, []);
  });

  it('maps a change-level halt to r, x asking for a reason, and s', async () => {
    const change = await createChange(tmpDir, '004-change', 'Change regression');
    await approve(change);
    await writeMarker(change, '.run/regressed/change.md', '---\nreason: worktree_dirty\n---\nx\n');

    const item = await itemOf('halt');
    assert.equal(item.task, null);
    const mapped = cardKeys(item);

    assert.deepEqual(
      mapped.keys.map((key) => key.key),
      ['r', 'x', 's'],
    );
    assert.deepEqual(mapped.keys[0]?.args, ['retry', '004', 'change']);
    const reject = mapped.keys[1];
    assert.equal(reject?.asks, 'reason');
    assert.deepEqual(reject?.args, ['reject', '004', '--reason']);
    assert.equal(reject?.label, 'osq reject 004 --reason <text>');
    assert.deepEqual(mapped.keys[2]?.args, ['show', '004']);
    assert.deepEqual(mapped.manual, []);
  });

  it('lists a land worktree command as manual and s as the only key', async () => {
    const project = await makeProject();
    await approveIntoWorktree(project, '001');
    await runWatcherOnce(project.repo, project.config, new ActingAdapter());

    const dispatch = await readDispatchItems(project.repo, project.config);
    const item = dispatch.items.find((candidate) => candidate.kind === 'land');
    assert.ok(item, 'expected a land item');
    const mapped = cardKeys(item);

    assert.deepEqual(
      mapped.keys.map((key) => key.key),
      ['s'],
    );
    assert.deepEqual(mapped.keys[0]?.args, ['show', '001']);
    assert.deepEqual(mapped.manual, ['osq land 001']);
  });
});

describe('card screen', () => {
  it('prints the header, the card body, the keys, and no actions block', async () => {
    await createChange(tmpDir, '001-base', 'Base');
    const config = defineConfig({});
    const dispatch = await readDispatchItems(tmpDir, config);
    const ordered = await orderDispatchItems(tmpDir, config, dispatch);
    const [item] = ordered;
    assert.ok(item, 'expected an ordered item');
    const card = await readDispatchCard(tmpDir, config, item);
    const screen = formatCardScreen(ordered.length, item, card, cardKeys(item));
    const lines = screen.split('\n');

    assert.equal(lines[0], 'Needs you (1):');
    assert.ok(screen.includes(formatDispatchCardBody(item, card).join('\n')));
    assert.ok(!screen.includes('Actions:'));
    const keysAt = lines.indexOf('Keys:');
    assert.ok(keysAt > 0);
    assert.deepEqual(lines.slice(keysAt + 1), [
      '  a  osq approve 001',
      '  s  osq show 001',
      '  n  skip',
      '  q  quit',
    ]);
    assert.ok(!screen.includes('Run yourself:'));
  });
});

/** The git helpers copy `tests/dispatch-items.test.ts` so the worktree case is real. */
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

interface ChangeDef {
  readonly folder: string;
  readonly title: string;
  readonly dependsOn: readonly string[];
}

const ONE: ChangeDef = { folder: '001-a', title: 'One', dependsOn: [] };

function proposalMarkdown(change: ChangeDef): string {
  return [
    '---',
    `title: ${change.title}`,
    `depends_on: [${change.dependsOn.map((id) => JSON.stringify(id)).join(', ')}]`,
    'verify: node verify.cjs',
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
}

function taskMarkdown(change: ChangeDef): string {
  return [
    '---',
    `title: ${change.title} task`,
    'verify: node verify.cjs',
    `scope: ${JSON.stringify([IN_SCOPE])}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] does the thing',
    '',
  ].join('\n');
}

async function writeChange(folderPath: string, change: ChangeDef): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMarkdown(change), 'utf8');
  await fs.writeFile(
    path.join(folderPath, 'tasks.md'),
    `# Tasks\n\n- [ ] 1. ${change.title}\n`,
    'utf8',
  );
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMarkdown(change), 'utf8');
}

interface Project {
  readonly root: string;
  readonly repo: string;
  readonly worktrees: string;
  readonly config: OsqConfig;
  readonly vcs: VcsConfig;
}

async function makeProject(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-dispatch-keys-worktree-'));
  created.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, IN_SCOPE), 'seed\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);
  await writeChange(path.join(repo, CHANGES, ONE.folder), ONE);

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({
    vcs,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off', autoRetries: 0 },
  });
  return { root, repo, worktrees, config, vcs };
}

/** Fake adapter whose spawn edits one scoped file under the spawn's project root. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await fs.writeFile(
      path.join(options.projectRoot, IN_SCOPE),
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

async function approveIntoWorktree(project: Project, folder: string): Promise<string> {
  const result = await approveSpec(project.repo, folder, project.config);
  assert.ok(result.worktreePath, `expected a worktree for ${folder}`);
  return result.worktreePath;
}
