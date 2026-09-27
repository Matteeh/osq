import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { defineConfig } from '../src/core/foundation/config.js';
import type { SystemGraph } from '../src/core/web/system-graph-types.js';
import { getSystemGraph } from '../src/core/web/system-graph.js';
import {
  type WebServerHandle,
  type WebServerOptions,
  serializeWebJson,
  startWebServer,
} from '../src/core/web/web-server.js';
import { buildWebFixture } from './fixtures/web/build.js';

const EPHEMERAL = defineConfig({ serve: { port: 0 } });

let tmpDir: string;
let uiDir: string;
let now: Date;
const handles: WebServerHandle[] = [];

async function startServer(overrides: Partial<WebServerOptions> = {}): Promise<WebServerHandle> {
  const handle = await startWebServer({
    projectRoot: tmpDir,
    config: EPHEMERAL,
    uiDir,
    now: () => now,
    ...overrides,
  });
  handles.push(handle);
  return handle;
}

function systemUrl(handle: WebServerHandle): string {
  return new URL('/api/system', handle.url).toString();
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-serve-system-'));
  uiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-serve-system-ui-'));
  now = new Date('2026-06-01T00:00:00.000Z');
  await buildWebFixture(tmpDir);
});

afterEach(async () => {
  while (handles.length > 0) {
    const handle = handles.pop();
    if (handle) await handle.close();
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.rm(uiDir, { recursive: true, force: true });
});

describe('serve /api/system', () => {
  it('serves the system document from getSystemGraph with no-store JSON', async () => {
    const handle = await startServer();
    const expected = await getSystemGraph(tmpDir, EPHEMERAL);

    const response = await fetch(systemUrl(handle));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), null);

    const body = await response.text();
    assert.equal(body, serializeWebJson(expected));
    assert.deepEqual(JSON.parse(body), expected);

    const second = await fetch(systemUrl(handle));
    assert.equal(await second.text(), body);
  });

  it('answers HEAD with GET status and headers and no body', async () => {
    const handle = await startServer();
    const url = systemUrl(handle);

    const get = await fetch(url);
    const body = await get.text();
    assert.ok(body.length > 0);

    const head = await fetch(url, { method: 'HEAD' });
    assert.equal(head.status, get.status);
    assert.equal(head.headers.get('content-type'), get.headers.get('content-type'));
    assert.equal(head.headers.get('cache-control'), get.headers.get('cache-control'));
    assert.equal(head.headers.get('content-length'), get.headers.get('content-length'));
    assert.equal(await head.text(), '');
  });

  it('uses an injected getSystem and reports its failure without terminating', async () => {
    const failing = await startServer({
      getSystem: async () => {
        throw new Error('system exploded');
      },
    });
    const failed = await fetch(systemUrl(failing));
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { error: 'system exploded' });

    const injected: SystemGraph = { version: 1, nodes: [], edges: [] };
    const stub = await startServer({ getSystem: async () => injected });
    const response = await fetch(systemUrl(stub));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), injected);
  });
});
