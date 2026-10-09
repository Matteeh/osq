import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { defineConfig } from '../src/core/foundation/config.js';
import type { WebActionRunner } from '../src/core/web/web-actions.js';
import type {
  ForwardedCommand,
  ForwardedCommandRunner,
  ForwardedEnd,
  ForwardedOutput,
} from '../src/core/web/web-remote.js';
import { type WebServerHandle, startWebServer } from '../src/core/web/web-server.js';
import type { WebServerSite } from '../src/core/web/web-site.js';
import { createChange, createProject } from './planning-observed-helpers.js';

const EPHEMERAL = defineConfig({ serve: { port: 0 } });
const SITE: WebServerSite = { name: 'box', project: 'osq' };
const DONE: ForwardedEnd = { exitCode: 0, error: null, next: null };
const OK_ACTION = async () => ({ exitCode: 0, stdout: 'ok\n', stderr: '', error: null });

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

async function startServer(
  overrides: {
    site?: WebServerSite;
    runCommand?: ForwardedCommandRunner;
    runAction?: WebActionRunner;
  } = {},
): Promise<WebServerHandle> {
  const handle = await startWebServer({
    projectRoot: root,
    config: EPHEMERAL,
    uiDir,
    home: homeDir,
    ...overrides,
  });
  handles.push(handle);
  return handle;
}

function recordingRunner(
  end: ForwardedEnd = DONE,
  outputs: readonly ForwardedOutput[] = [],
): { runner: ForwardedCommandRunner; calls: ForwardedCommand[] } {
  const calls: ForwardedCommand[] = [];
  const runner: ForwardedCommandRunner = async (command, emit) => {
    calls.push(command);
    for (const output of outputs) emit(output);
    return end;
  };
  return { runner, calls };
}

/** POST headers proving the request came from osq's own page. */
function proof(handle: WebServerHandle, token: string): Record<string, string> {
  return {
    Origin: `http://127.0.0.1:${handle.port}`,
    'Content-Type': 'application/json',
    'X-Osq-Token': token,
  };
}

async function commandToken(handle: WebServerHandle): Promise<string> {
  const response = await request(handle, 'GET', '/p/osq/api/commands');
  assert.equal(response.status, 200, response.body);
  return (JSON.parse(response.body) as { token: string }).token;
}

const BODY = JSON.stringify({ command: 'status', args: [], options: {} });

beforeEach(async () => {
  root = await createProject();
  uiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-remote-commands-ui-'));
  homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-remote-commands-home-'));
  await fs.writeFile(path.join(uiDir, 'index.html'), '<!doctype html><div id="root"></div>');
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

describe('POST /api/commands', () => {
  it('streams a forwarded command as NDJSON and ends with its result', async () => {
    const { runner, calls } = recordingRunner({ exitCode: 2, error: 'x', next: 'osq y' }, [
      { stream: 'stdout', text: 'a\n' },
      { stream: 'stderr', text: 'b\n' },
    ]);
    const handle = await startServer({ site: SITE, runCommand: runner });
    const token = await commandToken(handle);

    const response = await request(handle, 'POST', '/p/osq/api/commands', {
      headers: proof(handle, token),
      body: BODY,
    });

    assert.equal(response.status, 200, response.body);
    assert.equal(response.headers['content-type'], 'application/x-ndjson');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(
      response.body,
      [
        '{"stream":"stdout","text":"a\\n"}',
        '{"stream":"stderr","text":"b\\n"}',
        '{"exitCode":2,"error":"x","next":"osq y"}',
        '',
      ].join('\n'),
    );
    assert.deepEqual(calls, [{ command: 'status', args: [], options: {} }]);
  });

  it('ends with exit code 1 and the error when the runner rejects', async () => {
    const runner: ForwardedCommandRunner = async () => {
      throw new Error('boom');
    };
    const handle = await startServer({ site: SITE, runCommand: runner });
    const token = await commandToken(handle);

    const response = await request(handle, 'POST', '/p/osq/api/commands', {
      headers: proof(handle, token),
      body: BODY,
    });

    assert.equal(response.status, 200, response.body);
    assert.equal(response.body, '{"exitCode":1,"error":"Error: boom","next":null}\n');
  });

  it('refuses a command without proof and never calls the runner', async () => {
    const { runner, calls } = recordingRunner();
    const handle = await startServer({ site: SITE, runCommand: runner });
    const token = await commandToken(handle);
    const origin = `http://127.0.0.1:${handle.port}`;
    const cases: Record<string, string>[] = [
      { Origin: origin, 'Content-Type': 'application/json' },
      { Origin: origin, 'Content-Type': 'application/json', 'X-Osq-Token': '0'.repeat(64) },
      { 'Content-Type': 'application/json', 'X-Osq-Token': token },
      { Origin: 'http://evil.example', 'Content-Type': 'application/json', 'X-Osq-Token': token },
      { Origin: origin, 'Content-Type': 'text/plain', 'X-Osq-Token': token },
    ];

    for (const headers of cases) {
      const response = await request(handle, 'POST', '/p/osq/api/commands', {
        headers,
        body: BODY,
      });
      assert.equal(response.status, 403, JSON.stringify(headers));
      assert.deepEqual(JSON.parse(response.body), { error: 'write request refused' });
    }
    assert.equal(calls.length, 0);
  });

  it('refuses a malformed command body and never calls the runner', async () => {
    const { runner, calls } = recordingRunner();
    const handle = await startServer({ site: SITE, runCommand: runner });
    const token = await commandToken(handle);
    const bodies = [
      '{',
      '{"args":[],"options":{}}',
      '{"command":"status","args":"x","options":{}}',
      '{"command":"status","args":[],"options":[]}',
    ];

    for (const body of bodies) {
      const response = await request(handle, 'POST', '/p/osq/api/commands', {
        headers: proof(handle, token),
        body,
      });
      assert.equal(response.status, 400, body);
      assert.equal(typeof (JSON.parse(response.body) as { error: string }).error, 'string', body);
    }
    assert.equal(calls.length, 0);
  });
});

describe('GET /api/commands', () => {
  it('hands out a command token the actions document does not carry', async () => {
    await createChange(root, 'Command Token');
    const handle = await startServer({
      site: SITE,
      runCommand: recordingRunner().runner,
      runAction: OK_ACTION,
    });

    const response = await request(handle, 'GET', '/p/osq/api/commands');
    assert.equal(response.status, 200, response.body);
    const token = (JSON.parse(response.body) as { token: string }).token;
    assert.match(token, /^[0-9a-f]{64}$/);

    const actions = await request(handle, 'GET', '/p/osq/api/actions/001');
    assert.equal(actions.status, 200, actions.body);
    const actionsToken = (JSON.parse(actions.body) as { token: string }).token;
    assert.match(actionsToken, /^[0-9a-f]{64}$/);
    assert.notEqual(token, actionsToken);
  });

  it('refuses a foreign host without sending the token', async () => {
    const handle = await startServer({ site: SITE, runCommand: recordingRunner().runner });

    const response = await request(handle, 'GET', '/p/osq/api/commands', {
      headers: { Host: 'evil.example' },
    });

    assert.equal(response.status, 403);
    assert.deepEqual(JSON.parse(response.body), { error: 'request refused' });
    assert.equal(response.body.includes('token'), false);
  });
});

describe('command paths without a runner', () => {
  it('answers the command path exactly as before without a runner or a site', async () => {
    const withSite = await startServer({ site: SITE });
    const noRunner = await request(withSite, 'GET', '/p/osq/api/commands');
    assert.equal(noRunner.status, 404);
    assert.deepEqual(JSON.parse(noRunner.body), { error: 'not found' });

    const noSite = await startServer({ runCommand: recordingRunner().runner });
    const bare = await request(noSite, 'GET', '/api/commands');
    assert.equal(bare.status, 404);
    assert.deepEqual(JSON.parse(bare.body), { error: 'not found' });
  });
});
