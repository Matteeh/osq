import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { needsYouKindLabel } from '../packages/ui/src/home/labels.js';
import { statusCommand } from '../src/cli/status.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { watchStateDir } from '../src/core/run/watch-state.js';
import { readInbox } from '../src/core/status/inbox-projection.js';
import { formatInboxText } from '../src/core/status/inbox.js';
import { type AfterLandFailure, readAfterLandFailure } from '../src/core/vcs/land-after.js';

const CHANGES = path.posix.join('openspec', 'changes');
const ARCHIVE = path.join(CHANGES, 'archive');
const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-after-land-'));
  tmpDirs.push(root);
  return root;
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

/** Writes archived change 007-pricing titled Pricing in the checkout. */
async function setupCheckoutChange(): Promise<{ repo: string; home: string; config: OsqConfig }> {
  const root = await tempRoot();
  const repo = path.join(root, 'repo');
  const folder = '007-pricing';
  const folderPath = path.join(repo, ARCHIVE, folder);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMd('Pricing'), 'utf8');
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
  const home = path.join(root, 'home');
  return { repo, home, config: defineConfig({}) };
}

/** Writes the failure record task 1's module reads. */
async function writeRecord(repo: string, home: string, failure: AfterLandFailure): Promise<void> {
  const dir = await watchStateDir(repo, home);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'after-land.json'), `${JSON.stringify(failure)}\n`, 'utf8');
}

describe('Failed after-land command in status and inbox', () => {
  it('shows a recorded failure in the inbox, its text row, and osq status', async () => {
    const { repo, home, config } = await setupCheckoutChange();
    const failure: AfterLandFailure = {
      change: '007-pricing',
      command: 'pnpm build',
      exitCode: 1,
      failedAt: '2026-01-01T00:00:00.000Z',
    };
    await writeRecord(repo, home, failure);
    assert.deepEqual(await readAfterLandFailure(repo, home), failure);

    const inbox = await readInbox(repo, { config, home });
    assert.deepEqual(inbox.needsYou, [
      {
        kind: 'after-land-failed',
        change: { id: '007', title: 'Pricing' },
        task: null,
        command: 'osq land 007',
      },
    ]);

    const text = formatInboxText(inbox);
    assert.ok(
      text.split('\n').includes('  007: Pricing — after-land command failed — osq land 007'),
      text,
    );

    const status = await statusCommand({
      cwd: repo,
      config,
      home,
      stdout: () => {},
      stderr: () => {},
    });
    assert.ok(
      status.split('\n').includes('After-land command failed for 007: pnpm build — osq land 007'),
      status,
    );
  });

  it('prints nothing new when no failure is recorded', async () => {
    const { repo, home, config } = await setupCheckoutChange();
    const inbox = await readInbox(repo, { config, home });

    assert.equal(
      inbox.needsYou.some((item) => item.kind === 'after-land-failed'),
      false,
    );
    assert.ok(!formatInboxText(inbox).includes('after-land command failed'));

    const status = await statusCommand({
      cwd: repo,
      config,
      home,
      stdout: () => {},
      stderr: () => {},
    });
    assert.ok(!status.includes('After-land command failed'));
  });
});

describe('After-land failed label', () => {
  it('labels after-land-failed as after-land failed', () => {
    assert.equal(needsYouKindLabel('after-land-failed'), 'after-land failed');
  });
});
