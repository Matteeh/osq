import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type ReactElement, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActionResult } from '../packages/ui/src/change/ActionResult.js';
import {
  ChangeView,
  PLANNING_REFRESH_MS,
  planStart,
} from '../packages/ui/src/change/ChangeView.js';
import { HandoffBlock } from '../packages/ui/src/change/HandoffBlock.js';
import { PageBlock } from '../packages/ui/src/change/PageBlock.js';
import {
  type ActionFetch,
  type ActionFetchInit,
  createActionClient,
} from '../packages/ui/src/change/actions-client.js';
import { changePage } from '../packages/ui/src/change/page-model.js';
import type {
  WebAction,
  WebActionResult,
  WebActionsDocument,
  WebChange,
} from '../packages/ui/src/contracts.js';
import type { WebTask } from '../src/core/web/web-data-types.js';

const PLAN: WebAction = { verb: 'plan', command: 'osq plan 001 --run', target: null };
const HANDOFF = { text: 'You are the planner for osq change 001-demo.\n', promptReady: true };
const NOOP = (): void => {};

function actionsDoc(actions: readonly WebAction[]): WebActionsDocument {
  return { folderKey: '001-demo', token: 'tok', actions, manual: [] };
}

function okResult(overrides: Partial<WebActionResult> = {}): WebActionResult {
  return { exitCode: 0, stdout: '', stderr: '', error: null, ...overrides };
}

function webTask(overrides: Partial<WebTask> & Pick<WebTask, 'taskNumber' | 'title'>): WebTask {
  return {
    declaredScope: [],
    resolvedScope: [],
    acceptance: [],
    verify: 'node verify.cjs',
    state: 'pending',
    attempts: 0,
    reason: null,
    runningStart: null,
    runningElapsedSeconds: null,
    duration: null,
    cost: null,
    costCoverage: { reported: 0, total: 0 },
    recertifications: [],
    result: null,
    ...overrides,
  };
}

function webChange(overrides: Partial<WebChange> & Pick<WebChange, 'title'>): WebChange {
  return {
    folderKey: '001-demo',
    id: 1,
    slug: '001-demo',
    state: 'active',
    location: 'active',
    planner: null,
    brief: null,
    goal: 'The goal.',
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

function render(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const unplanned = (planRun: WebChange['planRun'] = null): WebChange =>
  webChange({
    title: 'Unplanned',
    nextStep: { state: 'unplanned', command: 'osq plan 001', detail: null },
    planHandoff: HANDOFF,
    planRun,
  });

describe('Start planning button', () => {
  it('leads the hand-off block and posts the plan action once', async () => {
    const calls: WebAction[] = [];
    const start = planStart(actionsDoc([PLAN]), false, (action) => calls.push(action));
    assert.ok(start !== null, 'a plan action should yield a start');
    const html = render(createElement(HandoffBlock, { handoff: HANDOFF, start }));
    assert.ok(
      html.startsWith(
        '<section class="handoff"><button type="button" class="page-button handoff-start">Start planning</button>',
      ),
      `the hand-off block should start with Start planning: ${html}`,
    );
    assert.equal(/<button[^>]*disabled[^>]*>Start planning/.test(html), false);
    assert.ok(
      html.includes(
        'Runs the planner on the server, in its own tree, and brings the plan back here.',
      ),
    );
    start.onStart();
    assert.deepEqual(calls, [PLAN]);

    const result = okResult({ stdout: 'Planner started for 001-demo (pid 4242).' });
    const { calls: posts, fetch } = recordingFetch([{ status: 200, body: result }]);
    const client = createActionClient(fetch);
    const started = planStart(actionsDoc([PLAN]), false, () => {
      void client.run('001', 'tok', { verb: 'plan' });
    });
    started?.onStart();
    await flush();
    assert.equal(posts.length, 1);
    assert.equal(posts[0]?.init?.body, '{"verb":"plan"}');
    assert.match(render(createElement(ActionResult, { result })), /Planner started for 001-demo/);
  });

  it('disables the button while an action is pending', () => {
    const start = planStart(actionsDoc([PLAN]), true, NOOP);
    assert.ok(start !== null);
    const html = render(createElement(HandoffBlock, { handoff: HANDOFF, start }));
    assert.match(html, /<button[^>]*disabled[^>]*>Start planning<\/button>/);
  });
});

describe('Start planning after Plan it', () => {
  it('shows Plan it on a halted change and the opened block starts with Start planning', () => {
    const halted = webChange({
      title: 'Halted',
      nextStep: { state: 'dead', command: 'osq plan 001', detail: 'needs steering' },
      planHandoff: HANDOFF,
      tasks: [webTask({ taskNumber: '1', title: 'One', state: 'dead', reason: 'blocked' })],
    });
    assert.match(render(createElement(ChangeView, { change: halted })), />Plan it<\/button>/);

    const start = planStart(actionsDoc([PLAN]), false, NOOP);
    assert.ok(start !== null, 'the loaded actions hold a plan action');
    const opened = render(createElement(HandoffBlock, { handoff: HANDOFF, start }));
    assert.match(
      opened,
      /^<section class="handoff"><button[^>]*class="page-button handoff-start"[^>]*>Start planning<\/button>/,
    );
  });
});

describe('No start without the action', () => {
  it('offers no Start planning without a plan action and keeps Copy hand-off', () => {
    assert.equal(planStart(null, false, NOOP), null);
    assert.equal(planStart(actionsDoc([]), false, NOOP), null);

    const block = render(createElement(HandoffBlock, { handoff: HANDOFF }));
    assert.equal(block.includes('Start planning'), false);
    assert.match(block, />Copy hand-off<\/button>/);

    const change = unplanned();
    const view = render(createElement(ChangeView, { change }));
    assert.equal(view.includes('Start planning'), false);
    assert.match(view, />Copy hand-off<\/button>/);

    const pageBlock = render(
      createElement(PageBlock, {
        change,
        page: changePage(change),
        notices: null,
        onOpenNotice: NOOP,
        start: null,
      }),
    );
    assert.equal(pageBlock.includes('Start planning'), false);
    assert.match(pageBlock, />Copy hand-off<\/button>/);
  });
});

describe('Last run outcome', () => {
  it('shows the outcome line before the paste text', () => {
    const change = unplanned({
      outcome: 'lint_red',
      startedAt: null,
      detail: '- tasks/1.md: bad',
    });
    const html = render(createElement(ChangeView, { change }));
    const outcome =
      '<p class="handoff-outcome">The last planner run left the plan failing osq lint.</p>';
    const index = html.indexOf(outcome);
    assert.ok(index >= 0, `the outcome line should render: ${html}`);
    assert.ok(
      index < html.indexOf('<pre class="handoff-text">'),
      'the outcome line should precede the paste text',
    );
  });

  it('leaves the hand-off block unchanged without a plan run', () => {
    const html = render(createElement(ChangeView, { change: unplanned() }));
    assert.equal(html.includes('handoff-outcome'), false);
  });
});

describe('Planning top block', () => {
  it('refreshes the planning line every 30 seconds', () => {
    assert.equal(PLANNING_REFRESH_MS, 30_000);
  });

  it('shows the planning line and note and no plan controls', () => {
    const change = webChange({
      title: 'Planning',
      nextStep: {
        state: 'planning',
        command: 'osq show 001',
        detail: 'since 2026-06-01 00:00 UTC',
      },
      planHandoff: HANDOFF,
      planRun: {
        outcome: 'running',
        startedAt: new Date(Date.now() - 750_000).toISOString(),
        detail: null,
      },
    });
    const html = render(createElement(ChangeView, { change }));
    assert.match(html, /<p class="page-planning">Planning on server · 12 min<\/p>/);
    assert.ok(html.includes('The plan comes back here when it lints clean.'));
    assert.equal(html.includes('Copy hand-off'), false);
    assert.equal(html.includes('Start planning'), false);
    assert.equal(html.includes('>Plan it<'), false);
    assert.equal(html.includes('>Plan again<'), false);
    assert.equal(html.includes('>Plan it myself<'), false);
  });
});
