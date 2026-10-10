import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG, type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { formatNextStep, readNextStep } from '../src/core/status/next-step.js';
import { formatShowText, getSpecDetails } from '../src/core/status/show.js';
import { formatStatusOverview, getStatusOverview } from '../src/core/status/status.js';

const execFileAsync = promisify(execFile);
const CHANGES = path.posix.join('openspec', 'changes');
const ARCHIVE = path.join(CHANGES, 'archive');
const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-landed-next-step-'));
  tmpDirs.push(root);
  return root;
}

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

function proposalMd(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    `${title} goal.`,
    '',
  ].join('\n');
}

function taskMd(): string {
  return [
    '---',
    'title: Only task',
    'verify: node verify.cjs',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] does the thing',
    '',
  ].join('\n');
}

/** Writes an archived change folder the way `setupWorktreeProject` does. */
async function writeArchivedChange(root: string, folder: string, title: string): Promise<string> {
  const folderPath = path.join(root, ARCHIVE, folder);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMd(title), 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMd(), 'utf8');
  await writeAt(folderPath, path.join('.run', 'approved'), 'sha256:fixture\n');
  await writeAt(
    folderPath,
    path.join('.run', 'events', 'change.jsonl'),
    `${JSON.stringify({
      type: 'archived',
      timestamp: '2026-01-01T00:00:00.000Z',
      data: { archivePath: folderPath },
    })}\n`,
  );
  return folderPath;
}

/** The `.run/regressed/change.md` marker and `regressed` event `osq land` records. */
async function writeSteeringStop(folderPath: string, worktree: string): Promise<void> {
  await writeAt(
    folderPath,
    path.join('.run', 'regressed', 'change.md'),
    '---\nreason: sync_conflict\n---\nconflict with main\n',
  );
  await fs.appendFile(
    path.join(folderPath, '.run', 'events', 'change.jsonl'),
    `${JSON.stringify({
      type: 'regressed',
      timestamp: '2026-01-02T00:00:00.000Z',
      data: { task: 'change', reason: 'sync_conflict', output: 'conflict with main' },
    })}\n`,
    'utf8',
  );
  await git(['add', '-A'], worktree);
  await git(['commit', '-qm', 'land stopped'], worktree);
}

interface ChangeDef {
  readonly folder: string;
  readonly title: string;
  readonly merge?: boolean;
  readonly steer?: boolean;
}

interface Project {
  readonly repo: string;
  readonly config: OsqConfig;
}

/** A committed temp repo with each change archived on its own `osq/` worktree. */
async function setupProject(changes: readonly ChangeDef[]): Promise<Project> {
  const root = await tempRoot();
  const repo = path.join(root, 'repo');
  await fs.mkdir(repo, { recursive: true });
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await fs.writeFile(path.join(repo, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const worktreeRoot = path.join(root, 'worktrees');
  for (const change of changes) {
    const worktree = path.join(worktreeRoot, 'repo', change.folder);
    await git(['worktree', 'add', '-q', '-b', `osq/${change.folder}`, worktree, 'main'], repo);
    const folderPath = await writeArchivedChange(worktree, change.folder, change.title);
    await git(['add', '-A'], worktree);
    await git(['commit', '-qm', `archive ${change.folder}`], worktree);
    if (change.steer) await writeSteeringStop(folderPath, worktree);
  }

  await fs.writeFile(path.join(repo, 'main1.txt'), 'one\n', 'utf8');
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'main1'], repo);

  for (const change of changes) {
    if (!change.merge) continue;
    await git(['merge', '--no-ff', '-m', `merge ${change.folder}`, `osq/${change.folder}`], repo);
  }

  const config = defineConfig({
    vcs: {
      enabled: true,
      author: 'Osq <osq@example.invalid>',
      worktreeRoot,
      defaultBranch: 'main',
    },
  });
  return { repo, config };
}

describe('Landed next step reads the default branch', () => {
  it('Archived change the default branch does not hold', async () => {
    const { repo, config } = await setupProject([{ folder: '007-pricing', title: 'Pricing' }]);
    const details = await getSpecDetails(repo, '007', config);

    assert.deepEqual(details.next, {
      state: 'archived',
      command: 'osq land 007',
      detail: 'not landed',
    });
    assert.equal(formatNextStep(details.next), 'archived (not landed) — osq land 007');
    assert.ok(formatShowText(details).includes('Next: archived (not landed) — osq land 007'));
  });

  it('Archived change the default branch holds', async () => {
    const { repo, config } = await setupProject([
      { folder: '007-pricing', title: 'Pricing', merge: true },
    ]);
    const details = await getSpecDetails(repo, '007', config);

    assert.deepEqual(details.next, { state: 'landed', command: null, detail: null });
    assert.ok(formatShowText(details).includes('Next: landed'));
    assert.ok(!formatShowText(details).includes('Not landed'));
  });

  it('Archived change without version control', async () => {
    const root = await tempRoot();
    const repo = path.join(root, 'repo');
    await fs.mkdir(repo, { recursive: true });
    await git(['init', '-q', '-b', 'main'], repo);
    await git(['config', 'user.name', 'osq'], repo);
    await git(['config', 'user.email', 'osq@example.invalid'], repo);
    await fs.writeFile(path.join(repo, 'seed.txt'), 'seed\n', 'utf8');
    await git(['add', '-A'], repo);
    await git(['commit', '-qm', 'seed'], repo);
    // Main does not hold the change: the folder is left untracked in the checkout.
    const folderPath = await writeArchivedChange(repo, '007-pricing', 'Pricing');

    const step = await readNextStep(repo, folderPath, DEFAULT_CONFIG);

    assert.deepEqual(step, { state: 'landed', command: null, detail: null });
  });
});

describe('Changes waiting to land in status', () => {
  it('Archived changes that have not landed', async () => {
    const { repo, config } = await setupProject([
      { folder: '007-pricing', title: 'Pricing' },
      { folder: '008-audit', title: 'Audit', merge: true },
      { folder: '009-billing', title: 'Billing' },
    ]);

    const overview = await getStatusOverview(repo, config);

    assert.deepEqual(overview.notLanded, [
      { id: '007', folderName: '007-pricing', title: 'Pricing' },
      { id: '009', folderName: '009-billing', title: 'Billing' },
    ]);

    const lines = formatStatusOverview(overview).split('\n');
    const archivedIndex = lines.indexOf('Archived specs: 3');
    assert.ok(archivedIndex >= 0, 'Archived specs line is present');
    assert.equal(lines[archivedIndex + 1], 'Not landed:');
    assert.equal(lines[archivedIndex + 2], '  007: Pricing — osq land 007');
    assert.equal(lines[archivedIndex + 3], '  009: Billing — osq land 009');
    assert.ok(!lines.some((line) => line.startsWith('  008:')));
  });

  it('Every archived change landed', async () => {
    const { repo, config } = await setupProject([
      { folder: '007-pricing', title: 'Pricing', merge: true },
    ]);

    const overview = await getStatusOverview(repo, config);

    assert.equal('notLanded' in overview, false);
    assert.ok(!formatStatusOverview(overview).includes('Not landed:'));
  });

  it('Not landed needs steering first', async () => {
    const { repo, config } = await setupProject([
      { folder: '007-pricing', title: 'Pricing', steer: true },
    ]);

    const overview = await getStatusOverview(repo, config);

    assert.equal('notLanded' in overview, false);
    assert.ok(!formatStatusOverview(overview).includes('Not landed:'));
    const details = await getSpecDetails(repo, '007', config);
    assert.deepEqual(details.next, {
      state: 'dead',
      command: 'osq plan 007',
      detail: 'needs steering',
    });
  });
});
