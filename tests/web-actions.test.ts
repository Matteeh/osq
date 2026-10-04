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

const EPHEMERAL = defineConfig({ serve: { port: 0 } });
const OK: WebActionResult = { exitCode: 0, stdout: 'ok\n', stderr: '', error: null };
const RUN_RESULT: WebActionResult = {
  exitCode: 1,
  stdout: 'out\n',
  stderr: 'err\n',
  error: { message: 'nope', next: 'osq retry 001 1' },
};

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
  overrides: { runAction?: WebActionRunner } = {},
): Promise<WebServerHandle> {
  const handle = await startWebServer({
    projectRoot: root,
    config: EPHEMERAL,
    uiDir,
    home: homeDir,
    now: () => new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  });
  handles.push(handle);
  return handle;
}

function writeMarker(folderPath: string, rel: string, content = ''): Promise<void> {
  const target = path.join(folderPath, rel);
  return fs
    .mkdir(path.dirname(target), { recursive: true })
    .then(() => fs.writeFile(target, content));
}

/** Turn a created change into an unplanned one with a brief and sentinel verify. */
async function makeUnplanned(folderPath: string): Promise<void> {
  const proposal = path.join(folderPath, 'proposal.md');
  const content = await fs.readFile(proposal, 'utf8');
  await fs.writeFile(
    proposal,
    content.replace(/^verify:.*$/m, 'verify: node -e "process.exit(0)"'),
    'utf8',
  );
  await fs.writeFile(path.join(folderPath, 'brief.md'), '# Brief\n', 'utf8');
}

function recordingRunner(result: WebActionResult = OK): {
  runner: WebActionRunner;
  calls: WebActionRequest[];
} {
  const calls: WebActionRequest[] = [];
  const runner: WebActionRunner = async (action) => {
    calls.push(action);
    return result;
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

async function tokenOf(handle: WebServerHandle, id = '001'): Promise<string> {
  const response = await request(handle, 'GET', `/api/actions/${id}`);
  assert.equal(response.status, 200, response.body);
  const body = JSON.parse(response.body) as { token: string };
  return body.token;
}

async function snapshotTree(dir: string): Promise<string[]> {
  const entries: string[] = [];
  async function walk(current: string): Promise<void> {
    const children = await fs.readdir(current, { withFileTypes: true }).catch(() => null);
    if (children === null) return;
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, child.name);
      if (child.isDirectory()) {
        entries.push(`dir:${path.relative(dir, full)}`);
        await walk(full);
      } else {
        entries.push(
          `file:${path.relative(dir, full)}:${(await fs.readFile(full)).toString('base64')}`,
        );
      }
    }
  }
  await walk(dir);
  return entries;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('condition was never met');
}

beforeEach(async () => {
  root = await createProject();
  uiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-web-actions-ui-'));
  homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-web-actions-home-'));
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

describe('GET /api/actions', () => {
  it('lists the approval action and the server token for an allowed host', async () => {
    await createChange(root, 'Approval Action');
    const { runner, calls } = recordingRunner();
    const handle = await startServer({ runAction: runner });

    const response = await request(handle, 'GET', '/api/actions/001');
    assert.equal(response.status, 200);
    const body = JSON.parse(response.body) as {
      token: string;
      folderKey: string;
      actions: unknown;
      manual: unknown;
    };
    assert.match(body.token, /^[0-9a-f]{64}$/);
    assert.equal(body.folderKey, '001-approval-action');
    assert.deepEqual(body.actions, [{ verb: 'approve', command: 'osq approve 001', target: null }]);
    assert.deepEqual(body.manual, []);
    assert.equal(calls.length, 0);
  });

  it('lists a retry action with its target for a dead task', async () => {
    const change = await createChange(root, 'Dead Task Action');
    await writeMarker(change.folderPath, path.join('.run', 'approved'), 'sha256:x\n');
    await writeMarker(
      change.folderPath,
      path.join('.run', 'dead', '1.md'),
      '---\nreason: verify_red\n---\n',
    );
    const handle = await startServer({ runAction: recordingRunner().runner });

    const response = await request(handle, 'GET', '/api/actions/001');
    const body = JSON.parse(response.body) as { actions: unknown };
    assert.deepEqual(body.actions, [{ verb: 'retry', command: 'osq retry 001 1', target: '1' }]);
  });

  it('lists reject and change-level retry for a change regression', async () => {
    const change = await createChange(root, 'Regressed Change');
    await writeMarker(change.folderPath, path.join('.run', 'approved'), 'sha256:x\n');
    await writeMarker(
      change.folderPath,
      path.join('.run', 'regressed', 'change.md'),
      '---\nreason: worktree_dirty\n---\n',
    );
    const handle = await startServer({ runAction: recordingRunner().runner });

    const response = await request(handle, 'GET', '/api/actions/001');
    const body = JSON.parse(response.body) as { actions: unknown };
    assert.deepEqual(body.actions, [
      { verb: 'retry', command: 'osq retry 001 change', target: 'change' },
      { verb: 'reject', command: 'osq reject 001 --reason <text>', target: null },
    ]);
  });

  it('shows the plan command for an unplanned change with no dispatch item', async () => {
    const change = await createChange(root, 'Unplanned Action');
    await makeUnplanned(change.folderPath);
    const handle = await startServer({ runAction: recordingRunner().runner });

    const response = await request(handle, 'GET', '/api/actions/001');
    assert.equal(response.status, 200);
    const body = JSON.parse(response.body) as { actions: unknown; manual: unknown };
    assert.deepEqual(body.actions, []);
    assert.deepEqual(body.manual, ['osq plan 001']);
  });

  it('refuses a foreign host or a foreign origin without sending a token', async () => {
    await createChange(root, 'Approval Action');
    const handle = await startServer({ runAction: recordingRunner().runner });

    for (const headers of [
      { Host: 'evil.example:1234' } as Record<string, string>,
      { Origin: 'http://evil.example' } as Record<string, string>,
    ]) {
      const response = await request(handle, 'GET', '/api/actions/001', { headers });
      assert.equal(response.status, 403, JSON.stringify(headers));
      assert.deepEqual(JSON.parse(response.body), { error: 'request refused' });
      assert.equal(response.body.includes('token'), false);
    }
  });

  it('returns 400, 404 and 409 for unsafe, absent and ambiguous selectors', async () => {
    await createChange(root, 'Approval Action');
    const handle = await startServer({ runAction: recordingRunner().runner });

    const unsafe = await request(handle, 'GET', '/api/actions/a%2Fb');
    assert.equal(unsafe.status, 400);
    const absent = await request(handle, 'GET', '/api/actions/999');
    assert.equal(absent.status, 404);
  });

  it('is unknown when the server has no runAction', async () => {
    await createChange(root, 'Approval Action');
    const handle = await startServer();
    const response = await request(handle, 'GET', '/api/actions/001');
    assert.equal(response.status, 404);
  });
});

describe('POST /api/actions', () => {
  it('refuses every unproven request before reading its body or changing a file', async () => {
    await createChange(root, 'Approval Action');
    const { runner, calls } = recordingRunner();
    const handle = await startServer({ runAction: runner });
    const token = await tokenOf(handle);

    const valid = proof(handle, token);
    const cases: Array<Record<string, string>> = [
      { Origin: valid.Origin, 'Content-Type': 'application/json' },
      { ...valid, 'X-Osq-Token': 'not-the-token' },
      { 'Content-Type': 'application/json', 'X-Osq-Token': token },
      { ...valid, Origin: 'http://evil.example' },
      { ...valid, 'Content-Type': 'text/plain' },
    ];
    const before = await snapshotTree(root);
    for (const headers of cases) {
      const response = await request(handle, 'POST', '/api/actions/001', {
        headers,
        body: '{"verb":"approve"}',
      });
      assert.equal(response.status, 403, JSON.stringify(headers));
      assert.deepEqual(JSON.parse(response.body), { error: 'write request refused' });
    }
    assert.deepEqual(await snapshotTree(root), before);
    assert.equal(calls.length, 0);
  });

  it('runs one valid request and returns the runner result whatever its exit code', async () => {
    await createChange(root, 'Approval Action');
    const { runner, calls } = recordingRunner(RUN_RESULT);
    const handle = await startServer({ runAction: runner });
    const token = await tokenOf(handle);

    const response = await request(handle, 'POST', '/api/actions/001', {
      headers: proof(handle, token),
      body: JSON.stringify({ verb: 'retry', target: '2' }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), RUN_RESULT);
    assert.deepEqual(calls, [{ verb: 'retry', change: '001', target: '2' }]);
  });

  it('carries reject reasons and approve verbs to the runner', async () => {
    await createChange(root, 'Approval Action');
    const { runner, calls } = recordingRunner();
    const handle = await startServer({ runAction: runner });
    const token = await tokenOf(handle);

    await request(handle, 'POST', '/api/actions/001', {
      headers: proof(handle, token),
      body: JSON.stringify({ verb: 'reject', reason: 'stale' }),
    });
    await request(handle, 'POST', '/api/actions/001', {
      headers: proof(handle, token),
      body: JSON.stringify({ verb: 'approve' }),
    });
    assert.deepEqual(calls, [
      { verb: 'reject', change: '001', reason: 'stale' },
      { verb: 'approve', change: '001' },
    ]);
  });

  it('runs one write at a time and frees the slot afterwards', async () => {
    await createChange(root, 'Approval Action');
    const calls: WebActionRequest[] = [];
    let release: () => void = () => {};
    let block = true;
    const runner: WebActionRunner = async (action) => {
      calls.push(action);
      if (block) {
        block = false;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return OK;
    };
    const handle = await startServer({ runAction: runner });
    const token = await tokenOf(handle);

    const first = request(handle, 'POST', '/api/actions/001', {
      headers: proof(handle, token),
      body: JSON.stringify({ verb: 'approve' }),
    });
    await waitFor(() => calls.length === 1);

    const busy = await request(handle, 'POST', '/api/actions/001', {
      headers: proof(handle, token),
      body: JSON.stringify({ verb: 'land' }),
    });
    assert.equal(busy.status, 409);
    assert.deepEqual(JSON.parse(busy.body), { error: 'another action is running' });
    assert.equal(calls.length, 1);

    release();
    assert.equal((await first).status, 200);
    const next = await request(handle, 'POST', '/api/actions/001', {
      headers: proof(handle, token),
      body: JSON.stringify({ verb: 'land' }),
    });
    assert.equal(next.status, 200);
    assert.equal(calls.length, 2);
  });

  it('returns 400 for a bad body and a bad selector without running an action', async () => {
    await createChange(root, 'Approval Action');
    const { runner, calls } = recordingRunner();
    const handle = await startServer({ runAction: runner });
    const token = await tokenOf(handle);

    const bodies = ['{', '{"verb":"explode"}', '{"verb":"reject"}', '{"verb":"retry"}'];
    for (const body of bodies) {
      const response = await request(handle, 'POST', '/api/actions/001', {
        headers: proof(handle, token),
        body,
      });
      assert.equal(response.status, 400, body);
    }
    const unsafe = await request(handle, 'POST', '/api/actions/a%2Fb', {
      headers: proof(handle, token),
      body: JSON.stringify({ verb: 'approve' }),
    });
    assert.equal(unsafe.status, 400);
    assert.equal(calls.length, 0);
  });

  it('returns 500 when the runner rejects and frees the server for the next write', async () => {
    await createChange(root, 'Approval Action');
    let first = true;
    const calls: WebActionRequest[] = [];
    const runner: WebActionRunner = async (action) => {
      calls.push(action);
      if (first) {
        first = false;
        throw new Error('boom');
      }
      return OK;
    };
    const handle = await startServer({ runAction: runner });
    const token = await tokenOf(handle);

    const failed = await request(handle, 'POST', '/api/actions/001', {
      headers: proof(handle, token),
      body: JSON.stringify({ verb: 'approve' }),
    });
    assert.equal(failed.status, 500);
    assert.deepEqual(JSON.parse(failed.body), { error: 'boom' });

    const next = await request(handle, 'POST', '/api/actions/001', {
      headers: proof(handle, token),
      body: JSON.stringify({ verb: 'approve' }),
    });
    assert.equal(next.status, 200);
    assert.equal(calls.length, 2);
  });
});

describe('method routing around the actions path', () => {
  it('answers PUT on the actions path with 405 and calls no action', async () => {
    await createChange(root, 'Approval Action');
    const { runner, calls } = recordingRunner();
    const handle = await startServer({ runAction: runner });

    const response = await request(handle, 'PUT', '/api/actions/001');
    assert.equal(response.status, 405);
    assert.equal(response.headers.allow, 'GET, HEAD, POST');
    assert.equal(calls.length, 0);
  });

  it('keeps every other path read-only on a server with a runAction', async () => {
    await createChange(root, 'Approval Action');
    const { runner, calls } = recordingRunner();
    const handle = await startServer({ runAction: runner });

    const post = await request(handle, 'POST', '/api/report');
    assert.equal(post.status, 405);
    assert.equal(post.headers.allow, 'GET, HEAD');
    const put = await request(handle, 'PUT', '/api/actions');
    assert.equal(put.status, 405);
    assert.equal(put.headers.allow, 'GET, HEAD');
    assert.equal(calls.length, 0);
  });

  it('refuses POST on the actions path when the server has no runAction', async () => {
    await createChange(root, 'Approval Action');
    const handle = await startServer();

    const response = await request(handle, 'POST', '/api/actions/001', {
      headers: { 'Content-Type': 'application/json' },
      body: '{"verb":"approve"}',
    });
    assert.equal(response.status, 405);
    assert.equal(response.headers.allow, 'GET, HEAD');
  });
});
