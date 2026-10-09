import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createWebActionRunner } from '../src/cli/serve-actions.js';
import { DEFAULT_CONFIG, defineConfig } from '../src/core/foundation/config.js';
import { buildApprovalNotices } from '../src/core/spec/notices.js';
import type {
  WebActionRequest,
  WebActionResult,
  WebActionRunner,
} from '../src/core/web/web-actions.js';
import { getWebChange } from '../src/core/web/web-data.js';
import { type WebServerHandle, startWebServer } from '../src/core/web/web-server.js';
import { createChange, createProject, restoreEnv } from './planning-observed-helpers.js';

/** A living `alpha` capability whose `Alpha one` requirement the change removes. */
const LIVING_ALPHA = `# alpha Specification

## Purpose

Provides the alpha capability for the web notices fixture.

## Requirements

### Requirement: Alpha one
The system SHALL do the alpha thing.

#### Scenario: Alpha works
- **WHEN** alpha runs
- **THEN** it works
`;

const REMOVED_DELTA = `# Spec Delta: alpha

## REMOVED Requirements

### Requirement: Alpha one
`;

const EPHEMERAL = defineConfig({ serve: { port: 0 } });
const OK: WebActionResult = { exitCode: 0, stdout: 'ok\n', stderr: '', error: null };

interface Fixture {
  readonly root: string;
  readonly specId: string;
  readonly folderPath: string;
}

const tmpRoots: string[] = [];
const handles: WebServerHandle[] = [];

beforeEach(() => {
  restoreEnv();
  // Keep the default planning readers away from the real home directory.
  process.env.CODEX_HOME = '/nonexistent-osq-web-notices-codex';
  process.env.OSQ_CLAUDE_PROJECTS_DIR = '/nonexistent-osq-web-notices-claude';
  process.env.CLAUDE_CONFIG_DIR = '/nonexistent-osq-web-notices-claude-config';
  process.env.OPENCODE_PATH = '/nonexistent-osq-web-notices-opencode';
});

afterEach(async () => {
  restoreEnv();
  while (handles.length > 0) {
    const handle = handles.pop();
    if (handle) await handle.close();
  }
  for (const root of tmpRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

/** A change that removes `Alpha one`, so approval carries a red notice. */
async function removedChange(): Promise<Fixture> {
  const root = await createProject();
  tmpRoots.push(root);
  const change = await createChange(root, 'Red Notice');
  const alphaDir = path.join(root, 'openspec', 'specs', 'alpha');
  await fs.mkdir(alphaDir, { recursive: true });
  await fs.writeFile(path.join(alphaDir, 'spec.md'), LIVING_ALPHA, 'utf8');
  const deltaDir = path.join(change.folderPath, 'specs', 'alpha');
  await fs.mkdir(deltaDir, { recursive: true });
  await fs.writeFile(path.join(deltaDir, 'spec.md'), REMOVED_DELTA, 'utf8');
  return { root, specId: change.specId, folderPath: change.folderPath };
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

/** POST headers proving the request came from osq's own page. */
function proof(handle: WebServerHandle, token: string): Record<string, string> {
  return {
    Origin: `http://127.0.0.1:${handle.port}`,
    'Content-Type': 'application/json',
    'X-Osq-Token': token,
  };
}

async function startServer(root: string, runAction: WebActionRunner): Promise<WebServerHandle> {
  const uiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-web-notices-ui-'));
  tmpRoots.push(uiDir);
  const handle = await startWebServer({
    projectRoot: root,
    config: EPHEMERAL,
    uiDir,
    now: () => new Date('2026-06-01T00:00:00.000Z'),
    runAction,
  });
  handles.push(handle);
  return handle;
}

describe('web approve notices document', () => {
  it('carries the notices buildApprovalNotices derives for the change', async () => {
    const fixture = await removedChange();

    const document = await getWebChange(fixture.root, fixture.specId, DEFAULT_CONFIG);
    const review = document.review;
    assert.ok(review, 'an unapproved active change should carry a review');
    assert.ok(review.notices, 'the review should carry its notices');

    const expected = await buildApprovalNotices(
      fixture.root,
      fixture.folderPath,
      DEFAULT_CONFIG,
      review.digest,
    );
    assert.deepEqual(review.notices, expected);
    assert.ok(
      review.notices.notices.some(
        (notice) => notice.id === 'removed_requirement' && notice.severity === 'red',
      ),
      'the removed requirement should raise a red notice',
    );
  });
});

describe('POST /api/actions approve opened notices', () => {
  it('carries opened to the runner and refuses a non-list', async () => {
    const fixture = await removedChange();
    const calls: WebActionRequest[] = [];
    const runner: WebActionRunner = async (action) => {
      calls.push(action);
      return OK;
    };
    const handle = await startServer(fixture.root, runner);

    const tokenResponse = await request(handle.port, 'GET', '/api/actions/001');
    assert.equal(tokenResponse.status, 200, tokenResponse.body);
    const token = (JSON.parse(tokenResponse.body) as { token: string }).token;

    const accepted = await request(
      handle.port,
      'POST',
      '/api/actions/001',
      proof(handle, token),
      JSON.stringify({ verb: 'approve', opened: ['rules_path'] }),
    );
    assert.equal(accepted.status, 200, accepted.body);
    assert.deepEqual(calls, [{ verb: 'approve', change: '001', opened: ['rules_path'] }]);

    const refused = await request(
      handle.port,
      'POST',
      '/api/actions/001',
      proof(handle, token),
      JSON.stringify({ verb: 'approve', opened: 'rules_path' }),
    );
    assert.equal(refused.status, 400, refused.body);
    assert.equal(calls.length, 1);
  });

  it('keeps opened off the request when the body carries none', async () => {
    const fixture = await removedChange();
    const calls: WebActionRequest[] = [];
    const runner: WebActionRunner = async (action) => {
      calls.push(action);
      return OK;
    };
    const handle = await startServer(fixture.root, runner);

    const tokenResponse = await request(handle.port, 'GET', '/api/actions/001');
    const token = (JSON.parse(tokenResponse.body) as { token: string }).token;

    const response = await request(
      handle.port,
      'POST',
      '/api/actions/001',
      proof(handle, token),
      JSON.stringify({ verb: 'approve' }),
    );
    assert.equal(response.status, 200, response.body);
    assert.deepEqual(calls, [{ verb: 'approve', change: '001' }]);
  });
});

describe('createWebActionRunner approve wiring', () => {
  it('passes opened through to approveCommand and approves only when the red notice is open', async () => {
    const fixture = await removedChange();
    const runner = createWebActionRunner({ cwd: fixture.root, config: DEFAULT_CONFIG });

    const refused = await runner({ verb: 'approve', change: fixture.specId, opened: [] });
    assert.equal(refused.exitCode, 1, JSON.stringify(refused));
    assert.match(
      refused.error?.message ?? '',
      /open each red notice before approving: removes requirements/,
    );
    await assert.rejects(fs.stat(path.join(fixture.folderPath, '.run', 'approved')));

    const approved = await runner({
      verb: 'approve',
      change: fixture.specId,
      opened: ['removed_requirement'],
    });
    assert.equal(approved.exitCode, 0, JSON.stringify(approved));
    assert.ok(await fs.stat(path.join(fixture.folderPath, '.run', 'approved')));
  });
});
