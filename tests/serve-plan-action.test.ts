import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { PlanCommandOptions } from '../src/cli/plan.js';
import { createWebActionRunner, defaultWebCommands } from '../src/cli/serve-actions.js';
import { createServerCommands } from '../src/cli/server-worker.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import type {
  WebActionRequest,
  WebActionResult,
  WebActionRunner,
} from '../src/core/web/web-actions.js';
import { type WebServerHandle, startWebServer } from '../src/core/web/web-server.js';
import { createChange, createProject } from './planning-observed-helpers.js';

/** A config with version control on, so `canStartPlanner` accepts a change. */
const VCS_CONFIG = defineConfig({
  serve: { port: 0 },
  vcs: { enabled: true, author: 'osq <osq@noreply.invalid>' },
});

const OK: WebActionResult = { exitCode: 0, stdout: 'ok\n', stderr: '', error: null };

let root: string;
let uiDir: string;
let homeDir: string;
const handles: WebServerHandle[] = [];

interface Response {
  readonly status: number;
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
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

async function startServer(
  config: OsqConfig,
  runAction: WebActionRunner,
): Promise<WebServerHandle> {
  const handle = await startWebServer({
    projectRoot: root,
    config,
    uiDir,
    home: homeDir,
    now: () => new Date('2026-06-01T00:00:00.000Z'),
    runAction,
  });
  handles.push(handle);
  return handle;
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
  return (JSON.parse(response.body) as { token: string }).token;
}

/** A recording `planCommand` stand-in for both command tables. */
function recordingPlan(calls: Array<{ id: string | undefined; options: PlanCommandOptions }>) {
  return async (id: string | undefined, options: PlanCommandOptions = {}): Promise<void> => {
    calls.push({ id, options });
  };
}

beforeEach(async () => {
  root = await createProject();
  uiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-serve-plan-action-ui-'));
  homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-serve-plan-action-home-'));
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

describe('Plan action offered', () => {
  it('ends the actions with one plan action for an unplanned change', async () => {
    const change = await createChange(root, 'Unplanned Action');
    await makeUnplanned(change.folderPath);
    const handle = await startServer(VCS_CONFIG, recordingRunner().runner);

    const response = await request(handle, 'GET', '/api/actions/001');
    assert.equal(response.status, 200, response.body);
    const body = JSON.parse(response.body) as { actions: unknown; manual: unknown };
    assert.deepEqual(body.actions, [{ verb: 'plan', command: 'osq plan 001 --run', target: null }]);
    assert.deepEqual(body.manual, ['osq plan 001']);
  });
});

describe('Plan action bodies', () => {
  it('accepts a plan body with optional notes and refuses anything else', async () => {
    const change = await createChange(root, 'Unplanned Action');
    await makeUnplanned(change.folderPath);
    const { runner, calls } = recordingRunner();
    const handle = await startServer(VCS_CONFIG, runner);
    const token = await tokenOf(handle);
    const headers = proof(handle, token);

    const noNotes = await request(handle, 'POST', '/api/actions/001', {
      headers,
      body: JSON.stringify({ verb: 'plan' }),
    });
    assert.equal(noNotes.status, 200, noNotes.body);

    const withNotes = await request(handle, 'POST', '/api/actions/001', {
      headers,
      body: JSON.stringify({ verb: 'plan', notes: 'use the cache' }),
    });
    assert.equal(withNotes.status, 200, withNotes.body);

    for (const body of ['{"verb":"plan","notes":""}', '{"verb":"plan","notes":3}']) {
      const refused = await request(handle, 'POST', '/api/actions/001', { headers, body });
      assert.equal(refused.status, 400, body);
    }

    const unknown = await request(handle, 'POST', '/api/actions/001', {
      headers,
      body: JSON.stringify({ verb: 'merge' }),
    });
    assert.equal(unknown.status, 400);
    assert.deepEqual(JSON.parse(unknown.body), {
      error: 'verb must be approve, land, reject, retry, or plan',
    });

    assert.deepEqual(calls, [
      { verb: 'plan', change: '001' },
      { verb: 'plan', change: '001', notes: 'use the cache' },
    ]);
  });
});

describe('Server runs the plan command', () => {
  it("runs osq serve's default table through the injected plan command", async () => {
    const calls: Array<{ id: string | undefined; options: PlanCommandOptions }> = [];
    const run = createWebActionRunner(
      { cwd: root, config: VCS_CONFIG },
      defaultWebCommands(recordingPlan(calls)),
    );

    const result = await run({ verb: 'plan', change: '001', notes: 'use the cache' });

    assert.equal(result.exitCode, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.id, '001');
    assert.equal(calls[0]?.options.run, true);
    assert.equal(calls[0]?.options.notes, 'use the cache');
    assert.equal(calls[0]?.options.cwd, root);
    assert.equal(calls[0]?.options.config, VCS_CONFIG);
  });

  it('runs the server worker table through the injected plan command', async () => {
    const calls: Array<{ id: string | undefined; options: PlanCommandOptions }> = [];
    const run = createWebActionRunner(
      { cwd: root, config: VCS_CONFIG },
      createServerCommands(undefined, recordingPlan(calls)),
    );

    const result = await run({ verb: 'plan', change: '001', notes: 'use the cache' });

    assert.equal(result.exitCode, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.id, '001');
    assert.equal(calls[0]?.options.run, true);
    assert.equal(calls[0]?.options.notes, 'use the cache');
    assert.equal(calls[0]?.options.cwd, root);
    assert.equal(calls[0]?.options.config, VCS_CONFIG);
  });

  it('omits notes when the request carries none', async () => {
    const calls: Array<{ id: string | undefined; options: PlanCommandOptions }> = [];
    const run = createWebActionRunner(
      { cwd: root, config: VCS_CONFIG },
      defaultWebCommands(recordingPlan(calls)),
    );

    await run({ verb: 'plan', change: '001' });

    assert.equal(calls.length, 1);
    assert.equal(Object.hasOwn(calls[0]?.options ?? {}, 'notes'), false);
  });
});
