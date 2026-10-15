import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { remoteWorkRoot } from '../src/cli/remote-plan.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN_PATH = path.join(PROJECT_ROOT, 'src', 'cli', 'bin.ts');
const TSX_LOADER = createRequire(path.join(PROJECT_ROOT, 'package.json')).resolve('tsx');

/** The server's plan handoff line, with a folder path a working copy never has. */
const HANDOFF =
  '/server/fake-folder: ask your planning tool to plan change 001-demo — next: unplanned — osq plan 001';

const tmpDirs: string[] = [];
const closers: Array<() => Promise<void>> = [];

after(async () => {
  while (closers.length > 0) await closers.pop()?.();
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly body: Record<string, unknown> | null;
}

interface RecordingServer {
  readonly base: string;
  readonly host: string;
  readonly project: string;
  readonly requests: RecordedRequest[];
}

/**
 * A raw HTTP server that answers the forwarded-command protocol and records
 * every request, so the test can tell a whole-command forward from a plan that
 * downloads a working copy.
 */
async function startRecordingServer(): Promise<RecordingServer> {
  const requests: RecordedRequest[] = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = raw === '' ? null : (JSON.parse(raw) as Record<string, unknown>);
      requests.push({ method: req.method ?? '', path: url.pathname, body });
      if (req.method === 'GET' && url.pathname === '/p/osq/api/commands') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ token: 'test-token' }));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/p/osq/api/commands') {
        res.writeHead(200, { 'content-type': 'application/x-ndjson' });
        res.end(
          `${JSON.stringify({ stream: 'stdout', text: `${HANDOFF}\n` })}\n` +
            `${JSON.stringify({ exitCode: 0, error: null, next: null })}\n`,
        );
        return;
      }
      if (req.method === 'GET' && url.pathname === '/p/osq/api/files/001-demo') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({ folder: '001-demo', files: { 'brief.md': 'Brief body for demo.\n' } }),
        );
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => new Promise((resolve) => server.close(() => resolve())));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    base: `http://127.0.0.1:${port}/p/osq/`,
    host: `127.0.0.1:${port}`,
    project: 'osq',
    requests,
  };
}

interface BinResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | null;
}

/** Spawn the real CLI in `cwd` with `OSQ_SERVER` set to `base`. */
function runBin(
  cwd: string,
  home: string,
  args: readonly string[],
  base: string,
): Promise<BinResult> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, NO_COLOR: '1', OSQ_SERVER: base };
    const child = spawn(process.execPath, ['--import', TSX_LOADER, BIN_PATH, ...args], {
      cwd,
      env,
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

describe('osq plan against a server', () => {
  it('Forwarded start: osq plan 001 --run is one forwarded command and downloads nothing', async () => {
    const project = await tempDir('osq-plan-run-remote-');
    const home = await tempDir('osq-plan-run-remote-home-');
    const server = await startRecordingServer();

    const result = await runBin(project, home, ['plan', '001', '--run'], server.base);

    assert.equal(result.code, 0, result.stderr);
    const posts = server.requests.filter(
      (entry) => entry.method === 'POST' && entry.path === '/p/osq/api/commands',
    );
    assert.deepEqual(
      posts.map((entry) => entry.body),
      [{ command: 'plan', args: ['001'], options: { run: true } }],
    );
    assert.equal(
      server.requests.some((entry) => entry.path.startsWith('/p/osq/api/files/')),
      false,
    );
    assert.equal(result.stdout, `${HANDOFF}\n`);
    assert.equal(await fs.stat(path.join(home, '.osq', 'remote')).catch(() => null), null);
  });

  it('Every other plan request still downloads the working copy', async () => {
    const project = await tempDir('osq-plan-run-remote-plain-');
    const home = await tempDir('osq-plan-run-remote-plain-home-');
    const server = await startRecordingServer();

    const result = await runBin(project, home, ['plan', '001'], server.base);

    assert.equal(result.code, 0, result.stderr);
    const files = server.requests.filter(
      (entry) => entry.method === 'GET' && entry.path === '/p/osq/api/files/001-demo',
    );
    assert.equal(files.length, 1);
    const folderPath = path.join(remoteWorkRoot(server, home), '001-demo');
    assert.equal(
      await fs.readFile(path.join(folderPath, 'brief.md'), 'utf8'),
      'Brief body for demo.\n',
    );
    assert.ok(
      result.stdout.startsWith(
        `${folderPath}: ask your planning tool to plan change 001-demo — next: `,
      ),
      result.stdout,
    );
    assert.equal(result.stdout.includes('/server/fake-folder'), false);
  });
});
