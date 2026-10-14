import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomeView } from '../packages/ui/src/home/index.js';
import type { Inbox } from '../src/core/status/inbox.js';

function render(inbox: Inbox): string {
  return renderToStaticMarkup(createElement(HomeView, { inbox, onNavigate: () => {} }));
}

describe('Paused task on home', () => {
  it('shows the pause time in place of an elapsed time and links to the change', () => {
    const inbox = {
      needsYou: [],
      landed: [],
      running: [
        {
          change: { id: '007', title: 'Pricing' },
          task: { number: '2', title: 'Prices' },
          pausedUntil: '2099-01-01T09:30:00.000Z',
          command: 'osq show 007',
        },
      ],
    } as unknown as Inbox;

    const html = render(inbox);
    assert.match(html, /Running/);
    assert.match(html, /paused until 2099-01-01 09:30 UTC/);
    assert.match(html, /href="#\/changes\/007"/);
    assert.match(html, /task 2: Prices/);
    assert.doesNotMatch(html, /elapsed/);
  });
});
