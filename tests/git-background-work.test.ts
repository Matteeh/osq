import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import './git-test-env.js';
import { withoutBackgroundGit } from './git-test-env.js';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const IDENTITY = ['-c', 'user.name=osq', '-c', 'user.email=osq@example.invalid'];
const REDIRECTING = ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'];

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5 });
  }
});

/** The test's own git calls ignore redirecting variables, like osq's reads. */
function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of REDIRECTING) Reflect.deleteProperty(env, key);
  return env;
}

/** The environment with every `GIT_CONFIG_*` entry removed. */
function withoutGitConfig(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (key === 'GIT_CONFIG_COUNT') continue;
    if (key.startsWith('GIT_CONFIG_KEY_')) continue;
    if (key.startsWith('GIT_CONFIG_VALUE_')) continue;
    result[key] = value;
  }
  return result;
}

/** A fresh temp repo and an empty trace2 output directory beside it. */
async function makeTempRepo(): Promise<{ repo: string; trace: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-git-bg-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const trace = path.join(root, 'trace');
  await fs.mkdir(repo, { recursive: true });
  await fs.mkdir(trace, { recursive: true });
  return { repo, trace };
}

/** Run git with an argument list and no shell, like the tests' own git calls. */
async function git(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, env });
  return stdout;
}

/** Initialize `repo` and commit one file under `env`, with trace2 writing to `trace`. */
async function seedCommit(
  repo: string,
  trace: string,
  env: NodeJS.ProcessEnv,
  extra: string[] = [],
): Promise<void> {
  const childEnv = { ...env, GIT_TRACE2_EVENT: trace };
  await git([...IDENTITY, 'init', '-q', '-b', 'main'], repo, childEnv);
  await fs.writeFile(path.join(repo, 'seed.txt'), 'seed\n', 'utf8');
  await git([...IDENTITY, 'add', 'seed.txt'], repo, childEnv);
  await git([...IDENTITY, ...extra, 'commit', '-qm', 'seed'], repo, childEnv);
}

interface TraceEvent {
  readonly event?: string;
  readonly argv?: readonly string[];
}

/** Every JSON event line git wrote into the trace directory. */
async function readTraceEvents(trace: string): Promise<TraceEvent[]> {
  const events: TraceEvent[] = [];
  for (const name of await fs.readdir(trace)) {
    const content = await fs.readFile(path.join(trace, name), 'utf8');
    for (const line of content.split('\n')) {
      if (line.trim().length === 0) continue;
      events.push(JSON.parse(line) as TraceEvent);
    }
  }
  return events;
}

/** The argv of every child process git started. */
async function childArgv(trace: string): Promise<string[][]> {
  return (await readTraceEvents(trace))
    .filter((event) => event.event === 'child_start' && Array.isArray(event.argv))
    .map((event) => event.argv as string[]);
}

describe('background git work', () => {
  it('appends maintenance.auto=false after existing git configuration', () => {
    const env: NodeJS.ProcessEnv = {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'user.name',
      GIT_CONFIG_VALUE_0: 'osq',
    };

    const result = withoutBackgroundGit(env);

    assert.equal(result.GIT_CONFIG_COUNT, '2');
    assert.equal(result.GIT_CONFIG_KEY_0, 'user.name');
    assert.equal(result.GIT_CONFIG_VALUE_0, 'osq');
    assert.equal(result.GIT_CONFIG_KEY_1, 'maintenance.auto');
    assert.equal(result.GIT_CONFIG_VALUE_1, 'false');
  });

  it('leaves an environment it already changed unchanged', () => {
    const once = withoutBackgroundGit({});

    const twice = withoutBackgroundGit(once);

    assert.equal(twice, once);
  });

  it('starts no maintenance child under the test environment', async () => {
    const { repo, trace } = await makeTempRepo();

    await seedCommit(repo, trace, cleanGitEnv());

    for (const argv of await childArgv(trace)) {
      assert.ok(
        !argv.includes('maintenance'),
        `test environment started a maintenance child: ${argv.join(' ')}`,
      );
    }
  });

  it('starts the maintenance child outside the test environment', async () => {
    const { repo, trace } = await makeTempRepo();

    await seedCommit(repo, trace, withoutGitConfig(cleanGitEnv()), ['-c', 'maintenance.auto=true']);

    const argv = (await childArgv(trace)).find((entry) => entry[1] === 'maintenance');
    assert.ok(argv, 'git started no maintenance child outside the test environment');
    assert.deepEqual(argv.slice(0, 4), ['git', 'maintenance', 'run', '--auto']);
  });

  it('loads the preload in every node --test invocation', async () => {
    const pkg = JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const parts = (pkg.scripts?.test ?? '').split('&&');

    for (const part of parts) {
      if (!part.includes('--test')) continue;
      assert.ok(
        part.includes('--import ./tests/git-test-env.ts'),
        `node --test invocation is missing the preload: ${part.trim()}`,
      );
    }
  });
});
