import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChangeView } from '../packages/ui/src/change/ChangeView.js';
import type { WebChange } from '../src/core/web/web-data-types.js';

const ASOF = '2026-06-01T00:00:42.000Z';

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

function renderChange(change: WebChange): string {
  return renderToStaticMarkup(createElement(ChangeView, { change }));
}

describe('Change view names a re-approved overlap', () => {
  it('marks a re-approved overlap entry', () => {
    const html = renderChange(
      webChange({
        folderKey: '002-b',
        title: 'B',
        runsAfter: [{ folder: '001-a', capabilities: ['orders'], reapproved: true }],
      }),
    );
    assert.match(
      html,
      /<dt>Runs after<\/dt><dd>001-a \(also writes orders; approved again since\)<\/dd>/,
    );
  });
});
