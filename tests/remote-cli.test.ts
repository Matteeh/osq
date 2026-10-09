import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN_PATH = path.join(PROJECT_ROOT, 'src', 'cli', 'bin.ts');
const TSX_LOADER = createRequire(path.join(PROJECT_ROOT, 'package.json')).resolve('tsx');

const PROPOSAL = [
  '---',
  'title: Demo Change',
  'depends_on: []',
  'verify: node -e "process.exit(0)"',
  '---',
  '## Goal',
  'Demo goal.',
  '',
].join('\n');

const TASK = [
  '---',
  'title: Task one',
  'verify: node -e "process.exit(0)"',
  'scope: []',
  'entry: []',
  'skills: []',
  '---',
  '## Acceptance',
  '- [ ] done',
  '',
].join('\n');

const tmpDirs: string[] = [];
const startedPids: number[] = [];
const closers: Array<() => Promise<void>> = [];
let serverRun: { readonly project: string; readonly home: string } | null = null;

after(async () => {
  if (serverRun !== null) {
    await runBin(serverRun.project, serverRun.home, ['server', 'stop']).catch(() => undefined);
  }
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
  while (closers.length > 0) await closers.pop()?.();
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

async function write(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
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

/** A temporary project with a mock harness, a fixed server port and change `001-demo`. */
async function makeProject(port: number): Promise<string> {
  const project = await tempDir('osq-remote-cli-');
  await fs.writeFile(
    path.join(project, 'osq.config.ts'),
    `export default { harness: 'mock', serve: { server: { port: ${port} } } }\n`,
    'utf8',
  );
  await write(project, 'openspec/changes/001-demo/brief.md', 'Brief body for demo.\n');
  await write(project, 'openspec/changes/001-demo/proposal.md', PROPOSAL);
  await write(project, 'openspec/changes/001-demo/tasks/1.md', TASK);
  return project;
}

interface BinResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | null;
}

/** The env every spawned CLI gets, with no inherited `OSQ_SERVER`. */
function baseEnv(home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, NO_COLOR: '1' };
  env.OSQ_SERVER = undefined;
  return env;
}

/** Spawn the real CLI in `cwd`, optionally with `OSQ_SERVER` set. */
function runBin(
  cwd: string,
  home: string,
  args: readonly string[],
  extra: NodeJS.ProcessEnv = {},
): Promise<BinResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', TSX_LOADER, BIN_PATH, ...args], {
      cwd,
      env: { ...baseEnv(home), ...extra },
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
  readonly status: number;
  readonly body: Record<string, unknown> | null;
}

async function getJson(url: string): Promise<JsonResult> {
  const response = await fetch(url);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

/** Start a raw HTTP server that counts requests and answers `{}`. */
async function startCountingServer(): Promise<{ base: string; requests: () => number }> {
  let requests = 0;
  const server = http.createServer((_req, res) => {
    requests += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => new Promise((resolve) => server.close(() => resolve())));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return { base: `http://127.0.0.1:${port}/p/osq/`, requests: () => requests };
}

describe('osq CLI against a server', () => {
  it('prints the same command from a laptop and from the project', async () => {
    const project = await makeProject(await findFreePort());
    const home = await tempDir('osq-remote-cli-home-');
    serverRun = { project, home };

    const started = await runBin(project, home, ['server', 'start']);
    assert.equal(started.code, 0, started.stderr);
    const watchMatch = /^osq watch is running in the background \(pid (\d+)\)\./m.exec(
      started.stdout,
    );
    const serverMatch =
      /^osq server is running in the background \(pid (\d+)\) at (http:\/\/127\.0\.0\.1:\d+\/p\/[^/]+\/)\./m.exec(
        started.stdout,
      );
    assert.ok(watchMatch, `no watch line: ${started.stdout}`);
    assert.ok(serverMatch, `no server line: ${started.stdout}`);
    startedPids.push(Number(watchMatch[1]), Number(serverMatch[1]));
    const url = serverMatch[2] as string;

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

    for (const args of [['show', '001'], ['spec']]) {
      const local = await runBin(project, home, args);
      const remote = await runBin(project, home, args, { OSQ_SERVER: url });
      assert.equal(remote.stdout, local.stdout, `stdout differs for osq ${args.join(' ')}`);
      assert.equal(remote.stderr, local.stderr, `stderr differs for osq ${args.join(' ')}`);
      assert.equal(remote.code, local.code, `exit code differs for osq ${args.join(' ')}`);
    }
  });

  it('refuses every local-only command without contacting the server', async () => {
    const project = await tempDir('osq-remote-cli-local-');
    const home = await tempDir('osq-remote-cli-local-home-');
    const counting = await startCountingServer();
    const rows: ReadonlyArray<{ readonly args: readonly string[]; readonly name: string }> = [
      { args: ['init'], name: 'init' },
      { args: ['setup'], name: 'setup' },
      { args: ['migrate', 'openspec'], name: 'migrate' },
      { args: ['watch'], name: 'watch' },
      { args: ['serve'], name: 'serve' },
      { args: ['doctor'], name: 'doctor' },
      { args: ['inbox'], name: 'inbox' },
      { args: ['server', 'start'], name: 'server' },
      { args: ['server', 'stop'], name: 'server' },
      { args: ['plan', '001', '--session'], name: 'plan --session' },
      { args: ['plan', '001', '--brief', 'b.md'], name: 'plan --brief' },
      { args: ['digest', '--out', 'd.md'], name: 'digest --out' },
    ];

    for (const row of rows) {
      const result = await runBin(project, home, row.args, { OSQ_SERVER: counting.base });
      assert.equal(result.code, 1, `osq ${row.args.join(' ')} exit code`);
      assert.equal(
        result.stderr,
        `osq ${row.name} runs only locally; unset OSQ_SERVER to run it here, or run it on the server\n`,
        `osq ${row.args.join(' ')} stderr`,
      );
    }
    assert.equal(counting.requests(), 0, 'the local-only commands contacted the server');
  });

  it('prints one line when OSQ_SERVER is not a project URL', async () => {
    const project = await tempDir('osq-remote-cli-invalid-');
    const home = await tempDir('osq-remote-cli-invalid-home-');
    const result = await runBin(project, home, ['status'], { OSQ_SERVER: 'box/p/osq/' });

    assert.equal(result.code, 1);
    assert.equal(
      result.stderr,
      'OSQ_SERVER must look like https://<host>/p/<project>/: box/p/osq/\n',
    );
    assert.equal(result.stdout, '');
  });

  it('prints the reason when the server is out of reach', async () => {
    const project = await tempDir('osq-remote-cli-down-');
    const home = await tempDir('osq-remote-cli-down-home-');
    const base = `http://127.0.0.1:${await findFreePort()}/p/osq/`;
    const result = await runBin(project, home, ['status'], { OSQ_SERVER: base });

    assert.equal(result.code, 1);
    assert.ok(
      result.stderr.startsWith(`Could not reach the osq server at ${base}: `),
      result.stderr,
    );
  });
});
