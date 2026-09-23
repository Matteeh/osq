import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App, type AppProps } from '../packages/ui/src/app.js';
import { HomeView, needsYouKindLabel } from '../packages/ui/src/home/index.js';
import type { Inbox } from '../src/core/status/inbox.js';

const CHANGE = { id: '010', title: 'Active Change' };

function emptyInbox(): Inbox {
  return { needsYou: [], running: [], landed: [] };
}

function render(inbox: Inbox): string {
  return renderToStaticMarkup(createElement(HomeView, { inbox, onNavigate: () => {} }));
}

function renderApp(inbox: Inbox): string {
  const props: AppProps = {
    route: { name: 'home' },
    documents: { report: null, graph: null, inbox, change: null },
    loading: false,
    error: null,
    onNavigate: () => {},
    onRefresh: () => {},
  };
  return renderToStaticMarkup(createElement(App, props));
}

function count(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

describe('home view', () => {
  it('shows every needs-you kind in words with its exact command and change link', () => {
    const inbox: Inbox = {
      ...emptyInbox(),
      needsYou: [
        { kind: 'approval', change: CHANGE, task: null, command: 'osq approve 010' },
        {
          kind: 'task-dead',
          change: CHANGE,
          task: { number: '2', title: 'Running task' },
          command: 'osq retry 010 2',
        },
        {
          kind: 'task-regressed',
          change: CHANGE,
          task: { number: '3', title: 'Regressed task' },
          command: 'osq retry 010 3',
        },
        {
          kind: 'change-regressed',
          change: CHANGE,
          task: null,
          command: 'osq reject 010 --reason <text>',
        },
      ],
    };

    const html = render(inbox);
    assert.match(html, /awaiting approval/);
    assert.match(html, /task <span class="status-badge status-dead">.*?dead<\/span>/);
    assert.match(html, /task <span class="status-badge status-regressed">.*?regressed<\/span>/);
    assert.match(html, /change regressed/);
    assert.match(html, /<code>osq approve 010<\/code>/);
    assert.match(html, /<code>osq retry 010 2<\/code>/);
    assert.match(html, /<code>osq retry 010 3<\/code>/);
    assert.match(html, /<code>osq reject 010 --reason &lt;text&gt;<\/code>/);
    assert.match(html, /href="#\/changes\/010"/);
    assert.match(html, /010: Active Change/);
    assert.match(html, /task 2: Running task/);
    assert.match(html, /task 3: Regressed task/);
    assert.equal(count(html, /href="#\/changes\/010"/g), 4);
  });

  it('shows running task identity and server-derived elapsed time', () => {
    const inbox: Inbox = {
      ...emptyInbox(),
      running: [
        {
          change: CHANGE,
          task: { number: '2', title: 'Running task' },
          pid: 1234,
          startedAt: '2026-06-01T00:00:00.000Z',
          elapsedSeconds: 42,
          command: 'osq show 010',
        },
      ],
    };

    const html = render(inbox);
    assert.match(html, /Running/);
    assert.match(html, /status-badge status-running/);
    assert.match(html, /task 2: Running task/);
    assert.match(html, /42s elapsed/);
    assert.match(html, /href="#\/changes\/010"/);
  });

  it('labels landed items as since the last look and shows the archive time', () => {
    const inbox: Inbox = {
      ...emptyInbox(),
      landed: [
        {
          change: { id: '002', title: 'Archived Change' },
          archivedAt: '2026-02-01T00:00:00.000Z',
          command: 'osq show 002',
        },
      ],
    };

    const html = render(inbox);
    assert.match(html, /Landed since last look/);
    assert.match(html, /archived 2026-02-01T00:00:00.000Z/);
    assert.match(html, /href="#\/changes\/002"/);
  });

  it('shows one empty-state line per group and no error for a quiet repository', () => {
    const html = renderApp(emptyInbox());
    assert.match(html, /Needs you/);
    assert.match(html, /Nothing needs your attention\./);
    assert.match(html, /Running/);
    assert.match(html, /Nothing is running\./);
    assert.match(html, /Landed since last look/);
    assert.match(html, /Nothing landed since your last look\./);
    assert.doesNotMatch(html, /role="alert"/);
    assert.doesNotMatch(html, /state-error/);
  });

  it('maps every needs-you kind to its words', () => {
    assert.equal(needsYouKindLabel('approval'), 'awaiting approval');
    assert.equal(needsYouKindLabel('task-dead'), 'task dead');
    assert.equal(needsYouKindLabel('task-regressed'), 'task regressed');
    assert.equal(needsYouKindLabel('change-regressed'), 'change regressed');
  });
});
