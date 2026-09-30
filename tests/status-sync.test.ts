import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { statusCommand } from '../src/cli/status.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { formatStatusOverview, getStatusOverview } from '../src/core/status/status.js';
import { worktreePath } from '../src/core/vcs/worktree.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);

const PASSING_VERIFY = 'node verify.cjs';
const LOCAL_VERIFIER = `const fs = require('node:fs');
if (!fs.existsSync('openspec')) {
  process.exit(1);
}
process.exit(0);
`;

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

/** Replace the seeded planning sentinel with a real local verifier. */
async function installLocalVerifier(root: string, folderPath: string): Promise<void> {
  await fs.writeFile(path.join(root, 'verify.cjs'), LOCAL_VERIFIER, 'utf8');
  for (const rel of ['proposal.md', path.join('tasks', '1.md')]) {
    const target = path.join(folderPath, rel);
    const content = await fs.readFile(target, 'utf8').catch(() => null);
    if (content === null) continue;
    await fs.writeFile(
      target,
      content.replace(/^verify:.*$/m, `verify: ${PASSING_VERIFY}`),
      'utf8',
    );
  }
}

interface Project {
  repo: string;
  config: OsqConfig;
  vcs: VcsConfig;
  folderName: string;
  checkoutFolder: string;
  worktree: string;
  worktreeFolder: string;
}

/** A committed temp repository with one draft approved into a worktree. */
async function makeApprovedProject(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-status-sync-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });

  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  const spec = await createNewSpec(repo, 'Order Flow');
  await installLocalVerifier(repo, spec.folderPath);

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
  };
  const config = defineConfig({ vcs });
  await approveSpec(repo, '001', config);

  const worktree = worktreePath(vcs, repo, spec.folderName);
  return {
    repo,
    config,
    vcs,
    folderName: spec.folderName,
    checkoutFolder: spec.folderPath,
    worktree,
    worktreeFolder: path.join(worktree, 'openspec', 'changes', spec.folderName),
  };
}

let eventClock = 0;

/** Append one event to the worktree change folder's change stream. */
async function appendEvent(
  project: Project,
  type: string,
  data: Record<string, unknown>,
  timestamp?: string,
): Promise<void> {
  const eventsDir = path.join(project.worktreeFolder, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  const stamp = timestamp ?? `2026-09-29T0${eventClock++}:00:00.000Z`;
  const event = { type, timestamp: stamp, data };
  await fs.appendFile(path.join(eventsDir, 'change.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');
}

describe('osq status last sync', () => {
  it('shows the last of several syncs directly above the next line', async () => {
    const p = await makeApprovedProject();
    await appendEvent(
      p,
      'synced',
      { defaultBranch: 'main', commits: 4 },
      '2026-09-29T09:00:00.000Z',
    );
    await appendEvent(
      p,
      'synced',
      { defaultBranch: 'main', commits: 1 },
      '2026-09-29T10:00:00.000Z',
    );

    const overview = await getStatusOverview(p.repo, p.config);
    assert.deepEqual(overview.worktrees?.[p.folderName]?.lastSync, {
      timestamp: '2026-09-29T10:00:00.000Z',
      defaultBranch: 'main',
      commits: 1,
    });
    assert.equal(overview.worktrees?.[p.folderName]?.lastSyncStop, undefined);

    const formatted = formatStatusOverview(overview);
    const line = '  last sync: 2026-09-29T10:00:00.000Z, 1 commit from main';
    assert.equal(formatted.split(line).length, 2);
    const lines = formatted.split('\n');
    const nextIndex = lines.findIndex((entry) => entry.startsWith('  next: '));
    assert.ok(nextIndex > 0);
    assert.equal(lines[nextIndex - 1], line);
  });

  it('prints the sync line below the worktree line', async () => {
    const p = await makeApprovedProject();
    await fs.mkdir(path.join(p.checkoutFolder, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(p.checkoutFolder, 'tasks', '1.md'), '# edited\n', 'utf8');
    await appendEvent(
      p,
      'synced',
      { defaultBranch: 'main', commits: 2 },
      '2026-09-29T10:00:00.000Z',
    );

    const lines = formatStatusOverview(await getStatusOverview(p.repo, p.config)).split('\n');
    const worktreeIndex = lines.findIndex((entry) => entry.startsWith('  worktree: '));
    const syncIndex = lines.findIndex((entry) => entry.startsWith('  last sync: '));
    assert.ok(worktreeIndex >= 0 && syncIndex > worktreeIndex);
    assert.equal(lines[syncIndex], '  last sync: 2026-09-29T10:00:00.000Z, 2 commits from main');
  });

  it('prints no sync line and carries no fields when never synced', async () => {
    const p = await makeApprovedProject();

    const overview = await getStatusOverview(p.repo, p.config);
    const worktree = overview.worktrees?.[p.folderName];
    assert.ok(worktree);
    assert.equal(worktree.lastSync, undefined);
    assert.equal(worktree.lastSyncStop, undefined);

    const formatted = formatStatusOverview(overview);
    assert.ok(!formatted.includes('last sync:'));
    assert.ok(!formatted.includes('sync stopped:'));
  });

  it('skips a broken line before a synced event', async () => {
    const p = await makeApprovedProject();
    const eventsDir = path.join(p.worktreeFolder, '.run', 'events');
    await fs.mkdir(eventsDir, { recursive: true });
    await fs.appendFile(path.join(eventsDir, 'change.jsonl'), 'not json\n', 'utf8');
    await appendEvent(
      p,
      'synced',
      { defaultBranch: 'main', commits: 3 },
      '2026-09-29T10:00:00.000Z',
    );

    const formatted = formatStatusOverview(await getStatusOverview(p.repo, p.config));
    assert.ok(formatted.includes('  last sync: 2026-09-29T10:00:00.000Z, 3 commits from main'));
  });

  it('shows a stop after the last sync with its first message line', async () => {
    const p = await makeApprovedProject();
    await appendEvent(
      p,
      'synced',
      { defaultBranch: 'main', commits: 2 },
      '2026-09-29T10:00:00.000Z',
    );
    await appendEvent(
      p,
      'sync_stopped',
      {
        reason: 'sync_conflict',
        message: 'src/app.txt conflicts with main\nmerge it by hand',
        defaultBranch: 'main',
      },
      '2026-09-29T11:00:00.000Z',
    );

    const overview = await getStatusOverview(p.repo, p.config);
    assert.deepEqual(overview.worktrees?.[p.folderName]?.lastSyncStop, {
      timestamp: '2026-09-29T11:00:00.000Z',
      reason: 'sync_conflict',
      message: 'src/app.txt conflicts with main\nmerge it by hand',
    });

    const lines = formatStatusOverview(overview).split('\n');
    const nextIndex = lines.findIndex((entry) => entry.startsWith('  next: '));
    const stop =
      '  sync stopped: 2026-09-29T11:00:00.000Z (sync_conflict); run osq sync 001 again once it is fixed';
    assert.equal(
      lines[nextIndex - 3],
      '  last sync: 2026-09-29T10:00:00.000Z, 2 commits from main',
    );
    assert.equal(lines[nextIndex - 2], stop);
    assert.equal(lines[nextIndex - 1], '    src/app.txt conflicts with main');
  });

  it('clears a stop behind a later sync', async () => {
    const p = await makeApprovedProject();
    await appendEvent(
      p,
      'sync_stopped',
      { reason: 'sync_failed', message: 'verify failed', defaultBranch: 'main' },
      '2026-09-29T09:00:00.000Z',
    );
    await appendEvent(
      p,
      'synced',
      { defaultBranch: 'main', commits: 1 },
      '2026-09-29T10:00:00.000Z',
    );

    const overview = await getStatusOverview(p.repo, p.config);
    assert.equal(overview.worktrees?.[p.folderName]?.lastSyncStop, undefined);
    const formatted = formatStatusOverview(overview);
    assert.ok(formatted.includes('  last sync: 2026-09-29T10:00:00.000Z, 1 commit from main'));
    assert.ok(!formatted.includes('sync stopped:'));
  });

  it('carries a stop when no sync exists', async () => {
    const p = await makeApprovedProject();
    await appendEvent(
      p,
      'sync_stopped',
      { reason: 'sync_conflict', message: 'a.txt conflicts with main', defaultBranch: 'main' },
      '2026-09-29T11:00:00.000Z',
    );

    const overview = await getStatusOverview(p.repo, p.config);
    assert.equal(overview.worktrees?.[p.folderName]?.lastSync, undefined);
    assert.deepEqual(overview.worktrees?.[p.folderName]?.lastSyncStop, {
      timestamp: '2026-09-29T11:00:00.000Z',
      reason: 'sync_conflict',
      message: 'a.txt conflicts with main',
    });

    const formatted = formatStatusOverview(overview);
    assert.ok(!formatted.includes('last sync:'));
    assert.ok(
      formatted.includes(
        '  sync stopped: 2026-09-29T11:00:00.000Z (sync_conflict); run osq sync 001 again once it is fixed',
      ),
    );
  });

  it('renders the stop line through the status command', async () => {
    const p = await makeApprovedProject();
    await appendEvent(
      p,
      'sync_stopped',
      {
        reason: 'sync_failed',
        message: 'verify failed on osq/001-order-flow',
        defaultBranch: 'main',
      },
      '2026-09-29T11:00:00.000Z',
    );

    let captured = '';
    await statusCommand({
      cwd: p.repo,
      config: p.config,
      stdout: (msg) => {
        captured = msg;
      },
    });

    assert.ok(
      captured.includes(
        '  sync stopped: 2026-09-29T11:00:00.000Z (sync_failed); run osq sync 001 again once it is fixed',
      ),
    );
    assert.ok(captured.includes('    verify failed on osq/001-order-flow'));
  });
});
