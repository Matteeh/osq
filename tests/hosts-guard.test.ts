import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { defineConfig } from '../src/core/foundation/config.js';
import type {
  WebActionRequest,
  WebActionResult,
  WebActionRunner,
} from '../src/core/web/web-actions.js';
import { type WebServerHandle, startWebServer } from '../src/core/web/web-server.js';
import { createChange, createProject } from './planning-observed-helpers.js';

const OK: WebActionResult = { exitCode: 0, stdout: 'ok\n', stderr: '', error: null };

let root: string;
let uiDir: string;
let homeDir: string;
const handles: WebServerHandle[] = [];

interface Response {
  readonly status: number;
  readonly headers: http.IncomingHttpHeaders;
  readonly body: string;
}

interface RequestOptions {
  readonly headers?: Record<string, string>;
  readonly body?: string;
}

/** Send a raw request through node:http so Host and Origin can be set. */
function request(
  handle: WebServerHandle,
  method: string,
  target: string,
  options: RequestOptions = {},
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: handle.port, method, path: target, headers: options.headers },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

/** Start a loopback server whose write guard accepts the given hosts. */
async function startHostsServer(
  allowedHosts: readonly string[],
  runAction: WebActionRunner,
): Promise<WebServerHandle> {
  const handle = await startWebServer({
    projectRoot: root,
    config: defineConfig({ serve: { port: 0, allowedHosts } }),
    uiDir,
    home: homeDir,
    now: () => new Date('2026-06-01T00:00:00.000Z'),
    runAction,
  });
  handles.push(handle);
  return handle;
}

/** A runner that records its calls and always succeeds. */
function recordingRunner(): { runner: WebActionRunner; calls: WebActionRequest[] } {
  const calls: WebActionRequest[] = [];
  const runner: WebActionRunner = async (action) => {
    calls.push(action);
    return OK;
  };
  return { runner, calls };
}

async function tokenOf(handle: WebServerHandle, id = '001'): Promise<string> {
  const response = await request(handle, 'GET', `/api/actions/${id}`);
  assert.equal(response.status, 200, response.body);
  return (JSON.parse(response.body) as { token: string }).token;
}

beforeEach(async () => {
  root = await createProject();
  uiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-hosts-guard-ui-'));
  homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-hosts-guard-home-'));
});

afterEach(async () => {
  while (handles.length > 0) {
    const handle = handles.pop();
    if (handle) await handle.close();
  }
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(uiDir, { recursive: true, force: true });
  await fs.rm(homeDir, { recursive: true, force: true });
});

describe('Configured host behind a proxy', () => {
  it('runs a POST whose host and https origin are on the list', async () => {
    await createChange(root, 'Proxy Host');
    const { runner, calls } = recordingRunner();
    const handle = await startHostsServer(['box.tail1234.ts.net'], runner);
    const token = await tokenOf(handle);

    const response = await request(handle, 'POST', '/api/actions/001', {
      headers: {
        Host: 'box.tail1234.ts.net',
        Origin: 'https://box.tail1234.ts.net',
        'Content-Type': 'application/json',
        'X-Osq-Token': token,
      },
      body: JSON.stringify({ verb: 'approve' }),
    });
    assert.equal(response.status, 200, response.body);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { verb: 'approve', change: '001' });
  });

  it('refuses an https origin whose host is not on the list', async () => {
    await createChange(root, 'Proxy Host Denied');
    const { runner, calls } = recordingRunner();
    const handle = await startHostsServer(['box.tail1234.ts.net'], runner);
    const token = await tokenOf(handle);

    const response = await request(handle, 'POST', '/api/actions/001', {
      headers: {
        Host: 'box.tail1234.ts.net',
        Origin: 'https://evil.example',
        'Content-Type': 'application/json',
        'X-Osq-Token': token,
      },
      body: JSON.stringify({ verb: 'approve' }),
    });
    assert.equal(response.status, 403, response.body);
    assert.deepEqual(JSON.parse(response.body), { error: 'write request refused' });
    assert.equal(calls.length, 0);
  });
});

describe('Hosts judged against the list', () => {
  const rows: ReadonlyArray<{
    readonly allowedHosts: readonly string[];
    readonly host: (port: number) => string;
    readonly status: number;
  }> = [
    { allowedHosts: [], host: (port) => `127.0.0.1:${port}`, status: 200 },
    { allowedHosts: [], host: () => 'box.tail1234.ts.net', status: 403 },
    { allowedHosts: ['box.tail1234.ts.net'], host: () => 'box.tail1234.ts.net', status: 200 },
    {
      allowedHosts: ['box.tail1234.ts.net'],
      host: (port) => `box.tail1234.ts.net:${port}`,
      status: 403,
    },
    {
      allowedHosts: ['box.tail1234.ts.net:8443'],
      host: () => 'box.tail1234.ts.net:8443',
      status: 200,
    },
    { allowedHosts: ['box.tail1234.ts.net'], host: () => 'evil.example', status: 403 },
  ];

  for (const row of rows) {
    it(`answers ${row.status} for a Host of ${row.host(4180)} with ${JSON.stringify(row.allowedHosts)}`, async () => {
      await createChange(root, 'Judge Hosts');
      const { runner } = recordingRunner();
      const handle = await startHostsServer(row.allowedHosts, runner);

      const response = await request(handle, 'GET', '/api/actions/001', {
        headers: { Host: row.host(handle.port) },
      });
      assert.equal(response.status, row.status, response.body);
      if (row.status === 200) {
        assert.match(JSON.parse(response.body).token, /^[0-9a-f]{64}$/);
      }
    });
  }
});
