import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { defineConfig } from '../src/core/foundation/config.js';
import { getMetricsReport } from '../src/core/report/report.js';
import { writeServiceRecord, writeWatcherRecord } from '../src/core/run/watch-state.js';
import type {
  WebActionRequest,
  WebActionResult,
  WebActionRunner,
} from '../src/core/web/web-actions.js';
import { type WebServerHandle, startWebServer } from '../src/core/web/web-server.js';
import { type WebServerSite, readServerStatus } from '../src/core/web/web-site.js';
import { createChange, createProject } from './planning-observed-helpers.js';

const EPHEMERAL = defineConfig({ serve: { port: 0 } });
const SITE: WebServerSite = { name: 'box', project: 'osq' };
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

/** Send a raw request through node:http so redirects are never followed. */
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
  overrides: { site?: WebServerSite; runAction?: WebActionRunner } = {},
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
  const response = await request(handle, 'GET', `/p/osq/api/actions/${id}`);
  assert.equal(response.status, 200, response.body);
  const body = JSON.parse(response.body) as { token: string };
  return body.token;
}

async function writeLiveRecords(waiting: string | null): Promise<void> {
  await writeServiceRecord(
    root,
    {
      pid: process.pid,
      startedAt: '2026-10-09T00:00:00.000Z',
      log: path.join(homeDir, 'watch.log'),
    },
    homeDir,
  );
  await writeWatcherRecord(
    root,
    {
      pid: process.pid,
      mode: 'background',
      version: '0.2.4',
      commit: 'f532410',
      startedAt: '2026-10-09T00:00:01.000Z',
      waiting,
    },
    homeDir,
  );
}

beforeEach(async () => {
  root = await createProject();
  uiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-web-site-ui-'));
  homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-web-site-home-'));
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

describe('project paths on a server', () => {
  it('answers the paths with a site table and returns the /p/<project>/ url', async () => {
    const handle = await startServer({ site: SITE });
    assert.equal(handle.url, `http://127.0.0.1:${handle.port}/p/osq/`);

    for (const target of ['/', '/p/osq']) {
      const response = await request(handle, 'GET', target);
      assert.equal(response.status, 302, target);
      assert.equal(response.headers.location, '/p/osq/', target);
    }
    for (const target of ['/', '/p/osq']) {
      const response = await request(handle, 'HEAD', target);
      assert.equal(response.status, 302, `HEAD ${target}`);
      assert.equal(response.headers.location, '/p/osq/', `HEAD ${target}`);
    }

    const index = await request(handle, 'GET', '/p/osq/');
    assert.equal(index.status, 200);
    assert.match(index.body, /id="root"/);

    const report = await request(handle, 'GET', '/p/osq/api/report');
    assert.equal(report.status, 200);
    assert.deepEqual(JSON.parse(report.body), await getMetricsReport(root, EPHEMERAL));

    const status = await request(handle, 'GET', '/p/osq/api/server');
    assert.equal(status.status, 200);

    for (const target of ['/api/report', '/p/other/api/report']) {
      const response = await request(handle, 'GET', target);
      assert.equal(response.status, 404, target);
      assert.deepEqual(JSON.parse(response.body), { error: 'not found' }, target);
    }
  });

  it('routes a write through the project path and leaves the bare path unknown', async () => {
    await createChange(root, 'Approval Action');
    const { runner, calls } = recordingRunner();
    const handle = await startServer({ site: SITE, runAction: runner });
    const token = await tokenOf(handle);
    assert.match(token, /^[0-9a-f]{64}$/);

    const accepted = await request(handle, 'POST', '/p/osq/api/actions/001', {
      headers: proof(handle, token),
      body: JSON.stringify({ verb: 'retry', target: '2' }),
    });
    assert.equal(accepted.status, 200, accepted.body);
    assert.deepEqual(calls, [{ verb: 'retry', change: '001', target: '2' }]);

    const bare = await request(handle, 'POST', '/api/actions/001', {
      headers: proof(handle, token),
      body: JSON.stringify({ verb: 'approve' }),
    });
    assert.equal(bare.status, 404);
    assert.deepEqual(JSON.parse(bare.body), { error: 'not found' });
    assert.equal(calls.length, 1);
  });

  it('reports the live service and watcher records afresh on each status request', async () => {
    await writeLiveRecords('osq build is stale');
    const handle = await startServer({ site: SITE });

    const direct = await readServerStatus(root, SITE, homeDir);
    assert.equal(direct.name, 'box');
    assert.equal(direct.project, 'osq');
    assert.equal(direct.path, '/p/osq/');
    assert.equal(direct.service?.pid, process.pid);
    assert.equal(direct.watcher?.waiting, 'osq build is stale');
    assert.ok(path.isAbsolute(direct.log));

    const first = await request(handle, 'GET', '/p/osq/api/server');
    assert.equal(first.status, 200);
    assert.equal(first.headers['cache-control'], 'no-store');
    const body = JSON.parse(first.body) as {
      name: string;
      project: string;
      path: string;
      service: { pid: number } | null;
      watcher: { mode: string; version: string; commit: string; waiting: string | null } | null;
    };
    assert.equal(body.name, 'box');
    assert.equal(body.project, 'osq');
    assert.equal(body.path, '/p/osq/');
    assert.equal(body.service?.pid, process.pid);
    assert.equal(body.watcher?.mode, 'background');
    assert.equal(body.watcher?.version, '0.2.4');
    assert.equal(body.watcher?.commit, 'f532410');
    assert.equal(body.watcher?.waiting, 'osq build is stale');

    await writeLiveRecords(null);
    const second = await request(handle, 'GET', '/p/osq/api/server');
    const changed = JSON.parse(second.body) as { watcher: { waiting: string | null } | null };
    assert.equal(changed.watcher?.waiting, null);
  });

  it('answers no project path, no status document and a bare url without a site', async () => {
    const handle = await startServer();
    assert.equal(handle.url, `http://127.0.0.1:${handle.port}/`);

    for (const target of ['/api/server', '/p/osq/api/report']) {
      const response = await request(handle, 'GET', target);
      assert.equal(response.status, 404, target);
    }
  });
});
