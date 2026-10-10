import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { needsYouKindLabel } from '../packages/ui/src/home/labels.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { readInbox } from '../src/core/status/inbox-projection.js';
import { formatInboxText } from '../src/core/status/inbox.js';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHANGES = path.posix.join('openspec', 'changes');
const ARCHIVE = path.join(CHANGES, 'archive');
const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-landed-'));
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
      data: { archivePath: `openspec/changes/archive/${folder}` },
    })}\n`,
  );
  return folderPath;
}

interface Project {
  readonly repo: string;
  readonly config: OsqConfig;
  readonly home: string;
}

/** A committed temp repo with change 007 archived on an `osq/` worktree branch. */
async function setupWorktreeProject(merge = false): Promise<Project> {
  const root = await tempRoot();
  const repo = path.join(root, 'repo');
  await fs.mkdir(repo, { recursive: true });
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await fs.writeFile(path.join(repo, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const folder = '007-pricing';
  const worktreeRoot = path.join(root, 'worktrees');
  const worktree = path.join(worktreeRoot, 'repo', folder);
  await git(['worktree', 'add', '-q', '-b', `osq/${folder}`, worktree, 'main'], repo);
  await writeArchivedChange(worktree, folder, 'Pricing');
  await git(['add', '-A'], worktree);
  await git(['commit', '-qm', 'archive 007-pricing'], worktree);

  await fs.writeFile(path.join(repo, 'main1.txt'), 'one\n', 'utf8');
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'main1'], repo);

  if (merge) {
    await git(['merge', '--no-ff', '-m', 'merge 007-pricing', `osq/${folder}`], repo);
  }

  const config = defineConfig({
    vcs: {
      enabled: true,
      author: 'Osq <osq@example.invalid>',
      worktreeRoot,
      defaultBranch: 'main',
    },
  });
  const home = path.join(root, 'home');
  return { repo, config, home };
}

describe('Archived change waiting to land', () => {
  it('projects a change-archived needs-you item and its text row', async () => {
    const { repo, config, home } = await setupWorktreeProject();
    const inbox = await readInbox(repo, { config, home });

    assert.deepEqual(inbox.needsYou, [
      {
        kind: 'change-archived',
        change: { id: '007', title: 'Pricing' },
        task: null,
        command: 'osq land 007',
      },
    ]);

    const lines = formatInboxText(inbox).split('\n');
    assert.ok(
      lines.includes('  007: Pricing — archived, not landed — osq land 007'),
      formatInboxText(inbox),
    );
  });

  it('drops the item once the default branch holds the change', async () => {
    const { repo, config, home } = await setupWorktreeProject(true);
    const inbox = await readInbox(repo, { config, home });

    assert.equal(
      inbox.needsYou.some((item) => item.kind === 'change-archived'),
      false,
    );
    assert.ok(!formatInboxText(inbox).includes('archived, not landed'));
  });
});

describe('Not landed label', () => {
  it('labels change-archived as not landed', () => {
    assert.equal(needsYouKindLabel('change-archived'), 'not landed');
  });
});

describe('README describes changes waiting to land', () => {
  function section(readme: string, heading: string, next: string): string {
    const start = readme.indexOf(heading);
    assert.ok(start >= 0, `README must contain ${heading}`);
    const end = readme.indexOf(next, start + heading.length);
    assert.ok(end >= 0, `README must contain ${next} after ${heading}`);
    return readme.slice(start, end);
  }

  it('needs-you bullet names vcs.enabled, archived, not landed, and osq land <id>', async () => {
    const raw = await fs.readFile(path.join(REPO_ROOT, 'README.md'), 'utf8');
    const readme = raw.replace(/\s+/g, ' ');
    const inbox = section(readme, '### Human Attention Inbox', '### Planning');
    const bullet = inbox.slice(
      inbox.indexOf('- **Needs you**'),
      inbox.indexOf('- **Running**') >= 0 ? inbox.indexOf('- **Running**') : undefined,
    );

    assert.ok(bullet.startsWith('- **Needs you**'), 'the Needs you bullet must be present');
    assert.ok(bullet.includes('vcs.enabled'), 'the bullet must name vcs.enabled');
    assert.ok(bullet.includes('archived, not landed'), 'the bullet must say archived, not landed');
    assert.ok(bullet.includes('osq land <id>'), 'the bullet must name osq land <id>');
  });
});
