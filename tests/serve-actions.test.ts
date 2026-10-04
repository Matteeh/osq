import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveCommand } from '../src/cli/approve.js';
import { CommandError } from '../src/cli/command-error.js';
import type { ActionInputs } from '../src/cli/inbox-actions.js';
import { type WebCommand, createWebActionRunner } from '../src/cli/serve-actions.js';
import { serveCommand } from '../src/cli/serve.js';
import { type OsqConfig, loadConfig } from '../src/core/foundation/config.js';
import type {
  WebActionRequest,
  WebActionResult,
  WebActionVerb,
} from '../src/core/web/web-actions.js';
import { createChange, createProject, restoreEnv } from './planning-observed-helpers.js';

const tmpRoots: string[] = [];

beforeEach(() => {
  restoreEnv();
  // Keep the default planning readers away from the real home directory so the
  // server's approval matches the direct call's empty `planningReaders`.
  process.env.CODEX_HOME = '/nonexistent-osq-serve-actions-codex';
  process.env.OSQ_CLAUDE_PROJECTS_DIR = '/nonexistent-osq-serve-actions-claude';
  process.env.CLAUDE_CONFIG_DIR = '/nonexistent-osq-serve-actions-claude-config';
  process.env.OPENCODE_PATH = '/nonexistent-osq-serve-actions-opencode';
});

afterEach(async () => {
  restoreEnv();
  for (const root of tmpRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function project(): Promise<{ root: string; config: OsqConfig }> {
  const root = await createProject();
  tmpRoots.push(root);
  return { root, config: await loadConfig(root) };
}

/** One recorded table call: the request and the inputs the runner handed it. */
interface RecordedCall {
  readonly request: WebActionRequest;
  readonly inputs: ActionInputs;
}

/** A table whose entries record the request and write their verb to the writers. */
function recordingCommands(calls: RecordedCall[]): Readonly<Record<WebActionVerb, WebCommand>> {
  const record = (request: WebActionRequest, inputs: ActionInputs): void => {
    calls.push({ request, inputs });
    inputs.stdout(`${request.verb}-out`);
    inputs.stderr(`${request.verb}-err`);
  };
  return {
    approve: async (request, inputs) => record(request, inputs),
    land: async (request, inputs) => record(request, inputs),
    reject: async (request, inputs) => record(request, inputs),
    retry: async (request, inputs) => record(request, inputs),
  };
}

/** Run `run` with a process-stream tripwire, proving no byte reaches stdout or stderr. */
async function withoutProcessStreams(run: () => Promise<void>): Promise<void> {
  const leaked: string[] = [];
  const originalStdout = process.stdout.write;
  const originalStderr = process.stderr.write;
  const record = (chunk: string | Uint8Array): boolean => {
    leaked.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  };
  process.stdout.write = record as typeof process.stdout.write;
  process.stderr.write = record as typeof process.stderr.write;
  try {
    await run();
  } finally {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
  }
  assert.deepEqual(leaked, [], 'a web action wrote to a process stream');
}

interface Response {
  readonly status: number;
  readonly body: string;
}

/** Send one raw request so the Host header is the loopback bound port. */
function request(
  port: number,
  method: string,
  target: string,
  headers?: Record<string, string>,
  body?: string,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: target, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        text += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function captureLine(): { line: Promise<string>; write: (text: string) => void } {
  let resolveLine: (value: string) => void = () => {};
  const line = new Promise<string>((resolve) => {
    resolveLine = resolve;
  });
  return { line, write: (text) => resolveLine(text) };
}

/** The `type` of every event in a change's `change.jsonl`, empty when absent. */
async function eventTypes(folderPath: string): Promise<string[]> {
  const content = await fs
    .readFile(path.join(folderPath, '.run', 'events', 'change.jsonl'), 'utf8')
    .catch(() => '');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => (JSON.parse(line) as { type: string }).type);
}

async function exists(target: string): Promise<boolean> {
  return fs.stat(target).then(
    () => true,
    () => false,
  );
}

describe('createWebActionRunner', () => {
  it('runs each verb through its command with this request', async () => {
    const { root, config } = await project();
    const calls: RecordedCall[] = [];
    const runner = createWebActionRunner({ cwd: root, config }, recordingCommands(calls));
    const requests: WebActionRequest[] = [
      { verb: 'approve', change: '001' },
      { verb: 'land', change: '001' },
      { verb: 'reject', change: '001', reason: 'r' },
      { verb: 'retry', change: '001', target: '2' },
    ];
    const results: WebActionResult[] = [];

    await withoutProcessStreams(async () => {
      for (const action of requests) results.push(await runner(action));
    });

    assert.deepEqual(
      calls.map((call) => call.request.verb),
      ['approve', 'land', 'reject', 'retry'],
    );
    for (const call of calls) {
      assert.equal(call.request.change, '001');
      assert.equal(call.inputs.cwd, root);
      assert.equal(call.inputs.config, config);
    }
    assert.deepEqual(calls[2]?.request, { verb: 'reject', change: '001', reason: 'r' });
    assert.deepEqual(calls[3]?.request, { verb: 'retry', change: '001', target: '2' });
    assert.deepEqual(
      results.map((result) => result.stdout),
      ['approve-out', 'land-out', 'reject-out', 'retry-out'],
    );
    assert.deepEqual(
      results.map((result) => result.stderr),
      ['approve-err', 'land-err', 'reject-err', 'retry-err'],
    );
    for (const result of results) {
      assert.equal(result.exitCode, 0);
      assert.equal(result.error, null);
    }
  });

  it('turns a CommandError and any other throw into a result with the writers', async () => {
    const { root, config } = await project();
    const commands: Readonly<Record<WebActionVerb, WebCommand>> = {
      approve: async (_request, inputs) => {
        inputs.stdout('partial');
        throw new CommandError('Error approving 001:', { exitCode: 1, next: 'osq lint 001' });
      },
      land: async () => {
        throw new Error('boom');
      },
      reject: async () => {},
      retry: async () => {},
    };
    const runner = createWebActionRunner({ cwd: root, config }, commands);
    const results: WebActionResult[] = [];

    await withoutProcessStreams(async () => {
      results.push(await runner({ verb: 'approve', change: '001' }));
      results.push(await runner({ verb: 'land', change: '001' }));
    });

    assert.deepEqual(results[0], {
      exitCode: 1,
      stdout: 'partial',
      stderr: '',
      error: { message: 'Error approving 001:', next: 'osq lint 001' },
    });
    assert.deepEqual(results[1], {
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: { message: 'Error: boom', next: null },
    });
  });

  it('reports the default commands failure for a change that does not exist', async () => {
    const { root, config } = await project();
    const runner = createWebActionRunner({ cwd: root, config });

    const rejected = await runner({ verb: 'reject', change: '999', reason: 'because' });
    assert.equal(rejected.exitCode, 1);
    assert.match(rejected.error?.message ?? '', /^Error rejecting 999:/);

    const retried = await runner({ verb: 'retry', change: '999', target: '1' });
    assert.equal(retried.exitCode, 1);
    assert.match(retried.error?.message ?? '', /^Error retrying 999 1:/);
  });
});

describe('serveCommand browser actions', () => {
  it('records an approval through the dashboard like approveCommand', async () => {
    const { root: browserRoot, config: browserConfig } = await project();
    const { root: twinRoot, config: twinConfig } = await project();
    const browserChange = await createChange(browserRoot, 'Flagged Change');
    const twinChange = await createChange(twinRoot, 'Flagged Change');

    const controller = new AbortController();
    const urlLine = captureLine();
    const done = serveCommand({
      cwd: browserRoot,
      config: browserConfig,
      port: 0,
      signal: controller.signal,
      stdout: urlLine.write,
    });
    try {
      const url = (await urlLine.line).trim();
      const port = Number(new URL(url).port);
      const tokenResponse = await request(port, 'GET', '/api/actions/001');
      assert.equal(tokenResponse.status, 200, tokenResponse.body);
      const token = (JSON.parse(tokenResponse.body) as { token: string }).token;
      const posted = await request(
        port,
        'POST',
        '/api/actions/001',
        {
          Origin: `http://127.0.0.1:${port}`,
          'Content-Type': 'application/json',
          'X-Osq-Token': token,
        },
        '{"verb":"approve"}',
      );
      assert.equal(posted.status, 200, posted.body);
      const result = JSON.parse(posted.body) as WebActionResult;
      assert.equal(result.exitCode, 0, posted.body);
    } finally {
      controller.abort();
      await done;
    }

    const stdout: string[] = [];
    const stderr: string[] = [];
    await approveCommand([twinChange.specId], {
      cwd: twinRoot,
      config: twinConfig,
      planningReaders: [],
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });

    assert.ok(await exists(path.join(browserChange.folderPath, '.run', 'approved')));
    assert.ok(await exists(path.join(twinChange.folderPath, '.run', 'approved')));
    assert.deepEqual(
      await eventTypes(browserChange.folderPath),
      await eventTypes(twinChange.folderPath),
    );
  });
});
