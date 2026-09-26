import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { commitDeadTask } from '../src/core/run/dead-commit.js';
import { getDeadMarkerPath, getEventsPath } from '../src/core/status/layout.js';
import { selectVcs } from '../src/core/vcs/select.js';
import type { Vcs } from '../src/core/vcs/vcs.js';

const execFileAsync = promisify(execFile);
const CHANGE_ID = '091-dead-path-building-blocks';
const CHANGE_REL = path.posix.join('openspec', 'changes', CHANGE_ID);
const TASK = 3;
const AUTHOR = 'osq <osq@example.org>';

const config: OsqConfig = {
  ...DEFAULT_CONFIG,
  vcs: { enabled: true, author: AUTHOR },
};

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
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

interface Scenario {
  readonly worktree: string;
  readonly changeFolder: string;
  readonly vcs: Vcs;
}

/** A temporary repository with a linked worktree on `osq/091-dead` and its change folder. */
async function makeScenario(): Promise<Scenario> {
  const parent = await makeTempDir('osq-dead-commit-');
  const root = path.join(parent, 'repo');
  await fs.mkdir(root);
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await fs.writeFile(path.join(root, 'seed.txt'), 'seed\n', 'utf8');
  const tasksDir = path.join(root, CHANGE_REL, 'tasks');
  await fs.mkdir(tasksDir, { recursive: true });
  await fs.writeFile(path.join(root, CHANGE_REL, 'proposal.md'), '# change\n', 'utf8');
  await fs.writeFile(path.join(tasksDir, '1.md'), 'original\n', 'utf8');
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'init'], root);

  await git(['branch', 'osq/091-dead', 'main'], root);
  const worktree = path.join(parent, 'wt');
  await git(['worktree', 'add', '-q', worktree, 'osq/091-dead'], root);

  const vcs = await selectVcs(worktree, config);
  assert.equal(vcs.kind, 'git');
  return { worktree, changeFolder: path.join(worktree, CHANGE_REL), vcs };
}

/** Write the dead marker and started event the watcher writes before the dead record. */
async function writeWatcherMarkers(changeFolder: string): Promise<void> {
  const task = String(TASK);
  await fs.mkdir(path.dirname(getDeadMarkerPath(changeFolder, task)), { recursive: true });
  await fs.mkdir(path.dirname(getEventsPath(changeFolder, task)), { recursive: true });
  await fs.writeFile(getDeadMarkerPath(changeFolder, task), 'reason: verify_red\n', 'utf8');
  const event = JSON.stringify({
    type: 'started',
    timestamp: '2026-09-26T00:00:00.000Z',
    data: { harness: 'pi', model: 'deepseek-pro', osqVersion: '0.2.1' },
  });
  await fs.writeFile(getEventsPath(changeFolder, task), `${event}\n`, 'utf8');
}

function deadRecords(): string[] {
  const run = path.posix.join(CHANGE_REL, '.run');
  return [
    `${run}/dead/${TASK}.md`,
    `${run}/dead/${TASK}.patch`,
    `${run}/events/${TASK}.jsonl`,
  ].sort();
}

async function commitFiles(worktree: string, sha: string): Promise<string[]> {
  const output = await git(['show', '--pretty=format:', '--name-only', sha], worktree);
  return output
    .split('\n')
    .filter((line) => line.length > 0)
    .sort();
}

describe('osq dead task record', () => {
  it('Agent edits put back', async () => {
    const { worktree, changeFolder, vcs } = await makeScenario();
    await writeWatcherMarkers(changeFolder);
    await fs.writeFile(path.join(worktree, 'seed.txt'), 'agent changed\n', 'utf8');
    await fs.mkdir(path.join(worktree, 'src'), { recursive: true });
    await fs.writeFile(path.join(worktree, 'src', 'new.ts'), 'export const x = 1;\n', 'utf8');

    const parent = await git(['rev-parse', 'HEAD'], worktree);
    const commit = await commitDeadTask(
      vcs,
      config,
      changeFolder,
      TASK,
      'verify_red',
      'When a task dies',
      '[dead] verify_red',
    );

    assert.notEqual(commit, parent, 'the branch gained a commit');
    assert.deepEqual(await commitFiles(worktree, commit), deadRecords());
    assert.equal(
      await git(['log', '-1', '--format=%s', commit], worktree),
      `osq: 091 task ${TASK} dead, reason verify_red`,
    );

    const outsideRun = (await vcs.status()).filter((entry) => !entry.path.includes('.run/'));
    assert.deepEqual(outsideRun, [], 'worktree status is empty outside .run/');

    const patch = await fs.readFile(
      path.join(changeFolder, '.run', 'dead', `${TASK}.patch`),
      'utf8',
    );
    const patchFile = path.join(worktree, 'committed.patch');
    await fs.writeFile(patchFile, patch, 'utf8');
    await git(['apply', `--exclude=${CHANGE_REL}/.run/*`, patchFile], worktree);
    assert.equal(await fs.readFile(path.join(worktree, 'seed.txt'), 'utf8'), 'agent changed\n');
    assert.equal(
      await fs.readFile(path.join(worktree, 'src', 'new.ts'), 'utf8'),
      'export const x = 1;\n',
    );
  });

  it('Patch before discard', async () => {
    const { worktree, changeFolder, vcs } = await makeScenario();
    await writeWatcherMarkers(changeFolder);
    await fs.writeFile(path.join(worktree, 'seed.txt'), 'agent changed\n', 'utf8');

    const throwing = new Proxy(vcs, {
      get(target, prop, receiver): unknown {
        if (prop === 'discard') {
          return async (): Promise<void> => {
            throw new Error('discard refused');
          };
        }
        const value = Reflect.get(target, prop, receiver) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as Vcs;

    await assert.rejects(
      () => commitDeadTask(throwing, config, changeFolder, TASK, 'verify_red', 'title', 'outcome'),
      /discard refused/,
    );

    const patch = await fs.readFile(
      path.join(changeFolder, '.run', 'dead', `${TASK}.patch`),
      'utf8',
    );
    assert.match(patch, /agent changed/);
  });

  it('Spec conflict', async () => {
    const { worktree, changeFolder, vcs } = await makeScenario();
    await writeWatcherMarkers(changeFolder);
    const tasksFile = path.join(changeFolder, 'tasks', '1.md');
    await fs.writeFile(tasksFile, 'edited by human\n', 'utf8');

    const commit = await commitDeadTask(
      vcs,
      config,
      changeFolder,
      TASK,
      'spec_conflict',
      'title',
      '[dead] spec_conflict',
    );

    assert.deepEqual(await commitFiles(worktree, commit), deadRecords());
    assert.equal(await fs.readFile(tasksFile, 'utf8'), 'edited by human\n');
    const entry = (await vcs.status()).find((status) => status.path.endsWith('tasks/1.md'));
    assert.ok(entry, 'the folder edit stays uncommitted');
  });

  it('Missing vcs.author fails before writing anything', async () => {
    const { changeFolder, vcs } = await makeScenario();
    await writeWatcherMarkers(changeFolder);
    const noAuthor: OsqConfig = { ...DEFAULT_CONFIG, vcs: { enabled: true } };

    await assert.rejects(
      () => commitDeadTask(vcs, noAuthor, changeFolder, TASK, 'verify_red', 'title', 'outcome'),
      /vcs\.author/,
    );
    await assert.rejects(
      () => fs.access(path.join(changeFolder, '.run', 'dead', `${TASK}.patch`)),
      /ENOENT/,
    );
  });
});
