import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CommandError } from '../src/cli/command-error.js';
import { watchCommand } from '../src/cli/watch.js';
import { defineConfig } from '../src/core/foundation/config.js';
import {
  type WatchState,
  readWatchState,
  watchStateDir,
  writeServiceRecord,
  writeWatcherRecord,
} from '../src/core/run/watch-state.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN_PATH = path.join(PROJECT_ROOT, 'src', 'cli', 'bin.ts');
const TSX_LOADER = createRequire(path.join(PROJECT_ROOT, 'package.json')).resolve('tsx');

const tmpDirs: string[] = [];
const startedPids: number[] = [];
const savedRole = process.env.OSQ_WATCH_ROLE;

beforeEach(() => {
  process.env.OSQ_WATCH_ROLE = undefined;
});

after(() => {
  if (savedRole === undefined) process.env.OSQ_WATCH_ROLE = undefined;
  else process.env.OSQ_WATCH_ROLE = savedRole;
});

afterEach(async () => {
  for (const pid of startedPids.splice(0)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** A temporary project with a mock harness and an optional stop wait. */
async function makeProject(options: { stopWaitSeconds?: number } = {}): Promise<string> {
  const project = await tempDir('osq-watch-bg-project-');
  await fs.mkdir(path.join(project, 'openspec', 'changes'), { recursive: true });
  const watch = options.stopWaitSeconds
    ? `, watch: { stopWaitSeconds: ${options.stopWaitSeconds} }`
    : '';
  await fs.writeFile(
    path.join(project, 'osq.config.ts'),
    `export default { harness: 'mock'${watch} }\n`,
    'utf8',
  );
  return project;
}

async function makeHome(): Promise<string> {
  return tempDir('osq-watch-bg-home-');
}

interface BinResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function runBin(cwd: string, home: string, args: string[]): Promise<BinResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', TSX_LOADER, BIN_PATH, ...args], {
      cwd,
      env: { ...process.env, HOME: home, NO_COLOR: '1' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('condition was not met in time');
}

async function waitForLiveRecords(project: string, home: string): Promise<WatchState> {
  let state: WatchState | null = null;
  await waitFor(async () => {
    state = await readWatchState(project, home);
    return state.service !== null && state.watcher !== null;
  });
  return state as unknown as WatchState;
}

interface ServiceHandle {
  readonly project: string;
  readonly home: string;
  readonly pid: number;
  readonly watcherPid: number;
  readonly log: string;
}

async function startService(project: string, home: string): Promise<ServiceHandle> {
  const result = await runBin(project, home, ['watch', '--background']);
  assert.equal(result.code, 0, result.stderr);
  const match = /^osq watch is running in the background \(pid (\d+)\)\. Log: (.*)\n$/m.exec(
    result.stdout,
  );
  assert.ok(match, `unexpected stdout: ${result.stdout}`);
  const pid = Number(match[1]);
  const log = match[2];
  startedPids.push(pid);
  const state = await waitForLiveRecords(project, home);
  const watcher = state.watcher;
  if (watcher === null) throw new Error('watcher record is not live');
  startedPids.push(watcher.pid);
  return { project, home, pid, watcherPid: watcher.pid, log };
}

async function stopService(project: string, home: string): Promise<BinResult> {
  return runBin(project, home, ['watch', '--stop']);
}

describe('osq watch background service', () => {
  it('starts a detached service, records it, and prints the fallback line', async () => {
    const project = await makeProject();
    const home = await makeHome();

    const handle = await startService(project, home);

    const state = await readWatchState(project, home);
    assert.equal(state.service?.pid, handle.pid);
    assert.equal(state.service?.log, handle.log);
    assert.equal(handle.log, path.join(await watchStateDir(project, home), 'watch.log'));
    assert.equal(state.watcher?.mode, 'background');
    assert.equal(state.watcher?.pid, handle.watcherPid);
    assert.equal(typeof state.watcher?.version, 'string');
    assert.equal(typeof state.watcher?.commit, 'string');
    assert.ok(state.watcher?.waiting === null || typeof state.watcher?.waiting === 'string');

    const stopped = await stopService(project, home);
    assert.equal(stopped.code, 0, stopped.stderr);
    assert.equal(stopped.stdout, `osq watch stopped (pid ${handle.pid})\n`);
  });

  it('stops the service and clears both records', async () => {
    const project = await makeProject();
    const home = await makeHome();
    const handle = await startService(project, home);

    const result = await stopService(project, home);

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, `osq watch stopped (pid ${handle.pid})\n`);
    const state = await readWatchState(project, home);
    assert.equal(state.service, null);
    assert.equal(state.watcher, null);

    const dir = await watchStateDir(project, home);
    const serviceFile = path.join(dir, 'service.json');
    const watcherFile = path.join(dir, 'watcher.json');
    await waitFor(async () => !(await exists(serviceFile)) && !(await exists(watcherFile)));
    assert.equal(await exists(serviceFile), false);
    assert.equal(await exists(watcherFile), false);
  });

  it('reports stopping after the running task when the service outlives the wait', async () => {
    const project = await makeProject({ stopWaitSeconds: 1 });
    const home = await makeHome();
    const stubborn = spawn(
      process.execPath,
      ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
      { stdio: 'ignore' },
    );
    startedPids.push(stubborn.pid as number);
    const log = path.join(await watchStateDir(project, home), 'watch.log');
    await writeServiceRecord(
      project,
      { pid: stubborn.pid as number, startedAt: new Date().toISOString(), log },
      home,
    );

    const result = await stopService(project, home);

    assert.equal(result.code, 0, result.stderr);
    assert.equal(
      result.stdout,
      `osq watch is stopping after its running task (pid ${stubborn.pid})\n`,
    );
  });

  it('reports that nothing is running when no service record is live', async () => {
    const project = await makeProject();
    const home = await makeHome();

    const result = await stopService(project, home);

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, 'osq watch is not running in the background\n');
  });

  it('refuses to start when a live service record exists', async () => {
    const project = await makeProject();
    const home = await makeHome();
    const log = path.join(await watchStateDir(project, home), 'watch.log');
    await writeServiceRecord(
      project,
      { pid: process.pid, startedAt: new Date().toISOString(), log },
      home,
    );
    const config = defineConfig({ harness: 'mock' });

    const expected = `osq watch is already running in the background (pid ${process.pid}). Log: ${log}. Stop it with osq watch --stop`;
    for (const options of [{ background: true }, { once: true }, {}]) {
      const stdout: string[] = [];
      await assert.rejects(
        watchCommand({ ...options, cwd: project, home, config, stdout: (t) => stdout.push(t) }),
        (error: unknown) => error instanceof CommandError && error.message === expected,
      );
      assert.equal(stdout.join(''), '');
    }
    assert.equal(await exists(log), false, 'the refusal spawned a service');
  });

  it('refuses to start when only a terminal watcher record exists', async () => {
    const project = await makeProject();
    const home = await makeHome();
    await writeWatcherRecord(
      project,
      {
        pid: process.pid,
        mode: 'terminal',
        version: '0.0.0',
        commit: 'abc1234',
        startedAt: new Date().toISOString(),
        waiting: null,
      },
      home,
    );
    const config = defineConfig({ harness: 'mock' });

    await assert.rejects(
      watchCommand({ background: true, cwd: project, home, config }),
      (error: unknown) =>
        error instanceof CommandError &&
        error.message === `osq watch is already running in a terminal (pid ${process.pid})`,
    );
  });

  it('refuses the background combination without spawning', async () => {
    const project = await makeProject();
    const home = await makeHome();
    const config = defineConfig({ harness: 'mock' });

    await assert.rejects(
      watchCommand({ background: true, dev: true, cwd: project, home, config }),
      (error: unknown) =>
        error instanceof CommandError &&
        error.message === '--background cannot be combined with --once, --dev or --allow-stale',
    );
  });

  it('refuses stop combined with another watch option', async () => {
    const project = await makeProject();
    const home = await makeHome();
    const config = defineConfig({ harness: 'mock' });

    await assert.rejects(
      watchCommand({ stop: true, once: true, cwd: project, home, config }),
      (error: unknown) =>
        error instanceof CommandError && error.message === '--stop takes no other option',
    );
  });

  it('writes no record for --once', async () => {
    const project = await makeProject();
    const home = await makeHome();
    const config = defineConfig({ harness: 'mock' });

    await watchCommand({
      once: true,
      allowStale: true,
      cwd: project,
      home,
      config,
      stdout: () => {},
      stderr: () => {},
    });

    const state = await readWatchState(project, home);
    assert.equal(state.service, null);
    assert.equal(state.watcher, null);
    const dir = await watchStateDir(project, home);
    assert.equal(await exists(path.join(dir, 'watcher.json')), false);
    assert.equal(await exists(path.join(dir, 'service.json')), false);
  });

  it('writes a terminal record for a continuous watch and removes it on exit', async () => {
    const project = await makeProject();
    const home = await makeHome();
    const child = spawn(process.execPath, ['--import', TSX_LOADER, BIN_PATH, 'watch'], {
      cwd: project,
      env: { ...process.env, HOME: home, NO_COLOR: '1' },
      stdio: 'ignore',
    });
    startedPids.push(child.pid as number);

    const state = await waitForLiveRecordsTerminal(project, home, child.pid as number);
    assert.equal(state.watcher?.mode, 'terminal');
    // Let the loop settle so its SIGINT handler is installed and the first
    // cycle has finished; a signal in that brief window would kill the child
    // outright and its exit handler would not run.
    await new Promise((resolve) => setTimeout(resolve, 1000));

    child.kill('SIGINT');
    await waitForExit(child);

    const file = path.join(await watchStateDir(project, home), 'watcher.json');
    await waitFor(async () => !(await exists(file)));
    assert.equal(await exists(file), false);
  });
});

async function waitForLiveRecordsTerminal(
  project: string,
  home: string,
  pid: number,
): Promise<WatchState> {
  let state: WatchState | null = null;
  await waitFor(async () => {
    state = await readWatchState(project, home);
    return state.watcher?.pid === pid && state.watcher.mode === 'terminal';
  });
  return state as unknown as WatchState;
}

function waitForExit(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    child.on('exit', () => resolve());
  });
}
