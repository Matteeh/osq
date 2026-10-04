import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App, type AppProps } from '../packages/ui/src/app.js';
import {
  type ActionClient,
  type ActionFetch,
  type ActionFetchInit,
  createActionClient,
} from '../packages/ui/src/change/actions-client.js';
import { ChangeActions, ChangeView } from '../packages/ui/src/change/index.js';
import type {
  WebAction,
  WebActionResult,
  WebActionsDocument,
  WebChange,
} from '../packages/ui/src/contracts.js';
import { createWebActionRunner } from '../src/cli/serve-actions.js';
import { loadConfig } from '../src/core/foundation/config.js';
import { startWebServer } from '../src/core/web/web-server.js';
import { createChange, createProject, restoreEnv } from './planning-observed-helpers.js';

const APPROVE: WebAction = { verb: 'approve', command: 'osq approve 001', target: null };
const PLAN = 'osq plan 001';

const tmpRoots: string[] = [];

beforeEach(() => {
  restoreEnv();
  // Keep the default planning readers away from the real home directory, as
  // `tests/command-inputs-approve.test.ts` does.
  process.env.CODEX_HOME = '/nonexistent-osq-ui-actions-codex';
  process.env.OSQ_CLAUDE_PROJECTS_DIR = '/nonexistent-osq-ui-actions-claude';
  process.env.CLAUDE_CONFIG_DIR = '/nonexistent-osq-ui-actions-claude-config';
  process.env.OPENCODE_PATH = '/nonexistent-osq-ui-actions-opencode';
});

afterEach(async () => {
  restoreEnv();
  for (const root of tmpRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function actionsDoc(
  actions: readonly WebAction[],
  manual: readonly string[] = [],
): WebActionsDocument {
  return { folderKey: '001-flagged-change', token: 'tok', actions, manual };
}

function okResult(overrides: Partial<WebActionResult> = {}): WebActionResult {
  return { exitCode: 0, stdout: '', stderr: '', error: null, ...overrides };
}

interface ActionRenderProps {
  readonly document: WebActionsDocument;
  readonly pending?: boolean;
  readonly result?: WebActionResult | null;
  readonly reason?: string;
  readonly onReasonChange?: (reason: string) => void;
  readonly onRun?: (action: WebAction) => void;
}

function renderActions(props: ActionRenderProps): string {
  return renderToStaticMarkup(
    createElement(ChangeActions, {
      pending: false,
      result: null,
      reason: '',
      onReasonChange: () => {},
      onRun: () => {},
      ...props,
    }),
  );
}

function webChange(overrides: Partial<WebChange> = {}): WebChange {
  return {
    id: 1,
    slug: '001-flagged-change',
    folderKey: '001-flagged-change',
    title: 'Flagged Change',
    state: 'active',
    location: 'active',
    planner: null,
    brief: null,
    goal: 'Approve me.',
    rejection: null,
    dependsOn: [],
    reads: [],
    writes: [],
    asOf: '2026-06-01T00:00:42.000Z',
    tasks: [],
    ...overrides,
  };
}

interface RecordedCall {
  readonly url: string;
  readonly init: ActionFetchInit | undefined;
}

function recordingFetch(
  responses: readonly { readonly status: number; readonly body: unknown }[],
): { readonly calls: RecordedCall[]; readonly fetch: ActionFetch } {
  const calls: RecordedCall[] = [];
  const fetch: ActionFetch = async (input, init) => {
    calls.push({ url: input, init });
    const response = responses[calls.length - 1];
    if (response === undefined) throw new Error('recordingFetch has no response left');
    return { status: response.status, json: async () => response.body };
  };
  return { calls, fetch };
}

describe('change actions rendering', () => {
  it('shows one button per action and each manual command as inert text', () => {
    const html = renderActions({ document: actionsDoc([APPROVE], [PLAN]) });
    assert.equal((html.match(/class="action-button"/g) ?? []).length, 1);
    assert.match(html, />Approve<\/button>/);
    assert.match(html, /<code>osq plan 001<\/code>/);
    assert.equal(html.includes('>Land<'), false);
    assert.equal(html.includes('>Reject<'), false);
    assert.equal(html.includes('>Retry'), false);
  });

  it('disables the reject button until the reason is non-empty', () => {
    const reject: WebAction = {
      verb: 'reject',
      command: 'osq reject 001 --reason <text>',
      target: null,
    };
    const empty = renderActions({ document: actionsDoc([reject]), reason: '' });
    assert.match(empty, /<button[^>]*disabled[^>]*>Reject<\/button>/);

    const filled = renderActions({ document: actionsDoc([reject]), reason: 'because' });
    assert.equal(/<button[^>]*disabled[^>]*>Reject<\/button>/.test(filled), false);
    assert.match(filled, /<input[^>]*value="because"/);
  });

  it('labels a retry for its task number or for the whole change', () => {
    const html = renderActions({
      document: actionsDoc([
        { verb: 'retry', command: 'osq retry 001 2', target: '2' },
        { verb: 'retry', command: 'osq retry 001 change', target: 'change' },
      ]),
    });
    assert.match(html, />Retry task 2<\/button>/);
    assert.match(html, />Retry change<\/button>/);
  });

  it('shows the exit code, captured output, error, and next step after a tap', () => {
    const result: WebActionResult = {
      exitCode: 1,
      stdout: 'approved output',
      stderr: 'warning text',
      error: { message: 'Error approving 001:', next: 'osq retry 001 2' },
    };
    const html = renderActions({ document: actionsDoc([APPROVE], [PLAN]), result });
    assert.match(html, /Exit code 1/);
    assert.match(html, /<pre class="action-stdout">approved output<\/pre>/);
    assert.match(html, /<pre class="action-stderr">warning text<\/pre>/);
    assert.match(html, /Error approving 001:/);
    assert.match(html, /Next: osq retry 001 2/);
  });

  it('renders the pending state and disables every button while a tap runs', () => {
    const html = renderActions({ document: actionsDoc([APPROVE], [PLAN]), pending: true });
    assert.match(html, /Running/);
    assert.match(html, /<button[^>]*disabled[^>]*>Approve<\/button>/);
  });
});

describe('createActionClient', () => {
  it('loads the encoded selector and gives null on 404', async () => {
    const { calls, fetch } = recordingFetch([
      { status: 200, body: actionsDoc([APPROVE], [PLAN]) },
      { status: 404, body: { error: 'not found' } },
    ]);
    const client = createActionClient(fetch);

    const loaded = await client.load('a b/c?');
    assert.deepEqual(loaded, actionsDoc([APPROVE], [PLAN]));
    assert.equal(calls[0]?.url, `/api/actions/${encodeURIComponent('a b/c?')}`);
    assert.equal(calls[0]?.init, undefined);
    assert.equal(await client.load('001'), null);
  });

  it('posts the request without change with the method, url, headers, and body', async () => {
    const result = okResult({ stdout: 'ok' });
    const { calls, fetch } = recordingFetch([
      { status: 200, body: result },
      { status: 200, body: result },
      { status: 200, body: result },
    ]);
    const client = createActionClient(fetch);

    assert.deepEqual(await client.run('001', 'tok', { verb: 'approve' }), result);
    await client.run('001', 'tok', { verb: 'reject', reason: 'because' });
    await client.run('001', 'tok', { verb: 'retry', target: '2' });

    assert.equal(calls[0]?.url, '/api/actions/001');
    assert.equal(calls[0]?.init?.method, 'POST');
    assert.equal(calls[0]?.init?.headers?.['Content-Type'], 'application/json');
    assert.equal(calls[0]?.init?.headers?.['X-Osq-Token'], 'tok');
    assert.equal(calls[0]?.init?.body, '{"verb":"approve"}');
    assert.equal(calls[1]?.init?.body, '{"verb":"reject","reason":"because"}');
    assert.equal(calls[2]?.init?.body, '{"verb":"retry","target":"2"}');
  });

  it('turns a 409 into a result that names the running action', async () => {
    const { fetch } = recordingFetch([
      { status: 409, body: { error: 'another action is running' } },
    ]);
    const result = await createActionClient(fetch).run('001', 'tok', { verb: 'land' });
    assert.equal(result.exitCode, 1);
    assert.match(result.error?.message ?? '', /another action is running/);
  });
});

describe('static export', () => {
  it('renders no action buttons when the change view has no client', () => {
    const html = renderToStaticMarkup(createElement(ChangeView, { change: webChange() }));
    assert.equal(html.includes('change-actions'), false);
    assert.equal(html.includes('action-button'), false);
    assert.equal(html.includes('Approve</button>'), false);

    const client: ActionClient = {
      load: async () => actionsDoc([APPROVE], [PLAN]),
      run: async () => okResult(),
    };
    const props: AppProps = {
      route: { name: 'change', folderKey: '001-flagged-change' },
      documents: { report: null, graph: null, inbox: null, change: webChange() },
      loading: false,
      error: null,
      onNavigate: () => {},
      onRefresh: () => {},
      actionClient: client,
    };
    // A served dashboard threads the client through App to the change route;
    // the panel loads on the client, so the static pass shows no buttons.
    assert.equal(renderToStaticMarkup(createElement(App, props)).includes('action-button'), false);
  });
});

describe('change actions against a real server', () => {
  it('loads, approves, and drops the approve action on a fresh load', async () => {
    const root = await createProject();
    tmpRoots.push(root);
    const change = await createChange(root, 'Flagged Change');
    const config = await loadConfig(root);
    const server = await startWebServer({
      projectRoot: root,
      config,
      port: 0,
      runAction: createWebActionRunner({ cwd: root, config }),
    });
    try {
      const origin = `http://127.0.0.1:${server.port}`;
      const client = createActionClient((input, init) => {
        const headers = { ...(init?.headers ?? {}), Origin: origin };
        return globalThis.fetch(`${server.url}${input.replace(/^\//, '')}`, {
          method: init?.method,
          headers,
          body: init?.body,
        });
      });

      const loaded = await client.load(change.specId);
      assert.ok(loaded !== null, 'expected an actions document');
      assert.equal(
        loaded.actions.some((action) => action.verb === 'approve'),
        true,
        JSON.stringify(loaded),
      );

      const result = await client.run(change.specId, loaded.token, { verb: 'approve' });
      assert.equal(result.exitCode, 0, JSON.stringify(result));

      const after = await client.load(change.specId);
      assert.ok(after !== null, 'expected the reloaded actions document');
      assert.equal(
        after.actions.some((action) => action.verb === 'approve'),
        false,
        JSON.stringify(after),
      );
    } finally {
      await server.close();
    }
  });
});
