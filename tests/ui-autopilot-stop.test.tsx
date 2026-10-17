import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NeedsYouGroup } from '../packages/ui/src/home/NeedsYouGroup.js';
import { needsYouKindLabel } from '../packages/ui/src/home/labels.js';
import { needsYouReason, needsYouRoute } from '../packages/ui/src/home/needs-you-model.js';
import { routeToHash } from '../packages/ui/src/router.js';
import type { Inbox } from '../src/core/status/inbox.js';

type NeedsYouItem = Inbox['needsYou'][number];

interface StopRow {
  readonly label: string;
  readonly item: NeedsYouItem;
  readonly links: boolean;
  readonly title: string;
  readonly reason: string;
}

function stopItem(
  change: { id: string; title: string },
  autopilotStopped: NonNullable<NeedsYouItem['autopilotStopped']>,
  command: string,
): NeedsYouItem {
  return { kind: 'autopilot-stopped', change, task: null, command, autopilotStopped };
}

function render(items: readonly NeedsYouItem[]): string {
  return renderToStaticMarkup(createElement(NeedsYouGroup, { items, onNavigate: () => {} }));
}

describe('web-inspection: Autopilot stopped label', () => {
  it('reads the autopilot-stopped kind as autopilot stopped', () => {
    assert.equal(needsYouKindLabel('autopilot-stopped'), 'autopilot stopped');
  });
});

describe('web-inspection: Stop rows on the home view', () => {
  const rows: readonly StopRow[] = [
    {
      label: 'a stop that names its change',
      item: stopItem(
        { id: '003', title: 'Orders' },
        { reason: 'halted', item: 'orders', change: '003', detail: null },
        'osq plan 003',
      ),
      links: true,
      title: '003: Orders',
      reason: '— halted',
    },
    {
      label: 'a stop before its item has a change',
      item: stopItem(
        { id: 'orders', title: 'Orders are totalled' },
        { reason: 'not_approved', item: 'orders', change: null, detail: null },
        'osq queue approve',
      ),
      links: false,
      title: 'orders: Orders are totalled',
      reason: '— not_approved',
    },
  ];

  it('links the title only when the stop names a change and shows the reason', () => {
    for (const row of rows) {
      const html = render([row.item]);
      const titleAt = html.indexOf(row.title);
      const reasonAt = html.indexOf(row.reason);
      assert.ok(titleAt >= 0, `${row.label}: the row shows its title`);
      assert.ok(reasonAt > titleAt, `${row.label}: the reason reads after the title`);
      assert.match(html, /autopilot stopped/, row.label);
      assert.match(html, /<code>osq (?:plan 003|queue approve)<\/code>/, row.label);
      if (row.links) {
        assert.match(html, /href="#\/changes\/003"/, row.label);
        assert.match(html, /<a href="#\/changes\/003">003: Orders<\/a>/, row.label);
      } else {
        assert.doesNotMatch(html, /href=/, row.label);
        assert.match(html, /orders: Orders are totalled/, row.label);
      }
    }
  });
});

describe('web-inspection: the needs-you model decides the route and the reason', () => {
  const approval: NeedsYouItem = {
    kind: 'approval',
    change: { id: '010', title: 'Active Change' },
    task: null,
    command: 'osq approve 010',
  };
  const taskDead: NeedsYouItem = {
    kind: 'task-dead',
    change: { id: '010', title: 'Active Change' },
    task: { number: '2', title: 'Running task' },
    command: 'osq retry 010 2',
  };
  const stopWithChange = stopItem(
    { id: '003', title: 'Orders' },
    { reason: 'halted', item: 'orders', change: '003', detail: 'task 1 dead' },
    'osq plan 003',
  );
  const stopBeforeChange = stopItem(
    { id: 'orders', title: 'Orders are totalled' },
    { reason: 'not_approved', item: 'orders', change: null, detail: null },
    'osq queue approve',
  );

  const rows: readonly {
    readonly item: NeedsYouItem;
    readonly route: string | null;
    readonly reason: string | null;
  }[] = [
    { item: approval, route: '#/changes/010', reason: null },
    { item: taskDead, route: '#/changes/010', reason: null },
    { item: stopWithChange, route: '#/changes/003', reason: ' — halted' },
    { item: stopBeforeChange, route: null, reason: ' — not_approved' },
  ];

  it('returns the route and reason of each case', () => {
    for (const row of rows) {
      const route = needsYouRoute(row.item);
      assert.equal(route === null ? null : routeToHash(route), row.route, row.item.kind);
      assert.equal(needsYouReason(row.item), row.reason, row.item.kind);
    }
  });
});
