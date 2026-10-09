import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ChangeActions,
  ChangeView,
  NoticePanel,
  approveInput,
  unopenedRedLabels,
} from '../packages/ui/src/change/index.js';
import type {
  ApprovalNotice,
  ApprovalNotices,
  WebAction,
  WebChange,
  WebReview,
} from '../packages/ui/src/contracts.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { getWebChange } from '../src/core/web/web-data.js';
import { createChange, createProject, restoreEnv } from './planning-observed-helpers.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OPENSPEC_ROOT = DEFAULT_CONFIG.paths.openspecRoot;
const NOTICES_CSS = path.join(ROOT, 'packages', 'ui', 'src', 'change', 'notices.css');
const APPROVE: WebAction = { verb: 'approve', command: 'osq approve 001', target: null };
const ENV_KEYS = ['CODEX_HOME', 'OSQ_CLAUDE_PROJECTS_DIR', 'CLAUDE_CONFIG_DIR', 'OPENCODE_PATH'];

const LIVING_ALPHA = [
  '# alpha Specification',
  '## Purpose',
  'Alpha purpose.',
  '## Requirements',
  '### Requirement: Alpha three',
  'The system SHALL do three.',
].join('\n');

const DELTA_ALPHA = [
  '# alpha Specification',
  '## Purpose',
  'Alpha delta purpose.',
  '## REMOVED Requirements',
  '### Requirement: Alpha three',
].join('\n');

const SEVEN_IDS = [
  'rules_path',
  'removed_requirement',
  'adr_departure',
  'many_tasks',
  'large_scope',
  'package_json',
  'assumptions',
] as const;

const roots: string[] = [];

beforeEach(() => {
  restoreEnv();
  // Keep the default planning readers away from the real home directory.
  for (const key of ENV_KEYS) process.env[key] = '/nonexistent-osq-ui-notices';
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

function notice(overrides: Partial<ApprovalNotice> = {}): ApprovalNotice {
  const base: ApprovalNotice = {
    id: 'new_capability',
    severity: 'grey',
    label: 'new capability',
    detail: 'beta',
  };
  return { ...base, ...overrides };
}

function notices(overrides: Partial<ApprovalNotices> = {}): ApprovalNotices {
  return { notices: [], maxShown: 5, unusual: false, ...overrides };
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
      change: '001-notices-change',
      goal: 'Notices goal.',
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

function webChange(overrides: Partial<WebChange> = {}): WebChange {
  return {
    folderKey: '001-notices-change',
    id: 1,
    slug: '001-notices-change',
    title: 'Notices Change',
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

function renderActions(approveBlockedBy: readonly string[]): string {
  return render(
    createElement(ChangeActions, {
      document: { folderKey: '001-notices-change', token: 'tok', actions: [APPROVE], manual: [] },
      pending: false,
      result: null,
      reason: '',
      onReasonChange: () => {},
      onRun: () => {},
      approveBlockedBy,
    }),
  );
}

describe('notice block view', () => {
  it('leads the brief and reads Nothing unusual for a grey-only review', () => {
    const change = webChange({ review: review({ notices: notices({ notices: [notice()] }) }) });
    const html = render(createElement(ChangeView, { change }));
    const noticeIndex = html.indexOf('<h3 id="notices-title">Notices</h3>');
    const briefIndex = html.indexOf('<h3 id="change-brief-title">Brief</h3>');
    assert.ok(noticeIndex >= 0 && noticeIndex < briefIndex, 'the notices should lead the brief');
    assert.match(html, /<p class="notices-none">Nothing unusual<\/p>/);
    assert.match(html, /class="notice notice-grey"/);
    assert.match(html, />Grey<\/span> <span class="notice-label">new capability<\/span>/);
    assert.match(html, /<p class="notice-detail">beta<\/p>/);
  });

  it('shows the first five notices and folds the rest into one 2 more item', () => {
    const seven = SEVEN_IDS.map((id, index) =>
      notice({ id, severity: 'grey', label: `notice ${index + 1}`, detail: `detail ${index + 1}` }),
    );
    const html = render(
      createElement(NoticePanel, { notices: notices({ notices: seven }), onOpen: () => {} }),
    );
    const folderIndex = html.indexOf('2 more</summary>');
    assert.ok(folderIndex >= 0, 'a folded item should summarise the rest');
    assert.ok(html.indexOf('notice 5') < folderIndex, 'the fifth notice should show');
    assert.ok(html.indexOf('notice 6') > folderIndex, 'the sixth notice should fold');
    assert.ok(html.indexOf('notice 7') > folderIndex, 'the seventh notice should fold');
    assert.equal((html.match(/class="notice notice-/g) ?? []).length, 7);
  });

  it('disables Approve with the red notice labels and enables it without them', () => {
    const blocked = renderActions(['removes requirements', 'package.json in scope']);
    assert.match(blocked, /<button[^>]*disabled[^>]*>Approve<\/button>/);
    assert.match(
      blocked,
      /Open each red notice to approve: removes requirements, package\.json in scope/,
    );
    const enabled = renderActions([]);
    assert.equal(/<button[^>]*disabled[^>]*>Approve<\/button>/.test(enabled), false);
    assert.equal(enabled.includes('Open each red notice'), false);
  });

  it('gates on the unopened red notices and posts the opened ids sorted', () => {
    const list = notices({
      notices: [
        notice({ id: 'removed_requirement', severity: 'red', label: 'removes requirements' }),
        notice({ id: 'adr_departure', severity: 'red', label: 'departs from an ADR' }),
        notice({ id: 'new_capability', severity: 'grey', label: 'new capability' }),
      ],
    });
    assert.deepEqual(unopenedRedLabels(list, []), ['removes requirements', 'departs from an ADR']);
    assert.deepEqual(unopenedRedLabels(list, ['removed_requirement']), ['departs from an ADR']);
    assert.deepEqual(
      unopenedRedLabels(list, ['removed_requirement', 'adr_departure', 'new_capability']),
      [],
    );
    assert.deepEqual(approveInput(undefined), { verb: 'approve' });
    assert.deepEqual(approveInput(['b', 'a']), { verb: 'approve', opened: ['a', 'b'] });
  });

  it('styles each severity stripe and wraps notice text at phone width', async () => {
    const css = await fs.readFile(NOTICES_CSS, 'utf8');
    assert.match(css, /\.notice-red\s*\{[^}]*border-inline-start[^}]*var\(--status-dead\)/);
    assert.match(css, /\.notice-amber\s*\{[^}]*border-inline-start[^}]*var\(--status-regressed\)/);
    assert.match(css, /\.notice-grey\s*\{[^}]*border-inline-start[^}]*var\(--status-pending\)/);
    assert.match(css, /overflow-wrap:\s*anywhere/);
  });
});

describe('notice block against a real document', () => {
  it('renders the removes requirements notice for a change that removes a requirement', async () => {
    const root = await createProject();
    roots.push(root);
    const change = await createChange(root, 'Core Notices Change');
    const deltaPath = path.relative(
      root,
      path.join(change.folderPath, 'specs', 'alpha', 'spec.md'),
    );
    await write(root, `${OPENSPEC_ROOT}/specs/alpha/spec.md`, LIVING_ALPHA);
    await write(root, deltaPath, DELTA_ALPHA);

    const document = await getWebChange(root, change.specId, DEFAULT_CONFIG);
    const built = document.review?.notices;
    assert.ok(built, 'an unapproved active change should carry notices');
    assert.ok(built.notices.some((entry) => entry.label === 'removes requirements'));

    const html = render(createElement(ChangeView, { change: document }));
    assert.match(html, /removes requirements/);
    assert.match(html, /<h3 id="notices-title">Notices<\/h3>/);
  });
});
