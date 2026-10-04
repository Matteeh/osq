import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ApprovalFlags,
  ChangeActions,
  ChangeView,
  DeltaReview,
} from '../packages/ui/src/change/index.js';
import type {
  ApprovalFlag,
  WebAction,
  WebChange,
  WebDeltaRequirement,
  WebReview,
} from '../packages/ui/src/contracts.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import type { ApprovalDigest } from '../src/core/spec/digest.js';
import { getWebChange } from '../src/core/web/web-data.js';
import { createChange, createProject, restoreEnv } from './planning-observed-helpers.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OPENSPEC_ROOT = DEFAULT_CONFIG.paths.openspecRoot;
const REVIEW_CSS = path.join(ROOT, 'packages', 'ui', 'src', 'change', 'review.css');

const APPROVE: WebAction = { verb: 'approve', command: 'osq approve 001', target: null };
const RETRY: WebAction = { verb: 'retry', command: 'osq retry 001 change', target: 'change' };

const LIVING_ALPHA = [
  '# alpha Specification',
  '',
  '## Purpose',
  '',
  'Alpha purpose.',
  '',
  '## Requirements',
  '',
  '### Requirement: Alpha one',
  'The system SHALL do one.',
  '',
  '#### Scenario: One',
  '- **WHEN** one',
  '- **THEN** one',
  '',
  '### Requirement: Alpha three',
  'The system SHALL do three.',
  '',
  '#### Scenario: Three',
  '- **WHEN** three',
  '- **THEN** three',
  '',
].join('\n');

const DELTA_ALPHA = [
  '# alpha Specification',
  '',
  '## Purpose',
  '',
  'Alpha delta purpose.',
  '',
  '## MODIFIED Requirements',
  '',
  '### Requirement: Alpha one',
  'The system SHALL do one, modified.',
  '',
  '#### Scenario: One',
  '- **WHEN** one',
  '- **THEN** one modified',
  '',
  '## REMOVED Requirements',
  '',
  '### Requirement: Alpha three',
  '',
].join('\n');

const roots: string[] = [];

beforeEach(() => {
  restoreEnv();
  // Keep the default planning readers away from the real home directory, as
  // `tests/ui-actions.test.tsx` does.
  process.env.CODEX_HOME = '/nonexistent-osq-ui-review-codex';
  process.env.OSQ_CLAUDE_PROJECTS_DIR = '/nonexistent-osq-ui-review-claude';
  process.env.CLAUDE_CONFIG_DIR = '/nonexistent-osq-ui-review-claude-config';
  process.env.OPENCODE_PATH = '/nonexistent-osq-ui-review-opencode';
});

afterEach(async () => {
  restoreEnv();
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function write(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

function approvalFlag(overrides: Partial<ApprovalFlag> = {}): ApprovalFlag {
  return {
    id: 'removed_requirement',
    label: 'removes 1 requirements from alpha',
    excerpt: 'Alpha three',
    ...overrides,
  };
}

function digest(overrides: Partial<ApprovalDigest> = {}): ApprovalDigest {
  return {
    change: '001-review-change',
    goal: 'Review goal.',
    tasks: [],
    capabilities: [],
    decisions: [],
    humanSteps: '',
    beforeApproval: '',
    flags: [],
    ...overrides,
  };
}

function requirement(overrides: Partial<WebDeltaRequirement> = {}): WebDeltaRequirement {
  return {
    operation: 'modified',
    name: 'Alpha one',
    from: null,
    proposed: '### Requirement: Alpha one\n\nThe proposed one.',
    living: '### Requirement: Alpha one\n\nThe living one.',
    ...overrides,
  };
}

function review(overrides: Partial<WebReview> = {}): WebReview {
  return {
    goal: 'The review goal.',
    nonGoals: 'The non-goals.',
    surface: 'The surface.',
    decisions: 'The decisions.',
    humanSteps: 'The human steps.',
    contract: '### Requirement: Contract',
    deltas: [{ capability: 'alpha', requirements: [requirement()] }],
    digest: digest(),
    digestText: 'Approval digest body.',
    ...overrides,
  };
}

function webChange(overrides: Partial<WebChange> = {}): WebChange {
  return {
    folderKey: '001-review-change',
    id: 1,
    slug: '001-review-change',
    title: 'Review Change',
    state: 'active',
    location: 'active',
    planner: null,
    brief: null,
    goal: 'The proposal goal.',
    rejection: null,
    dependsOn: [],
    reads: [],
    writes: [],
    asOf: '2026-06-01T00:00:42.000Z',
    tasks: [],
    ...overrides,
  };
}

function render(element: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(element);
}

describe('approve review view', () => {
  it('shows the review sections in order, then the tasks and the digest', () => {
    const html = render(createElement(ChangeView, { change: webChange({ review: review() }) }));
    const order = [
      '<h3>Goal</h3>',
      '<h3>Non-goals</h3>',
      '<h3>Surface</h3>',
      '<h3>Decisions</h3>',
      '<h3>Human steps</h3>',
      '<h3>Contract</h3>',
      '<h3>Deltas</h3>',
      '<p class="tasks-empty">No tasks are recorded for this change.</p>',
      '<h3>Approval digest</h3>',
    ];
    let previous = -1;
    for (const marker of order) {
      const index = html.indexOf(marker);
      assert.ok(index > previous, `${marker} should follow the previous section`);
      previous = index;
    }
    assert.match(html, /<pre class="review-text">The review goal\.<\/pre>/);
    assert.match(html, /<pre class="review-text">Approval digest body\.<\/pre>/);
  });

  it('says None for an empty review section', () => {
    const html = render(
      createElement(ChangeView, {
        change: webChange({ review: review({ nonGoals: '', surface: '' }) }),
      }),
    );
    assert.match(html, /<h3>Non-goals<\/h3><p class="review-none">None<\/p>/);
    assert.match(html, /<h3>Surface<\/h3><p class="review-none">None<\/p>/);
  });

  it('lists the digest flags when there is no action client', () => {
    const flag = approvalFlag({ excerpt: 'the removed name' });
    const html = render(
      createElement(ChangeView, {
        change: webChange({ review: review({ digest: digest({ flags: [flag] }) }) }),
      }),
    );
    const digestIndex = html.indexOf('<h3>Approval digest</h3>');
    const labelIndex = html.indexOf(flag.label);
    const excerptIndex = html.indexOf(flag.excerpt);
    assert.ok(labelIndex > digestIndex);
    assert.ok(excerptIndex > digestIndex);
    assert.match(html, /<strong>removes 1 requirements from alpha<\/strong>/);
  });

  it('shows New requirement, Removed, and Renamed from wording', () => {
    const deltas = [
      {
        capability: 'alpha',
        requirements: [
          requirement({ operation: 'added', name: 'Alpha new', living: null }),
          requirement({
            operation: 'removed',
            name: 'Alpha three',
            living: '### Requirement: Alpha three\n\nThe living three.',
          }),
          requirement({
            operation: 'renamed',
            name: 'Alpha renamed',
            from: 'Alpha two',
            living: '### Requirement: Alpha two\n\nThe living two.',
          }),
          requirement({ name: 'Alpha orphan', living: null }),
        ],
      },
    ];
    const html = render(createElement(DeltaReview, { deltas }));
    assert.match(html, /New requirement/);
    assert.match(html, /Removed/);
    assert.match(html, /Renamed from Alpha two/);
    assert.match(html, /The living two\./);
    assert.match(html, /No living requirement matched\./);
  });

  it('renders exactly as before when the review is missing or null', () => {
    const change = webChange();
    const missing = render(createElement(ChangeView, { change }));
    const nulled = render(createElement(ChangeView, { change: { ...change, review: null } }));
    assert.equal(missing, nulled);
    assert.equal(missing.includes('<h3>Non-goals</h3>'), false);
  });

  it('styles the review text and the delta pair to wrap at phone width', async () => {
    const css = await fs.readFile(REVIEW_CSS, 'utf8');
    assert.match(css, /\.review-text\s*\{[^}]*white-space:\s*pre-wrap/);
    assert.match(css, /\.review-text\s*\{[^}]*overflow-wrap:\s*anywhere/);
    assert.match(css, /\.delta-pair\s*\{[^}]*display:\s*grid/);
    assert.match(
      css,
      /\.delta-pair\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*18rem\),\s*1fr\)\)/,
    );
  });
});

describe('approval flags', () => {
  it('renders nothing for an empty flag list', () => {
    assert.equal(render(createElement(ApprovalFlags, { flags: [] })), '');
  });

  it('places each flag and excerpt inside the Approve button item', () => {
    const flag = approvalFlag({ excerpt: 'the removed name' });
    const html = render(
      createElement(ChangeActions, {
        document: { folderKey: '001-review-change', token: 'tok', actions: [APPROVE], manual: [] },
        pending: false,
        result: null,
        reason: '',
        onReasonChange: () => {},
        onRun: () => {},
        flags: [flag],
      }),
    );
    assert.match(
      html,
      /<div class="action-item"><button[^>]*>Approve<\/button><ul class="approval-flags">/,
    );
    assert.match(
      html,
      /<li class="approval-flag"><strong>removes 1 requirements from alpha<\/strong>/,
    );
    assert.match(html, /the removed name/);
  });

  it('places the flags before the buttons when there is no approve action', () => {
    const flag = approvalFlag();
    const html = render(
      createElement(ChangeActions, {
        document: { folderKey: '001-review-change', token: 'tok', actions: [RETRY], manual: [] },
        pending: false,
        result: null,
        reason: '',
        onReasonChange: () => {},
        onRun: () => {},
        flags: [flag],
      }),
    );
    const flagsIndex = html.indexOf('<ul class="approval-flags">');
    const buttonsIndex = html.indexOf('<div class="action-buttons">');
    assert.ok(flagsIndex >= 0);
    assert.ok(flagsIndex < buttonsIndex);
  });
});

describe('approve review against a real document', () => {
  it('renders the living and proposed text and the removed requirement flag', async () => {
    const root = await createProject();
    roots.push(root);
    const change = await createChange(root, 'Core Review Change');
    await write(root, `${OPENSPEC_ROOT}/specs/alpha/spec.md`, LIVING_ALPHA);
    await write(
      root,
      path.relative(root, path.join(change.folderPath, 'specs', 'alpha', 'spec.md')),
      DELTA_ALPHA,
    );

    const document = await getWebChange(root, change.specId, DEFAULT_CONFIG);
    const built = document.review;
    assert.ok(built, 'an unapproved active change should carry a review');

    const modified = built.deltas[0]?.requirements.find((entry) => entry.operation === 'modified');
    assert.ok(modified?.living);
    assert.ok(modified.proposed);

    const removedFlag = built.digest.flags.find((flag) => flag.id === 'removed_requirement');
    assert.ok(removedFlag, 'a removed requirement should raise the removed_requirement flag');

    const html = render(createElement(ChangeView, { change: document }));
    assert.ok(html.includes(modified.living));
    assert.ok(html.includes(modified.proposed));
    assert.ok(html.includes(removedFlag.label));
    assert.ok(html.includes(removedFlag.excerpt));
  });
});
