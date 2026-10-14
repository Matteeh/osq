import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChangeView } from '../packages/ui/src/change/ChangeView.js';
import { copyText } from '../packages/ui/src/change/HandoffBlock.js';
import type {
  ApprovalNotice,
  ApprovalNotices,
  LandGate,
  LandView,
  WebChange,
  WebReview,
} from '../packages/ui/src/contracts.js';
import type { WebTask } from '../src/core/web/web-data-types.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const ASOF = '2026-06-01T00:00:42.000Z';

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

function notice(overrides: Partial<ApprovalNotice> = {}): ApprovalNotice {
  return {
    id: 'new_capability',
    severity: 'grey',
    label: 'new capability',
    detail: 'beta',
    ...overrides,
  };
}

function notices(overrides: Partial<ApprovalNotices> = {}): ApprovalNotices {
  return { notices: [notice()], maxShown: 5, unusual: false, ...overrides };
}

function review(overrides: Partial<WebReview> = {}): WebReview {
  return {
    goal: 'The review goal.',
    nonGoals: 'The non-goals.',
    surface: 'The surface.',
    decisions: 'The decisions.',
    humanSteps: 'The human steps.',
    contract: '### Requirement: Contract',
    deltas: [],
    digest: {
      change: '010-running',
      goal: 'The review goal.',
      tasks: [],
      capabilities: [],
      decisions: [],
      humanSteps: '',
      beforeApproval: '',
      flags: [],
    },
    digestText: 'Approval digest body.',
    ...overrides,
  };
}

function gate(overrides: Partial<LandGate> = {}): LandGate {
  return {
    kind: 'task',
    task: '1',
    command: 'node verify.cjs',
    outcome: 'passed',
    exitCode: 0,
    durationSeconds: 3,
    timestamp: '2026-02-01T00:00:00.000Z',
    findings: null,
    ...overrides,
  };
}

function landView(overrides: Partial<LandView> = {}): LandView {
  return {
    folderName: '007-archived',
    landed: false,
    defaultBranch: 'main',
    mainCommits: 0,
    gates: [],
    diff: null,
    capabilities: [],
    disclosures: [],
    halt: null,
    lastSync: null,
    lastSyncStop: null,
    ...overrides,
  };
}

function webChange(
  overrides: Partial<WebChange> & Pick<WebChange, 'folderKey' | 'title'>,
): WebChange {
  return {
    id: null,
    slug: overrides.folderKey,
    state: 'active',
    location: 'active',
    planner: null,
    brief: null,
    goal: '',
    rejection: null,
    dependsOn: [],
    reads: [],
    writes: [],
    asOf: ASOF,
    tasks: [],
    ...overrides,
  };
}

function render(change: WebChange): string {
  return renderToStaticMarkup(createElement(ChangeView, { change }));
}

/** Everything before the first fold: the head plus the one top block. */
function topBlock(html: string): string {
  const end = html.indexOf('<details class="page-fold">');
  return end === -1 ? html : html.slice(0, end);
}

describe('change page order', () => {
  it('renders the label, title, summary, top block, folds, and button bar in order', () => {
    const change = webChange({
      folderKey: '010-running',
      title: 'Running Change',
      brief: 'Brief body.',
      nextStep: { state: 'running', command: 'osq show 010', detail: null },
      review: review(),
      tasks: [
        webTask({
          taskNumber: '1',
          title: 'First',
          state: 'running',
          runningStart: ASOF,
          runningElapsedSeconds: 42,
        }),
        webTask({ taskNumber: '2', title: 'Second' }),
      ],
    });
    const html = render(change);
    const order = [
      '<p class="page-label">Running</p>',
      '<h2 id="change-view-title">Running Change</h2>',
      '<p class="page-summary">0 of 2 tasks done</p>',
      '<section class="page-block">',
      '<details class="page-fold"><summary>Brief</summary>',
      '<details class="page-fold"><summary>Plan</summary>',
      '<details class="page-fold"><summary>Tasks · 0 of 2 done</summary>',
      '<details class="page-fold"><summary>Approval digest</summary>',
      '<details class="page-fold"><summary>About this change</summary>',
      '<div class="page-buttons">',
    ];
    let previous = -1;
    for (const marker of order) {
      const index = html.indexOf(marker);
      assert.ok(index > previous, `${marker} should follow the previous marker`);
      previous = index;
    }
    assert.equal(/<details[^>]*class="page-fold"[^>]*\sopen/.test(html), false);
  });
});

describe('top block per state', () => {
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly change: WebChange;
    readonly holds: readonly string[];
  }> = [
    {
      name: 'unplanned',
      change: webChange({
        folderKey: '001-unplanned',
        title: 'Unplanned',
        nextStep: { state: 'unplanned', command: 'osq plan 001', detail: null },
        planHandoff: { text: 'You are the planner.', promptReady: true },
      }),
      holds: ['Hand it to your planning agent', '>Copy hand-off</button>'],
    },
    {
      name: 'ready-for-approval',
      change: webChange({
        folderKey: '002-ready',
        title: 'Ready',
        nextStep: { state: 'ready-for-approval', command: 'osq approve 002', detail: null },
        review: review({ notices: notices() }),
      }),
      holds: ['<h3 id="notices-title">Notices</h3>'],
    },
    {
      name: 'running',
      change: webChange({
        folderKey: '003-running',
        title: 'Running',
        nextStep: { state: 'running', command: null, detail: null },
        tasks: [
          webTask({ taskNumber: '1', title: 'One' }),
          webTask({
            taskNumber: '2',
            title: 'Two',
            state: 'running',
            runningStart: ASOF,
            runningElapsedSeconds: 42,
          }),
          webTask({ taskNumber: '3', title: 'Three' }),
        ],
      }),
      holds: [
        'Task 2 of 3 running · 42s',
        'Nothing for you to do. The inbox shows it when it needs you.',
      ],
    },
    {
      name: 'blocked',
      change: webChange({
        folderKey: '004-blocked',
        title: 'Blocked',
        nextStep: { state: 'blocked', command: 'osq show 001', detail: 'waiting for 001-a' },
        tasks: [webTask({ taskNumber: '1', title: 'One' })],
      }),
      holds: ['<p class="page-detail">Waiting for 001-a</p>'],
    },
    {
      name: 'dead',
      change: webChange({
        folderKey: '005-dead',
        title: 'Dead',
        nextStep: { state: 'dead', command: 'osq retry 005 4', detail: null },
        tasks: [
          webTask({
            taskNumber: '4',
            title: 'Inbox rows',
            state: 'dead',
            reason: 'verify_red',
          }),
        ],
      }),
      holds: ['Task 4 stopped: Inbox rows', 'Reason: verify_red'],
    },
    {
      name: 'revised',
      change: webChange({
        folderKey: '006-revised',
        title: 'Revised',
        nextStep: { state: 'dead', command: 'osq approve 006', detail: 'revised plan ready' },
        autoSteer: { outcome: 'ready', changed: ['tasks/2.md'] },
        tasks: [webTask({ taskNumber: '2', title: 'Two', state: 'dead', reason: 'blocked' })],
      }),
      holds: ['<p class="page-revised">Revised plan ready</p>', '<code>tasks/2.md</code>'],
    },
    {
      name: 'archived',
      change: webChange({
        folderKey: '007-archived',
        title: 'Archived',
        state: 'archived',
        location: 'archived',
        nextStep: { state: 'archived', command: 'osq land 007', detail: 'not landed' },
        land: landView({
          gates: [gate(), gate({ task: '2' }), gate({ task: '3' }), gate({ task: '4' })],
        }),
      }),
      holds: ['<p class="page-land">All 4 gates passed</p>'],
    },
    {
      name: 'landed',
      change: webChange({
        folderKey: '008-landed',
        title: 'Landed',
        state: 'archived',
        location: 'archived',
        nextStep: { state: 'landed', command: null, detail: null },
        tasks: [
          webTask({ taskNumber: '1', title: 'One', state: 'done', attempts: 1 }),
          webTask({ taskNumber: '2', title: 'Two', state: 'done', attempts: 1 }),
        ],
      }),
      holds: ['<p class="page-landed">Landed</p>', '2 tasks, 2 first try'],
    },
    {
      name: 'rejected',
      change: webChange({
        folderKey: '009-rejected',
        title: 'Rejected',
        state: 'rejected',
        location: 'rejected',
        rejection: { reason: 'superseded', timestamp: '2026-03-01T00:00:00.000Z' },
      }),
      holds: ['<p class="page-rejected">Rejected: superseded</p>'],
    },
  ];

  for (const row of cases) {
    it(`shows the ${row.name} top block`, () => {
      const html = topBlock(render(row.change));
      for (const text of row.holds) {
        assert.ok(html.includes(text), `${row.name} top block should hold ${text}`);
      }
    });
  }
});

describe('plan buttons without an action client', () => {
  it('shows a Plan it page-button and no action button', () => {
    const change = webChange({
      folderKey: '001-dead',
      title: 'Dead',
      nextStep: { state: 'dead', command: 'osq plan 001', detail: null },
      planHandoff: { text: 'You are the planner.', promptReady: true },
    });
    const html = render(change);
    assert.match(html, /<button type="button" class="page-button">Plan it<\/button>/);
    assert.equal(html.includes('action-button'), false);
  });
});

describe('change page at phone width', () => {
  it('styles the page for a 390px phone without sideways scroll', async () => {
    const css = await fs.readFile(
      path.join(ROOT, 'packages', 'ui', 'src', 'change', 'page.css'),
      'utf8',
    );
    const minHeight = [
      '\\.page-button',
      '\\.action-button',
      '\\.page-fold\\s*>\\s*summary',
      '\\.page-menu\\s*>\\s*summary',
    ];
    for (const selector of minHeight) {
      assert.match(css, new RegExp(`${selector}\\s*\\{[^}]*min-height:\\s*44px`), selector);
    }
    assert.match(css, /overflow-wrap:\s*anywhere/);
    assert.match(css, /\.table-scroll\s*\{[^}]*overflow-x:\s*auto/);
    assert.match(css, /position:\s*sticky/);
  });
});

describe('hand-off block', () => {
  const change = (promptReady: boolean): WebChange =>
    webChange({
      folderKey: '001-demo',
      title: 'Demo',
      nextStep: { state: 'unplanned', command: 'osq plan 001', detail: null },
      planHandoff: {
        text: 'You are the planner for osq change 001-demo.\n',
        promptReady,
      },
    });

  it('shows the paste text, the no-prompt line, and the Copy hand-off button', () => {
    const html = render(change(false));
    assert.ok(
      html.includes(
        '<pre class="handoff-text">You are the planner for osq change 001-demo.\n</pre>',
      ),
    );
    assert.ok(
      html.includes('This folder has no plan-prompt.md yet; run osq plan for this change first.'),
    );
    assert.match(html, />Copy hand-off<\/button>/);
  });

  it('has no no-prompt line when the prompt is ready', () => {
    const html = render(change(true));
    assert.equal(html.includes('This folder has no plan-prompt.md yet'), false);
  });
});

describe('copy outcome', () => {
  it('resolves true and passes the text when writeText succeeds', async () => {
    const received: string[] = [];
    const result = await copyText('block', {
      writeText: async (text) => {
        received.push(text);
      },
    });
    assert.equal(result, true);
    assert.deepEqual(received, ['block']);
  });

  it('resolves false when writeText rejects', async () => {
    const result = await copyText('block', {
      writeText: async () => {
        throw new Error('denied');
      },
    });
    assert.equal(result, false);
  });

  it('resolves false when the clipboard is undefined', async () => {
    assert.equal(await copyText('block', undefined), false);
  });
});
