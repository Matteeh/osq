import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CommandError } from '../src/cli/command-error.js';
import type { LandCommandOptions } from '../src/cli/land.js';
import { createWebActionRunner } from '../src/cli/serve-actions.js';
import { createServerCommands } from '../src/cli/server-worker.js';
import { startServer, stopServer } from '../src/cli/server.js';
import { defineConfig } from '../src/core/foundation/config.js';
import {
  readServerRecord,
  readWatchState,
  watchStateDir,
  writeServerRecord,
  writeWatcherRecord,
} from '../src/core/run/watch-state.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN_PATH = path.join(PROJECT_ROOT, 'src', 'cli', 'bin.ts');
const TSX_LOADER = createRequire(path.join(PROJECT_ROOT, 'package.json')).resolve('tsx');

const tmpDirs: string[] = [];
const startedPids: number[] = [];
const savedRole = process.env.OSQ_SERVER_ROLE;

beforeEach(() => {
  process.env.OSQ_SERVER_ROLE = undefined;
});

after(() => {
  process.env.OSQ_SERVER_ROLE = savedRole;
});

afterEach(async () => {
  const pids = startedPids.splice(0);
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  for (const pid of pids) {
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

/** A temporary project with a mock harness and a fixed server port. */
async function makeProject(port: number): Promise<string> {
  const project = await tempDir('osq-server-command-');
  await fs.mkdir(path.join(project, 'openspec', 'changes'), { recursive: true });
  await fs.writeFile(
    path.join(project, 'osq.config.ts'),
    `export default { harness: 'mock', serve: { server: { port: ${port} } } }\n`,
    'utf8',
  );
  return project;
}

function makeHome(): Promise<string> {
  return tempDir('osq-server-command-home-');
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
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

async function waitFor(check: () => Promise<boolean>, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('condition was not met in time');
}

interface JsonResult {
  status: number;
  body: Record<string, unknown> | null;
}

async function getJson(url: string): Promise<JsonResult> {
  const response = await fetch(url);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

describe('osq server command', () => {
  it('starts and stops the server and the watch service as real processes', async () => {
    const port = await findFreePort();
    const project = await makeProject(port);
    const home = await makeHome();
    const projectSegment = path.basename(project).replace(/[^A-Za-z0-9._-]/g, '-');

    const started = await runBin(project, home, ['server', 'start']);
    assert.equal(started.code, 0, started.stderr);
    const watchMatch = /^osq watch is running in the background \(pid (\d+)\)\. Log: (.*)$/m.exec(
      started.stdout,
    );
    assert.ok(watchMatch, `no watch line: ${started.stdout}`);
    const serverMatch =
      /^osq server is running in the background \(pid (\d+)\) at (http:\/\/127\.0\.0\.1:\d+\/p\/[^/]+\/)\. Log: (.*)$/m.exec(
        started.stdout,
      );
    assert.ok(serverMatch, `no server line: ${started.stdout}`);
    const watchPid = Number(watchMatch[1]);
    const serverPid = Number(serverMatch[1]);
    const url = serverMatch[2];
    startedPids.push(watchPid, serverPid);
    assert.equal(url, `http://127.0.0.1:${port}/p/${projectSegment}/`);

    let status: JsonResult = { status: 0, body: null };
    await waitFor(async () => {
      try {
        status = await getJson(`${url}api/server`);
      } catch {
        return false;
      }
      return (
        status.status === 200 && status.body?.watcher !== null && status.body?.watcher !== undefined
      );
    });
    assert.equal(status.status, 200);
    assert.equal(status.body?.project, projectSegment);
    assert.ok(status.body?.watcher, 'expected a live watcher');

    const stopped = await runBin(project, home, ['server', 'stop']);
    assert.equal(stopped.code, 0, stopped.stderr);
    assert.match(stopped.stdout, new RegExp(`^osq server stopped \\(pid ${serverPid}\\)$`, 'm'));
    assert.match(stopped.stdout, new RegExp(`^osq watch stopped \\(pid ${watchPid}\\)$`, 'm'));

    await waitFor(async () => {
      const state = await readWatchState(project, home);
      return (
        (await readServerRecord(project, home)) === null &&
        state.service === null &&
        state.watcher === null
      );
    });
    assert.equal(await readServerRecord(project, home), null);
    const state = await readWatchState(project, home);
    assert.equal(state.service, null);
    assert.equal(state.watcher, null);
  });

  it('refuses to start when server.json names a live record', async () => {
    const project = await makeProject(await findFreePort());
    const home = await makeHome();
    const log = path.join(await watchStateDir(project, home), 'server.log');
    await writeServerRecord(
      project,
      {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        log,
        url: 'http://127.0.0.1:4174/p/project/',
      },
      home,
    );
    const config = defineConfig({ harness: 'mock' });
    let spawned = false;

    await assert.rejects(
      startServer({
        cwd: project,
        home,
        config,
        spawnSupervisor: () => {
          spawned = true;
          return process.pid;
        },
      }),
      (error: unknown) =>
        error instanceof CommandError &&
        error.message ===
          `osq server is already running (pid ${process.pid}). Log: ${log}. Stop it with osq server stop`,
    );
    assert.equal(spawned, false);
    assert.equal((await readWatchState(project, home)).service, null);
  });

  it('starts the server without a watch service when a terminal watcher is live', async () => {
    const project = await makeProject(await findFreePort());
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
    const config = defineConfig({ harness: 'mock', serve: { server: { port: 4174 } } });
    const stdout: string[] = [];
    let watchStarted = false;

    await startServer({
      cwd: project,
      home,
      config,
      stdout: (text) => stdout.push(text),
      spawnSupervisor: () => process.pid,
      startWatchService: async () => {
        watchStarted = true;
      },
    });

    assert.equal(watchStarted, false);
    assert.match(stdout.join(''), /osq server is running in the background/);
    assert.equal((await readWatchState(project, home)).service, null);
  });

  it('reports nothing running when no server or watch service is live', async () => {
    const project = await makeProject(await findFreePort());
    const home = await makeHome();
    const config = defineConfig({ harness: 'mock' });
    const stdout: string[] = [];

    await stopServer({
      cwd: project,
      home,
      config,
      stdout: (text) => stdout.push(text),
    });

    assert.equal(
      stdout.join(''),
      'osq server is not running\nosq watch is not running in the background\n',
    );
  });

  it('reports stopping after the running action when the server outlives the wait', async () => {
    const project = await makeProject(await findFreePort());
    const home = await makeHome();
    const config = defineConfig({ harness: 'mock', watch: { stopWaitSeconds: 1 } });
    const stubborn = spawn(
      process.execPath,
      ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
      { stdio: 'ignore' },
    );
    startedPids.push(stubborn.pid as number);
    // Let the child install its SIGTERM handler before the stop signals it.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const log = path.join(await watchStateDir(project, home), 'server.log');
    await writeServerRecord(
      project,
      {
        pid: stubborn.pid as number,
        startedAt: new Date().toISOString(),
        log,
        url: 'http://127.0.0.1:4174/p/project/',
      },
      home,
    );
    const stdout: string[] = [];

    await stopServer({
      cwd: project,
      home,
      config,
      stdout: (text) => stdout.push(text),
    });

    assert.equal(
      stdout.join(''),
      `osq server is stopping after its running action (pid ${stubborn.pid})\nosq watch is not running in the background\n`,
    );
  });

  it('runs the server land through the injected land function with publish', async () => {
    const project = await makeProject(await findFreePort());
    const config = defineConfig({ harness: 'mock' });
    const calls: Array<{ id: string; options: LandCommandOptions }> = [];
    const recordingLand = async (id: string, options: LandCommandOptions = {}): Promise<void> => {
      calls.push({ id, options });
    };

    const run = createWebActionRunner(
      { cwd: project, config },
      createServerCommands(recordingLand),
    );
    const result = await run({ verb: 'land', change: '001' });

    assert.equal(result.exitCode, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.id, '001');
    assert.equal(calls[0]?.options.publish, true);
    assert.equal(calls[0]?.options.cwd, project);
    assert.equal(calls[0]?.options.config, config);
  });
});
