import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { type Status, StatusBadge, statusForTaskState } from '../packages/ui/src/status.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

interface StatusFixture {
  readonly status: Status;
  readonly word: string;
  readonly variable: string;
}

const STATUSES: readonly StatusFixture[] = [
  { status: 'verified', word: 'verified', variable: '--status-verified' },
  { status: 'manual', word: 'manual', variable: '--status-verified' },
  { status: 'dead', word: 'dead', variable: '--status-dead' },
  { status: 'regressed', word: 'regressed', variable: '--status-regressed' },
  { status: 'running', word: 'running', variable: '--status-running' },
  { status: 'pending', word: 'pending', variable: '--status-pending' },
];

const PALETTE = [
  '--bg',
  '--text',
  '--muted',
  '--border',
  '--accent',
  '--status-verified',
  '--status-dead',
  '--status-regressed',
  '--status-running',
  '--status-pending',
] as const;

async function readStyles(): Promise<string> {
  return fs.readFile(path.join(ROOT, 'packages', 'ui', 'src', 'styles.css'), 'utf8');
}

describe('status badge', () => {
  it('renders an aria-hidden dot in the status color followed by the status word', () => {
    for (const { status, word, variable } of STATUSES) {
      const html = renderToStaticMarkup(createElement(StatusBadge, { status }));
      assert.match(html, new RegExp(`class="status-badge status-${status}"`));
      assert.match(html, /<span class="status-dot" aria-hidden="true" style="background-color:/);
      assert.ok(
        html.includes(`background-color:var(${variable})`),
        `${status} must use ${variable}`,
      );
      assert.ok(html.includes(`${word}</span>`), `${status} must show the word ${word}`);
    }
  });

  it('maps every derived task state onto the status vocabulary', () => {
    assert.equal(statusForTaskState('done'), 'verified');
    assert.equal(statusForTaskState('dead'), 'dead');
    assert.equal(statusForTaskState('regressed'), 'regressed');
    assert.equal(statusForTaskState('running'), 'running');
    assert.equal(statusForTaskState('pending'), 'pending');
    assert.equal(statusForTaskState('unexpected'), 'pending');
  });

  it('defines the whole palette for light and dark schemes', async () => {
    const css = await readStyles();
    const [light = '', dark = ''] = css.split('@media (prefers-color-scheme: dark)');
    assert.ok(dark.length > 0, 'styles.css must redefine the palette for a dark scheme');
    for (const property of PALETTE) {
      assert.ok(light.includes(`${property}:`), `${property} must be defined on :root`);
      assert.ok(dark.includes(`${property}:`), `${property} must be defined in the dark scheme`);
    }
  });

  it('never centers table cells', async () => {
    const css = await readStyles();
    assert.equal(/text-align:\s*center/.test(css), false);
  });
});
