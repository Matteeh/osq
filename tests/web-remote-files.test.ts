import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { defineConfig } from '../src/core/foundation/config.js';
import type { ForwardedCommandRunner } from '../src/core/web/web-remote.js';
import { type WebServerHandle, startWebServer } from '../src/core/web/web-server.js';
import type { WebServerSite } from '../src/core/web/web-site.js';

const EPHEMERAL = defineConfig({ serve: { port: 0 } });
const SITE: WebServerSite = { name: 'box', project: 'osq' };
const RUNNER: ForwardedCommandRunner = async () => ({ exitCode: 0, error: null, next: null });
const FOLDER = '001-demo';

let root: string;
let uiDir: string;
let homeDir: string;
let handle: WebServerHandle;

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
  server: WebServerHandle,
  method: string,
  target: string,
  options: RequestOptions = {},
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: server.port, method, path: target, headers: options.headers },
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

async function write(rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** Every path under `dir` with its bytes, so a refusal can prove nothing moved. */
async function snapshot(dir: string): Promise<string[]> {
  const entries: string[] = [];
  const walk = async (current: string): Promise<void> => {
    const children = await fs.readdir(current, { withFileTypes: true }).catch(() => null);
    if (children === null) return;
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, child.name);
      if (child.isDirectory()) {
        entries.push(`dir:${path.relative(dir, full)}`);
        await walk(full);
      } else {
        const content = (await fs.readFile(full)).toString('base64');
        entries.push(`file:${path.relative(dir, full)}:${content}`);
      }
    }
  };
  await walk(dir);
  return entries;
}

function proof(token: string): Record<string, string> {
  return {
    Origin: `http://127.0.0.1:${handle.port}`,
    'Content-Type': 'application/json',
    'X-Osq-Token': token,
  };
}

async function commandToken(): Promise<string> {
  const response = await request(handle, 'GET', '/p/osq/api/commands');
  assert.equal(response.status, 200, response.body);
  return (JSON.parse(response.body) as { token: string }).token;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-remote-files-'));
  uiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-remote-files-ui-'));
  homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-remote-files-home-'));
  await fs.writeFile(path.join(uiDir, 'index.html'), '<!doctype html><div id="root"></div>');
  await write(`openspec/changes/${FOLDER}/proposal.md`, '# Proposal\n');
  await write(`openspec/changes/${FOLDER}/tasks/1.md`, '# Task\n');
  await write(`openspec/changes/${FOLDER}/.run/manifest.json`, '{"state":"planned"}\n');
  handle = await startWebServer({
    projectRoot: root,
    config: EPHEMERAL,
    uiDir,
    home: homeDir,
    site: SITE,
    runCommand: RUNNER,
  });
});

afterEach(async () => {
  await handle.close();
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(uiDir, { recursive: true, force: true });
  await fs.rm(homeDir, { recursive: true, force: true });
});

describe('GET /api/files', () => {
  it('downloads an unapproved change folder without its .run folder', async () => {
    const response = await request(handle, 'GET', '/p/osq/api/files/001');

    assert.equal(response.status, 200, response.body);
    assert.deepEqual(JSON.parse(response.body), {
      folder: FOLDER,
      files: { 'proposal.md': '# Proposal\n', 'tasks/1.md': '# Task\n' },
    });
  });

  it('uses the read guard and refuses a foreign host', async () => {
    const response = await request(handle, 'GET', '/p/osq/api/files/001', {
      headers: { Host: 'evil.example' },
    });

    assert.equal(response.status, 403);
    assert.deepEqual(JSON.parse(response.body), { error: 'request refused' });
  });

  it('answers an unknown change and an unsafe selector', async () => {
    const missing = await request(handle, 'GET', '/p/osq/api/files/999');
    assert.equal(missing.status, 404);
    assert.deepEqual(JSON.parse(missing.body), { error: 'change 999 not found' });

    const unsafe = await request(handle, 'GET', '/p/osq/api/files/%2e%2e');
    assert.equal(unsafe.status, 400);
    assert.deepEqual(JSON.parse(unsafe.body), { error: 'unsafe change selector' });
  });
});

describe('PUT /api/files', () => {
  it('replaces the folder with the uploaded files and leaves .run alone', async () => {
    const token = await commandToken();
    const response = await request(handle, 'PUT', '/p/osq/api/files/001', {
      headers: proof(token),
      body: JSON.stringify({ files: { 'proposal.md': '# New\n', 'tasks/2.md': '# Two\n' } }),
    });

    assert.equal(response.status, 200, response.body);
    assert.deepEqual(JSON.parse(response.body), { folder: FOLDER, files: 2 });

    const folder = path.join(root, 'openspec', 'changes', FOLDER);
    assert.equal(await fs.readFile(path.join(folder, 'proposal.md'), 'utf8'), '# New\n');
    assert.equal(await fs.readFile(path.join(folder, 'tasks', '2.md'), 'utf8'), '# Two\n');
    assert.equal(
      await fs.readFile(path.join(folder, '.run', 'manifest.json'), 'utf8'),
      '{"state":"planned"}\n',
    );
    assert.equal(await fs.stat(path.join(folder, 'tasks', '1.md')).catch(() => null), null);
  });

  it('refuses every path outside the change folder and changes nothing', async () => {
    const token = await commandToken();
    const refused: ReadonlyArray<readonly [string, string]> = [
      ['../x.md', 'path outside the change folder: ../x.md'],
      ['/etc/x.md', 'path outside the change folder: /etc/x.md'],
      ['.run/approved', 'path outside the change folder: .run/approved'],
      ['tasks/../../x.md', 'path outside the change folder: tasks/../../x.md'],
      ['tasks//1.md', 'path outside the change folder: tasks//1.md'],
      ['a\\b.md', 'path outside the change folder: a\\b.md'],
    ];

    for (const [bad, error] of refused) {
      const before = await snapshot(root);
      const response = await request(handle, 'PUT', '/p/osq/api/files/001', {
        headers: proof(token),
        body: JSON.stringify({ files: { 'proposal.md': '# Keep\n', [bad]: 'x' } }),
      });
      assert.equal(response.status, 400, bad);
      assert.deepEqual(JSON.parse(response.body), { error }, bad);
      assert.deepEqual(await snapshot(root), before, bad);
    }
  });

  it('refuses an approved change and changes nothing', async () => {
    await write(`openspec/changes/${FOLDER}/.run/approved`, 'sha256:x\n');
    const token = await commandToken();
    const before = await snapshot(root);
    const expected = {
      error: `change ${FOLDER} is approved; only an unapproved change's files move`,
    };

    const upload = await request(handle, 'PUT', '/p/osq/api/files/001', {
      headers: proof(token),
      body: JSON.stringify({ files: { 'proposal.md': '# New\n' } }),
    });
    assert.equal(upload.status, 409);
    assert.deepEqual(JSON.parse(upload.body), expected);

    const download = await request(handle, 'GET', '/p/osq/api/files/001');
    assert.equal(download.status, 409);
    assert.deepEqual(JSON.parse(download.body), expected);
    assert.deepEqual(await snapshot(root), before);
  });

  it('refuses an upload without proof and changes nothing', async () => {
    const before = await snapshot(root);
    const response = await request(handle, 'PUT', '/p/osq/api/files/001', {
      headers: { Origin: `http://127.0.0.1:${handle.port}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { 'proposal.md': '# New\n' } }),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(JSON.parse(response.body), { error: 'write request refused' });
    assert.deepEqual(await snapshot(root), before);
  });

  it('refuses a malformed upload body and changes nothing', async () => {
    const token = await commandToken();
    const before = await snapshot(root);
    const bodies = ['{', '{"files":[]}', '{"files":{"a.md":1}}', '[1,2]'];

    for (const body of bodies) {
      const response = await request(handle, 'PUT', '/p/osq/api/files/001', {
        headers: proof(token),
        body,
      });
      assert.equal(response.status, 400, body);
      assert.deepEqual(JSON.parse(response.body), {
        error: 'body must be {"files": {"<path>": "<text>"}}',
      });
    }
    assert.deepEqual(await snapshot(root), before);
  });

  it('refuses a second upload while one is running', async () => {
    const token = await commandToken();
    const headers = proof(token);
    const first = http.request({
      host: '127.0.0.1',
      port: handle.port,
      method: 'PUT',
      path: '/p/osq/api/files/001',
      headers,
    });
    const firstDone = new Promise<Response>((resolve, reject) => {
      first.on('response', (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      });
      first.on('error', reject);
    });
    first.write('{"files":{"proposal.md":"holding');

    await new Promise((resolve) => setTimeout(resolve, 30));
    const second = await request(handle, 'PUT', '/p/osq/api/files/001', {
      headers: proof(token),
      body: JSON.stringify({ files: { 'proposal.md': '# Other\n' } }),
    });
    assert.equal(second.status, 409);
    assert.deepEqual(JSON.parse(second.body), { error: 'another upload is running' });

    first.end('"}}');
    const done = await firstDone;
    assert.equal(done.status, 200, done.body);
  });
});
