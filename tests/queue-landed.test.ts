import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { formatQueue, prepareQueuePlan, projectQueue } from '../src/core/status/queue.js';

const execFileAsync = promisify(execFile);
const OPENSPEC = 'openspec';
const QUEUE_REL = path.join(OPENSPEC, 'queue.md');
const ARCHIVE = path.join(OPENSPEC, 'changes', 'archive');

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
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

function proposalMd(title: string): string {
  return ['---', `title: ${title}`, 'depends_on: []', '---', '## Goal', `${title} goal.`, ''].join(
    '\n',
  );
}

function taskMd(): string {
  return [
    '---',
    'title: Task 1',
    'verify: node -e "process.exit(0)"',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] done',
    '',
  ].join('\n');
}

function briefMd(slug: string): string {
  return ['---', `queue_item: ${slug}`, '---', `Brief body for ${slug}.`, ''].join('\n');
}

/** The queue `tests/queue.test.ts` writes: `beta` depends on `alpha`. */
function queueContent(): string {
  return [
    '## [alpha] Alpha',
    'Depends on: nothing',
    '',
    'Brief body for alpha.',
    '',
    '## [beta] Beta',
    'Depends on: alpha',
    '',
    'Brief body for beta.',
    '',
  ].join('\n');
}

/** Writes change 007 for `alpha` archived in an `osq/007-alpha` worktree copy. */
async function writeArchivedChange(worktree: string, folder: string): Promise<void> {
  const base = path.join(worktree, ARCHIVE, folder);
  await fs.mkdir(path.join(base, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(base, 'proposal.md'), proposalMd('Alpha'), 'utf8');
  await fs.writeFile(path.join(base, 'tasks', '1.md'), taskMd(), 'utf8');
  await fs.writeFile(path.join(base, 'brief.md'), briefMd('alpha'), 'utf8');
  await writeAt(base, path.join('.run', 'approved'), 'sha256:fixture\n');
}

/** A committed repo whose queue lives on `main` and whose archive is on a branch. */
async function setupQueueProject(): Promise<{
  repo: string;
  config: OsqConfig;
  branch: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-queue-landed-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  await fs.mkdir(repo, { recursive: true });
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await writeAt(repo, QUEUE_REL, queueContent());
  await fs.writeFile(path.join(repo, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const folder = '007-alpha';
  const worktreeRoot = path.join(root, 'worktrees');
  const worktree = path.join(worktreeRoot, 'repo', folder);
  const branch = `osq/${folder}`;
  await git(['worktree', 'add', '-q', '-b', branch, worktree, 'main'], repo);
  await writeArchivedChange(worktree, folder);
  await git(['add', '-A'], worktree);
  await git(['commit', '-qm', 'archive'], worktree);

  await fs.writeFile(path.join(repo, 'main1.txt'), 'one\n', 'utf8');
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'main1'], repo);
  await fs.writeFile(path.join(repo, 'main2.txt'), 'two\n', 'utf8');
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'main2'], repo);

  const config = defineConfig({
    vcs: {
      enabled: true,
      author: 'Osq <osq@example.invalid>',
      worktreeRoot,
      defaultBranch: 'main',
    },
  });
  return { repo, config, branch };
}

function rowsBySlug(projection: Awaited<ReturnType<typeof projectQueue>>) {
  return new Map(projection.items.map((row) => [row.slug, row]));
}

describe('queue landed state', () => {
  it('shows an archived association the default branch lacks as archived and holds its dependent back', async () => {
    const { repo, config } = await setupQueueProject();

    const projection = await projectQueue(repo, config);
    const rows = rowsBySlug(projection);

    assert.equal(rows.get('alpha')?.state, 'archived');
    assert.equal(rows.get('alpha')?.changeId, '007');
    assert.deepEqual(rows.get('beta')?.unmetDependencies, ['alpha']);
    assert.equal(projection.landedCount, 0);

    const text = formatQueue(projection);
    assert.match(text, /alpha: Alpha \[archived\] change: 007/);
    assert.match(text, /beta: Beta \[unplanned\].* unmet: alpha/);

    const preparation = await prepareQueuePlan(repo, config);
    assert.equal(preparation.kind, 'refused');
    if (preparation.kind === 'refused') {
      assert.match(preparation.message, /No queue item is eligible to plan\./);
    }
  });

  it('shows the same association as landed once the default branch holds it', async () => {
    const { repo, config, branch } = await setupQueueProject();
    await git(['merge', '--no-edit', branch], repo);

    const projection = await projectQueue(repo, config);
    const rows = rowsBySlug(projection);

    assert.equal(rows.get('alpha')?.state, 'landed');
    assert.equal(rows.get('alpha')?.changeId, '007');
    assert.deepEqual(rows.get('beta')?.unmetDependencies, []);
    assert.equal(projection.landedCount, 1);

    const text = formatQueue(projection);
    assert.match(text, /alpha: Alpha \[landed\] change: 007/);
    assert.match(text, /beta: Beta \[unplanned\]/);

    const preparation = await prepareQueuePlan(repo, config);
    assert.equal(preparation.kind, 'ready');
    if (preparation.kind === 'ready') assert.equal(preparation.selection.item.slug, 'beta');
  });
});
