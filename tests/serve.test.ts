import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createProgram } from '../src/cli/index.js';
import { browserCommand, parsePortArgument, serveCommand } from '../src/cli/serve.js';
import { defineConfig } from '../src/core/foundation/config.js';
import { getMetricsReport } from '../src/core/report/report.js';
import { readInbox } from '../src/core/status/inbox-projection.js';
import { getWebChange } from '../src/core/web/web-data-change.js';
import { getWebGraph } from '../src/core/web/web-data-graph.js';
import {
  type WebServerHandle,
  type WebServerOptions,
  serializeWebJson,
  startWebServer,
} from '../src/core/web/web-server.js';
import { UI_CONTENT_SECURITY_POLICY, resolveUiDir } from '../src/core/web/web-static.js';
import { buildWebFixture, writeRunningLock } from './fixtures/web/build.js';

let tmpDir: string;
let uiDir: string;
let homeDir: string;
let now: Date;
const handles: WebServerHandle[] = [];
const controllers: AbortController[] = [];
const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function newController(): AbortController {
  const controller = new AbortController();
  controllers.push(controller);
  return controller;
}

const EPHEMERAL = defineConfig({ serve: { port: 0 } });

async function writeUiFile(relative: string, content: string | Buffer): Promise<void> {
  const target = path.join(uiDir, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}

async function startServer(overrides: Partial<WebServerOptions> = {}): Promise<WebServerHandle> {
  const handle = await startWebServer({
    projectRoot: tmpDir,
    config: EPHEMERAL,
    uiDir,
    home: homeDir,
    now: () => now,
    ...overrides,
  });
  handles.push(handle);
  return handle;
}

function apiUrl(handle: WebServerHandle, relative: string): string {
  return new URL(relative, handle.url).toString();
}

async function snapshotTree(root: string): Promise<string[]> {
  const entries: string[] = [];
  async function walk(dir: string): Promise<void> {
    const children = await fs.readdir(dir, { withFileTypes: true }).catch(() => null);
    if (children === null) return;
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, child.name);
      const relative = path.relative(root, full);
      if (child.isDirectory()) {
        entries.push(`dir:${relative}`);
        await walk(full);
      } else {
        entries.push(`file:${relative}:${(await fs.readFile(full)).toString('base64')}`);
      }
    }
  }
  await walk(root);
  return entries;
}

async function reserveFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as net.AddressInfo;
      server.close(() => resolve(address.port));
    });
  });
}

function captureStdout(): { line: Promise<string>; write: (value: string) => void } {
  let resolveLine: (value: string) => void = () => {};
  const line = new Promise<string>((resolve) => {
    resolveLine = resolve;
  });
  return { line, write: (value: string) => resolveLine(value) };
}

/** Send a raw request path so URL parsing in the test cannot normalize dot segments. */
function rawRequest(
  handle: WebServerHandle,
  method: string,
  rawPath: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port: handle.port, method, path: rawPath },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('end', () =>
          resolve({ status: response.statusCode ?? 0, headers: response.headers, body }),
        );
      },
    );
    request.on('error', reject);
    request.end();
  });
}

async function closeBlocker(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-serve-'));
  uiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-serve-ui-'));
  homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-serve-home-'));
  now = new Date('2026-06-01T00:00:00.000Z');
  await buildWebFixture(tmpDir);
  await writeRunningLock(tmpDir, now.getTime() - 9000);
});

afterEach(async () => {
  for (const controller of controllers) controller.abort();
  controllers.length = 0;
  while (handles.length > 0) {
    const handle = handles.pop();
    if (handle) await handle.close();
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.rm(uiDir, { recursive: true, force: true });
  await fs.rm(homeDir, { recursive: true, force: true });
});

describe('serve configuration and CLI registration', () => {
  it('parses only integer ports from 0 through 65535', () => {
    assert.equal(parsePortArgument('0'), 0);
    assert.equal(parsePortArgument('4173'), 4173);
    assert.equal(parsePortArgument('65535'), 65535);
    for (const invalid of ['1.5', '-1', '65536', ' 12', '12 ', '12abc', '', '1e3', '+1']) {
      assert.throws(() => parsePortArgument(invalid), { name: 'InvalidArgumentError' });
    }
  });

  it('registers serve with port and open options', () => {
    const program = createProgram();
    const serve = program.commands.find((command) => command.name() === 'serve');
    assert.ok(serve);
    assert.ok(serve.options.some((option) => option.long === '--port'));
    assert.ok(serve.options.some((option) => option.long === '--open'));
  });

  it('rejects an invalid CLI port before dispatching the command', async () => {
    const program = createProgram();
    program.exitOverride();
    program.commands.find((command) => command.name() === 'serve')?.exitOverride();
    await assert.rejects(() => program.parseAsync(['node', 'osq', 'serve', '--port', '1.5']));
    await assert.rejects(() => program.parseAsync(['node', 'osq', 'serve', '--port', '70000']));
  });

  it('uses the configured port and lets the CLI port override it', async () => {
    const configured = await reserveFreePort();
    const overridden = await reserveFreePort();

    const configuredCapture = captureStdout();
    const configuredController = newController();
    const configuredDone = serveCommand({
      cwd: tmpDir,
      config: defineConfig({ serve: { port: configured } }),
      uiDir,
      home: homeDir,
      signal: configuredController.signal,
      stdout: configuredCapture.write,
    });
    assert.equal(await configuredCapture.line, `http://127.0.0.1:${configured}/`);
    configuredController.abort();
    await configuredDone;

    const overrideCapture = captureStdout();
    const overrideController = newController();
    const overrideDone = serveCommand({
      cwd: tmpDir,
      config: defineConfig({ serve: { port: configured } }),
      port: overridden,
      uiDir,
      home: homeDir,
      signal: overrideController.signal,
      stdout: overrideCapture.write,
    });
    assert.equal(await overrideCapture.line, `http://127.0.0.1:${overridden}/`);
    overrideController.abort();
    await overrideDone;
  });

  it('opens the printed URL once after listening and exposes platform commands', async () => {
    const port = await reserveFreePort();
    const capture = captureStdout();
    const controller = newController();
    const opened: string[] = [];
    const done = serveCommand({
      cwd: tmpDir,
      config: defineConfig({ serve: { port } }),
      open: true,
      uiDir,
      home: homeDir,
      signal: controller.signal,
      stdout: capture.write,
      launchBrowser: async (url) => {
        opened.push(url);
        const response = await fetch(new URL('api/report', url));
        assert.equal(response.status, 200);
      },
    });
    const url = await capture.line;
    assert.equal(url, `http://127.0.0.1:${port}/`);
    controller.abort();
    await done;
    assert.deepEqual(opened, [url]);

    assert.deepEqual(browserCommand('darwin', url), { command: 'open', args: [url] });
    assert.deepEqual(browserCommand('win32', url), {
      command: 'cmd',
      args: ['/c', 'start', '', url],
    });
    assert.deepEqual(browserCommand('linux', url), { command: 'xdg-open', args: [url] });
  });

  it('closes the listener when browser launch fails', async () => {
    const port = await reserveFreePort();
    const controller = newController();
    const done = serveCommand({
      cwd: tmpDir,
      config: defineConfig({ serve: { port } }),
      open: true,
      uiDir,
      home: homeDir,
      signal: controller.signal,
      stdout: () => {},
      launchBrowser: async () => {
        throw new Error('no browser here');
      },
    });
    await assert.rejects(done, /could not open http:\/\/127\.0\.0\.1:/);

    const rebound = http.createServer();
    await new Promise<void>((resolve) => rebound.listen(port, '127.0.0.1', () => resolve()));
    await closeBlocker(rebound);
  });

  it('reports EADDRINUSE without printing a URL or leaking a listener', async () => {
    const port = await reserveFreePort();
    const blocker = http.createServer();
    await new Promise<void>((resolve) => blocker.listen(port, '127.0.0.1', () => resolve()));
    const controller = newController();
    let printed = false;
    const done = serveCommand({
      cwd: tmpDir,
      config: defineConfig({ serve: { port } }),
      uiDir,
      home: homeDir,
      signal: controller.signal,
      stdout: () => {
        printed = true;
      },
    });
    await assert.rejects(done, /EADDRINUSE|address already in use/i);
    assert.equal(printed, false);
    await closeBlocker(blocker);

    const rebound = http.createServer();
    await new Promise<void>((resolve) => rebound.listen(port, '127.0.0.1', () => resolve()));
    await closeBlocker(rebound);
  });
});

describe('loopback read-only API', () => {
  it('binds loopback and returns the exact report with no-store deterministic JSON', async () => {
    const handle = await startServer();
    assert.ok(handle.url.startsWith('http://127.0.0.1:'));
    assert.ok(handle.port > 0);

    const report = await getMetricsReport(tmpDir, EPHEMERAL);
    const first = await fetch(apiUrl(handle, '/api/report'));
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(first.headers.get('cache-control'), 'no-store');
    assert.equal(first.headers.get('access-control-allow-origin'), null);
    const body = await first.text();
    assert.deepEqual(JSON.parse(body), report);
    assert.equal(body, serializeWebJson(report));

    const second = await fetch(apiUrl(handle, '/api/report'));
    assert.equal(await second.text(), body);
  });

  it('serves the graph document and the read-only inbox without advancing the cursor', async () => {
    const handle = await startServer();
    const graph = await fetch(apiUrl(handle, '/api/graph'));
    assert.deepEqual(await graph.json(), await getWebGraph(tmpDir, EPHEMERAL));

    const expected = await readInbox(tmpDir, { config: EPHEMERAL, now, home: homeDir });
    const inbox = await fetch(apiUrl(handle, '/api/inbox'));
    assert.deepEqual(await inbox.json(), expected);
    await assert.rejects(() => fs.stat(path.join(homeDir, '.osq', 'last-look')));
  });

  it('serves a selected change and maps absent and ambiguous selectors', async () => {
    const handle = await startServer();
    const selected = await fetch(apiUrl(handle, '/api/changes/010'));
    assert.deepEqual(await selected.json(), await getWebChange(tmpDir, '010', EPHEMERAL, now));

    const ambiguous = await fetch(apiUrl(handle, '/api/changes/002'));
    assert.equal(ambiguous.status, 409);

    const absent = await fetch(apiUrl(handle, '/api/changes/999'));
    assert.equal(absent.status, 404);

    const unknown = await fetch(apiUrl(handle, '/api/nope'));
    assert.equal(unknown.status, 404);
    assert.equal(unknown.headers.get('cache-control'), 'no-store');
  });

  it('rejects unsafe and malformed change selectors', async () => {
    const handle = await startServer();
    for (const selector of ['..', '%2e%2e', 'a%2Fb', 'a%5Cb', '%ZZ', '%00']) {
      const response = await rawRequest(handle, 'GET', `/api/changes/${selector}`);
      assert.equal(response.status, 400, `selector ${selector}`);
      assert.equal(response.headers['cache-control'], 'no-store');
    }
  });

  it('rejects every other method before route lookup with Allow GET, HEAD', async () => {
    const handle = await startServer();
    for (const [method, target] of [
      ['POST', '/api/report'],
      ['PUT', '/api/graph'],
      ['PATCH', '/'],
      ['DELETE', '/api/changes/..%2F..'],
    ] as const) {
      const response = await rawRequest(handle, method, target);
      assert.equal(response.status, 405, `${method} ${target}`);
      assert.equal(response.headers.allow, 'GET, HEAD');
      assert.equal(response.headers['access-control-allow-origin'], undefined);
      assert.deepEqual(JSON.parse(response.body), { error: 'method not allowed' });
    }
  });

  it('answers HEAD with matching status and headers and no body', async () => {
    const handle = await startServer();
    const get = await fetch(apiUrl(handle, '/api/report'));
    const head = await fetch(apiUrl(handle, '/api/report'), { method: 'HEAD' });
    assert.equal(head.status, get.status);
    assert.equal(head.headers.get('content-type'), get.headers.get('content-type'));
    assert.equal(head.headers.get('cache-control'), get.headers.get('cache-control'));
    assert.equal(head.headers.get('content-length'), get.headers.get('content-length'));
    assert.equal(await head.text(), '');
  });

  it('returns JSON failures without terminating the listener', async () => {
    const handle = await startServer({
      getReport: async () => {
        throw new Error('report exploded');
      },
    });
    const failed = await fetch(apiUrl(handle, '/api/report'));
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { error: 'report exploded' });

    const graph = await fetch(apiUrl(handle, '/api/graph'));
    assert.equal(graph.status, 200);
  });

  it('never mutates project or cursor state for methods and inbox reads', async () => {
    const handle = await startServer();
    const beforeProject = await snapshotTree(tmpDir);
    const beforeHome = await snapshotTree(homeDir);

    await fetch(apiUrl(handle, '/api/inbox'));
    await fetch(apiUrl(handle, '/api/report'));
    await fetch(apiUrl(handle, '/api/graph'));
    await fetch(apiUrl(handle, '/api/changes/010'));
    await fetch(apiUrl(handle, '/api/report'), { method: 'POST' });
    await fetch(apiUrl(handle, '/anything'), { method: 'DELETE' });

    assert.deepEqual(await snapshotTree(tmpDir), beforeProject);
    assert.deepEqual(await snapshotTree(homeDir), beforeHome);
  });

  it('recomputes every document from current files on each request', async () => {
    const handle = await startServer();
    const before = (await (await fetch(apiUrl(handle, '/api/graph'))).json()) as {
      capabilities: Array<{ id: string }>;
    };
    assert.ok(!before.capabilities.some((capability) => capability.id === 'gamma'));

    const capabilityDir = path.join(tmpDir, 'openspec', 'specs', 'gamma');
    await fs.mkdir(capabilityDir, { recursive: true });
    await fs.writeFile(path.join(capabilityDir, 'spec.md'), '# gamma Specification\n', 'utf8');

    const after = (await (await fetch(apiUrl(handle, '/api/graph'))).json()) as {
      capabilities: Array<{ id: string }>;
    };
    assert.ok(after.capabilities.some((capability) => capability.id === 'gamma'));
  });

  it('keeps process termination out of core server, static, and config modules', async () => {
    for (const file of [
      'src/core/web/web-server.ts',
      'src/core/web/web-static.ts',
      'src/core/foundation/config-serve.ts',
    ]) {
      const source = await fs.readFile(path.join(REPO_ROOT, file), 'utf8');
      assert.doesNotMatch(source, /process\.exit/, file);
    }
  });

  it('closes idempotently', async () => {
    const handle = await startServer();
    await handle.close();
    await handle.close();
    await assert.rejects(() => fetch(apiUrl(handle, '/api/report')));
  });
});

describe('static dashboard delivery', () => {
  beforeEach(async () => {
    await writeUiFile('index.html', '<!doctype html><div id="root"></div>');
    await writeUiFile('assets/app-abc12345.js', 'console.log(1);');
    await writeUiFile('assets/app.js', 'console.log(2);');
    await writeUiFile('style.css', 'body { color: black; }');
    await writeUiFile('data.json', '{"ok":true}');
    await writeUiFile('icon.svg', '<svg></svg>');
    await writeUiFile('photo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('resolves the package-root ui/dist for tsx and compiled layouts', () => {
    const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
    assert.equal(resolveUiDir(), path.join(repoRoot, 'ui', 'dist'));
  });

  it('serves the index at / and /index.html with a self-only CSP and revalidation', async () => {
    const handle = await startServer();
    for (const target of ['/', '/index.html']) {
      const response = await fetch(apiUrl(handle, target));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
      assert.equal(response.headers.get('cache-control'), 'no-cache');
      assert.equal(response.headers.get('content-security-policy'), UI_CONTENT_SECURITY_POLICY);
      assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'self'/);
      assert.doesNotMatch(response.headers.get('content-security-policy') ?? '', /\*/);
      assert.match(await response.text(), /id="root"/);
    }
  });

  it('serves correct content types and caches only fingerprinted assets immutably', async () => {
    const handle = await startServer();
    const cases: Array<[string, string]> = [
      ['/assets/app-abc12345.js', 'text/javascript; charset=utf-8'],
      ['/assets/app.js', 'text/javascript; charset=utf-8'],
      ['/style.css', 'text/css; charset=utf-8'],
      ['/data.json', 'application/json; charset=utf-8'],
      ['/icon.svg', 'image/svg+xml'],
      ['/photo.png', 'image/png'],
    ];
    for (const [target, contentType] of cases) {
      const response = await fetch(apiUrl(handle, target));
      assert.equal(response.status, 200, target);
      assert.equal(response.headers.get('content-type'), contentType, target);
    }
    const fingerprinted = await fetch(apiUrl(handle, '/assets/app-abc12345.js'));
    assert.equal(fingerprinted.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    const plain = await fetch(apiUrl(handle, '/assets/app.js'));
    assert.equal(plain.headers.get('cache-control'), 'no-cache');
  });

  it('rejects traversal, directory listing, and missing paths without an SPA fallback', async () => {
    const handle = await startServer();
    const cases: Array<[string, string]> = [
      ['GET', '/assets/'],
      ['GET', '/assets/sub/'],
      ['GET', '/%2e%2e/package.json'],
      ['GET', '/%2e%2e%2fpackage.json'],
      ['GET', '/missing.js'],
      ['GET', '/nested/deep/missing'],
    ];
    for (const [method, target] of cases) {
      const response = await rawRequest(handle, method, target);
      assert.equal(response.status, 404, target);
      assert.equal(response.headers['access-control-allow-origin'], undefined);
    }
  });

  it('answers HEAD for the index without a body', async () => {
    const handle = await startServer();
    const head = await fetch(apiUrl(handle, '/'), { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-security-policy'), UI_CONTENT_SECURITY_POLICY);
    assert.equal(await head.text(), '');
  });
});
