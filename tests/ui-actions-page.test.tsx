import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type ReactElement, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActionButtons } from '../packages/ui/src/change/ActionButtons.js';
import { ActionMenu } from '../packages/ui/src/change/ActionMenu.js';
import { ActionResult } from '../packages/ui/src/change/ActionResult.js';
import type { TaskRetry } from '../packages/ui/src/change/ActionRetry.js';
import { ChangeView } from '../packages/ui/src/change/ChangeView.js';
import { TaskTable } from '../packages/ui/src/change/TaskTable.js';
import { changePage } from '../packages/ui/src/change/page-model.js';
import type {
  WebAction,
  WebActionResult,
  WebActionsDocument,
  WebChange,
} from '../packages/ui/src/contracts.js';
import type { WebTask } from '../src/core/web/web-data-types.js';

const APPROVE: WebAction = { verb: 'approve', command: 'osq approve 001', target: null };
const REJECT: WebAction = {
  verb: 'reject',
  command: 'osq reject 001 --reason <text>',
  target: null,
};
const RETRY_TASK: WebAction = { verb: 'retry', command: 'osq retry 001 2', target: '2' };
const PLAN = 'osq plan 001';

const noop = (): void => {};

function actionsDoc(
  actions: readonly WebAction[],
  manual: readonly string[] = [],
): WebActionsDocument {
  return { folderKey: '001-demo', token: 'tok', actions, manual };
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

function webChange(overrides: Partial<WebChange> = {}): WebChange {
  return {
    folderKey: '001-demo',
    id: 1,
    slug: '001-demo',
    title: 'Demo',
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
    nextStep: { state: 'ready-for-approval', command: 'osq approve 001', detail: null },
    ...overrides,
  };
}

function render(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

function renderBar(change: WebChange, document: WebActionsDocument): string {
  return render(
    createElement(
      'div',
      { className: 'page-buttons' },
      createElement(ActionButtons, {
        document,
        main: changePage(change).main,
        pending: false,
        onRun: noop,
      }),
      createElement(ActionMenu, {
        document,
        pending: false,
        reason: '',
        onReasonChange: noop,
        onRun: noop,
      }),
    ),
  );
}

describe('change actions page', () => {
  it('Approval buttons: the bar holds Approve and the menu holds the manual command', () => {
    const change = webChange();
    const html = renderBar(change, actionsDoc([APPROVE], [PLAN]));
    assert.equal((html.match(/class="action-button"/g) ?? []).length, 1);
    assert.match(html, />Approve<\/button>/);
    assert.match(html, /<code>osq plan 001<\/code>/);
    assert.equal(html.includes('>Land<'), false);
    assert.equal(html.includes('>Reject<'), false);
    assert.equal(html.includes('>Retry'), false);
  });

  it('Result after a tap: exit code, message, and next step', () => {
    const result: WebActionResult = {
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: { message: 'Error approving 001:', next: 'osq retry 001 2' },
    };
    const html = render(createElement(ActionResult, { result }));
    assert.match(html, /Exit code 1/);
    assert.match(html, /Error approving 001:/);
    assert.match(html, /Next: osq retry 001 2/);
  });

  it('Static export has no buttons', () => {
    const html = renderChange(webChange());
    assert.equal(html.includes('action-button'), false);
    assert.equal(html.includes('page-menu'), false);
    assert.equal(html.includes('More actions'), false);
  });

  it('Reject in the menu: Reject and its field sit in the menu, Retry task 2 in its row', () => {
    const tasks = [
      webTask({ taskNumber: '1', title: 'First' }),
      webTask({ taskNumber: '2', title: 'Second' }),
    ];
    const document = actionsDoc([APPROVE, REJECT, RETRY_TASK]);
    const retry: TaskRetry = { targets: ['2'], pending: false, onRetry: noop };
    const html = render(
      createElement(
        'div',
        null,
        createElement(ActionButtons, {
          document,
          main: 'approve',
          pending: false,
          onRun: noop,
        }),
        createElement(ActionMenu, {
          document,
          pending: false,
          reason: 'because',
          onReasonChange: noop,
          onRun: noop,
        }),
        createElement(TaskTable, { tasks, retry }),
      ),
    );

    const menuStart = html.indexOf('<details class="page-menu">');
    const menuEnd = html.indexOf('</details>');
    assert.ok(menuStart >= 0 && menuEnd > menuStart, 'the More actions menu should render');
    const menu = html.slice(menuStart, menuEnd);
    assert.match(menu, />Reject<\/button>/);
    assert.match(menu, /class="action-reason-input"/);

    const rowStart = html.indexOf('<tr class="task-row" data-task="2">');
    const rowEnd = html.indexOf('</tr>', rowStart);
    assert.ok(rowStart >= 0 && rowEnd > rowStart, "task 2's row should render");
    assert.match(html.slice(rowStart, rowEnd), /Retry task 2<\/button>/);

    assert.equal((html.match(/class="action-button"/g) ?? []).length, 1);
    assert.match(html, />Approve<\/button>/);
  });
});

function renderChange(change: WebChange): string {
  return render(createElement(ChangeView, { change }));
}
