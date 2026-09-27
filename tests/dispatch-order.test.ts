import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { defineConfig } from '../src/core/foundation/config.js';
import { readDispatchItems } from '../src/core/status/dispatch-items.js';
import { orderDispatchItems } from '../src/core/status/dispatch-order.js';

const execFileAsync = promisify(execFile);
const CHANGES = path.join('openspec', 'changes');

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-dispatch-order-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function proposalMd(title: string, dependsOn: string[] = []): string {
  const deps = dependsOn.map((id) => JSON.stringify(id)).join(', ');
  return [
    '---',
    `title: ${title}`,
    `depends_on: [${deps}]`,
    'verify: node verify.cjs',
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

async function createChange(
  root: string,
  folderName: string,
  title: string,
  dependsOn: string[] = [],
): Promise<string> {
  const dir = path.join(root, CHANGES, folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(title, dependsOn), 'utf8');
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

async function createArchived(root: string, folderName: string, title: string): Promise<string> {
  const dir = path.join(root, CHANGES, 'archive', folderName);
  await fs.mkdir(path.join(dir, '.run', 'events'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(title), 'utf8');
  const data = {
    archivePath: dir,
    verification: { afterLanding: false, check: null },
  };
  await fs.writeFile(
    path.join(dir, '.run', 'events', 'change.jsonl'),
    `${JSON.stringify({ type: 'archived', timestamp: '2026-01-01T00:00:00.000Z', data })}\n`,
    'utf8',
  );
  return dir;
}

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

async function makeRepo(): Promise<string> {
  const root = path.join(tmpDir, 'repo');
  await fs.mkdir(root, { recursive: true });
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await fs.writeFile(path.join(root, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'seed'], root);
  return root;
}

describe('dispatch order', () => {
  it('orders by weight, counting dependants transitively', async () => {
    await createChange(tmpDir, '001-base', 'Base');
    await createChange(tmpDir, '002-direct', 'Direct', ['001']);
    await createChange(tmpDir, '003-direct', 'Direct two', ['001']);
    await createChange(tmpDir, '004-through', 'Through', ['003']);
    await createChange(tmpDir, '005-none', 'None');
    const runner = await createChange(tmpDir, '006-runner', 'Runner');
    await approve(runner);

    const config = defineConfig({});
    const dispatch = await readDispatchItems(tmpDir, config);
    assert.equal(dispatch.watcherIdle, false);

    const ordered = await orderDispatchItems(tmpDir, config, dispatch);
    const base = ordered.find((item) => item.change.id === '001');
    assert.ok(base);
    assert.equal(base.weight, 4);
    assert.equal(base.reason, 'holds up 3 changes');
    assert.equal(ordered[0].change.id, '001');
    const none = ordered.find((item) => item.change.id === '005');
    assert.ok(none);
    assert.equal(none.weight, 1);
  });

  it('puts idle-work items first when the watcher is idle', async () => {
    const dead = await createChange(tmpDir, '001-dead', 'Dead');
    await approve(dead);
    await writeMarker(dead, '.run/dead/1.md', '---\nreason: verify_red\n---\nboom\n');
    await createArchived(tmpDir, '010-verify', 'Verify');
    await createChange(tmpDir, '020-dep', 'Dep', ['010']);

    const config = defineConfig({});
    const dispatch = await readDispatchItems(tmpDir, config);
    assert.equal(dispatch.watcherIdle, true);

    const ordered = await orderDispatchItems(tmpDir, config, dispatch);
    const halt = ordered.find((item) => item.kind === 'halt');
    const verify = ordered.find((item) => item.kind === 'verify');
    assert.ok(halt);
    assert.ok(verify);
    assert.equal(verify.weight, 2);
    assert.equal(halt.reason, 'watcher idle; this gives it work');
    assert.equal(ordered[0].kind, 'halt');
  });

  it('orders equal items by change id with the in-change-order reason', async () => {
    const one = await createChange(tmpDir, '001-dead', 'One');
    const two = await createChange(tmpDir, '002-dead', 'Two');
    await approve(one);
    await approve(two);
    await writeMarker(one, '.run/dead/1.md', '---\nreason: verify_red\n---\nboom\n');
    await writeMarker(two, '.run/dead/1.md', '---\nreason: verify_red\n---\nboom\n');
    const runner = await createChange(tmpDir, '003-runner', 'Runner');
    await approve(runner);

    const config = defineConfig({});
    const dispatch = await readDispatchItems(tmpDir, config);
    assert.equal(dispatch.watcherIdle, false);

    const ordered = await orderDispatchItems(tmpDir, config, dispatch);
    assert.deepEqual(
      ordered.map((item) => item.change.id),
      ['001', '002'],
    );
    assert.deepEqual(
      ordered.map((item) => item.reason),
      ['in change order', 'in change order'],
    );
  });

  it('gives each change in a dependency cycle weight two', async () => {
    await createChange(tmpDir, '001-a', 'A', ['002']);
    await createChange(tmpDir, '002-b', 'B', ['001']);

    const config = defineConfig({});
    const dispatch = await readDispatchItems(tmpDir, config);
    const ordered = await orderDispatchItems(tmpDir, config, dispatch);
    const a = ordered.find((item) => item.change.id === '001');
    const b = ordered.find((item) => item.change.id === '002');
    assert.ok(a);
    assert.ok(b);
    assert.equal(a.weight, 2);
    assert.equal(b.weight, 2);
  });

  it('counts a dependant in another tree and repeats the same order', async () => {
    const repo = await makeRepo();
    await createChange(repo, '001-base', 'Base');
    const worktrees = path.join(tmpDir, 'worktrees');
    const stacked = path.join(worktrees, path.basename(repo), '.stacked', '002-dep');
    const dir = path.join(stacked, 'openspec', 'changes', '002-dep');
    await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
    await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd('Dep', ['001']), 'utf8');
    await fs.writeFile(path.join(dir, 'tasks', '1.md'), taskMd('Task one'), 'utf8');

    const vcs: VcsConfig = {
      enabled: true,
      author: 'Osq <osq@example.invalid>',
      worktreeRoot: worktrees,
    };
    const config = defineConfig({ vcs });
    const dispatch = await readDispatchItems(repo, config);
    const ordered = await orderDispatchItems(repo, config, dispatch);
    const base = ordered.find((item) => item.change.id === '001');
    assert.ok(base);
    assert.equal(base.weight, 2);
    assert.equal(base.reason, 'watcher idle; this gives it work; holds up 1 change');

    const again = await orderDispatchItems(repo, config, dispatch);
    assert.deepEqual(
      again.map((item) => `${item.kind}:${item.change.id}`),
      ordered.map((item) => `${item.kind}:${item.change.id}`),
    );
  });
});
