import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChangeView } from '../packages/ui/src/change/index.js';
import type { LandGate, LandView, WebChange } from '../packages/ui/src/contracts.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import type { WebTask } from '../src/core/web/web-data-types.js';
import { getWebChange } from '../src/core/web/web-data.js';
import { buildWebFixture } from './fixtures/web/build.js';
import { restoreEnv } from './planning-observed-helpers.js';

const roots: string[] = [];

beforeEach(() => {
  restoreEnv();
  process.env.CODEX_HOME = '/nonexistent-osq-ui-land-codex';
  process.env.OSQ_CLAUDE_PROJECTS_DIR = '/nonexistent-osq-ui-land-claude';
  process.env.CLAUDE_CONFIG_DIR = '/nonexistent-osq-ui-land-claude-config';
  process.env.OPENCODE_PATH = '/nonexistent-osq-ui-land-opencode';
});

afterEach(async () => {
  restoreEnv();
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

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
    folderName: '042-land',
    landed: false,
    defaultBranch: 'main',
    mainCommits: 3,
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

function webTask(overrides: Partial<WebTask> & Pick<WebTask, 'taskNumber' | 'title'>): WebTask {
  return {
    declaredScope: [],
    resolvedScope: [],
    acceptance: [],
    verify: 'node verify.cjs',
    state: 'done',
    attempts: 1,
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
    folderKey: '042-land',
    id: 42,
    slug: '042-land',
    title: 'Land Change',
    state: 'archived',
    location: 'archived',
    planner: null,
    brief: null,
    goal: 'The land goal.',
    rejection: null,
    dependsOn: [],
    reads: [],
    writes: [],
    asOf: '2026-06-01T00:00:42.000Z',
    tasks: [webTask({ taskNumber: '1', title: 'Land task' })],
    ...overrides,
  };
}

function render(change: WebChange): string {
  return renderToStaticMarkup(createElement(ChangeView, { change }));
}

describe('land view headline', () => {
  it('says landing will merge 3 commits and run verify again', () => {
    const html = render(webChange({ land: landView({ mainCommits: 3 }) }));
    assert.match(
      html,
      /Not landed\. main has 3 new commits since archive; Land will merge them and run verify again/,
    );
  });

  it('uses the singular commit for one commit', () => {
    const html = render(webChange({ land: landView({ mainCommits: 1 }) }));
    assert.match(
      html,
      /Not landed\. main has 1 new commit since archive; Land will merge them and run verify again/,
    );
  });

  it('says the branch has not moved when there are no new commits', () => {
    const html = render(webChange({ land: landView({ mainCommits: 0 }) }));
    assert.match(html, /Not landed\. main has not moved since archive/);
  });

  it('says Landed for a landed change', () => {
    const html = render(webChange({ land: landView({ landed: true, mainCommits: null }) }));
    assert.match(html, /Landed/);
  });

  it('says Git is off when git was unavailable', () => {
    const html = render(
      webChange({ land: landView({ landed: null, defaultBranch: null, mainCommits: null }) }),
    );
    assert.match(html, /Git is off/);
  });

  it('says the branch was not found when the osq branch is gone', () => {
    const html = render(webChange({ land: landView({ mainCommits: null }) }));
    assert.match(html, /Not landed\. Branch osq\/042-land not found/);
  });
});

describe('land view sections', () => {
  it('shows a failed gate exit code and the validator finding count', () => {
    const gates = [
      gate({
        kind: 'task',
        task: '2',
        outcome: 'failed',
        exitCode: 7,
        durationSeconds: 2.6,
      }),
      gate({
        kind: 'validator',
        task: null,
        command: 'claude/claude-opus-5-5',
        outcome: 'validated',
        exitCode: 0,
        durationSeconds: 61.4,
        findings: 2,
      }),
    ];
    const html = render(webChange({ land: landView({ gates }) }));
    assert.match(html, /Task 2/);
    assert.match(html, /failed/);
    assert.match(html, /exit 7/);
    assert.match(html, /in 3s/);
    assert.match(html, /Validator/);
    assert.match(html, /2 findings/);
    assert.match(html, /claude\/claude-opus-5-5/);
  });

  it('says None recorded without gates', () => {
    const html = render(webChange({ land: landView() }));
    assert.match(html, /Gates at archive<\/h4><p class="review-none">None recorded<\/p>/);
  });

  it('renders the diff line or Unavailable', () => {
    const withDiff = render(
      webChange({ land: landView({ diff: { files: 4, added: 12, removed: 3 } }) }),
    );
    assert.match(withDiff, /4 files changed, \+12 -3/);
    const withoutDiff = render(webChange({ land: landView() }));
    assert.match(withoutDiff, /Diff<\/h4><p class="land-diff">Unavailable<\/p>/);
  });

  it('renders each capability spec change and a rename as from to', () => {
    const html = render(
      webChange({
        land: landView({
          capabilities: [
            {
              name: 'alpha',
              added: ['Alpha new'],
              modified: ['Alpha one'],
              removed: ['Alpha three'],
              renamed: [{ from: 'Alpha two', to: 'Alpha renamed' }],
            },
          ],
        }),
      }),
    );
    assert.match(html, /alpha/);
    assert.match(html, /added: Alpha new/);
    assert.match(html, /modified: Alpha one/);
    assert.match(html, /removed: Alpha three/);
    assert.match(html, /renamed: Alpha two → Alpha renamed/);
  });

  it('says None without spec changes or disclosures', () => {
    const html = render(webChange({ land: landView() }));
    assert.match(html, /Spec changes<\/h4><p class="review-none">None<\/p>/);
    assert.match(html, /Executor disclosures<\/h4><p class="review-none">None<\/p>/);
  });

  it('renders disclosure text in a wrapping preformatted element', () => {
    const html = render(
      webChange({
        land: landView({
          disclosures: [
            { task: '1', deviated: 'Renamed the helper.', outsideScope: 'Found a stale test.' },
          ],
        }),
      }),
    );
    assert.match(html, /<pre class="review-text">Renamed the helper\.<\/pre>/);
    assert.match(html, /<pre class="review-text">Found a stale test\.<\/pre>/);
    assert.match(html, /Task 1/);
  });

  it('renders Halted and Sync stopped when they are set', () => {
    const html = render(
      webChange({
        land: landView({
          halt: { reason: 'verify_red', message: 'verify failed' },
          lastSyncStop: {
            timestamp: '2026-02-02T00:00:00.000Z',
            reason: 'sync_conflict',
            message: 'src/a.ts conflicts',
          },
        }),
      }),
    );
    assert.match(html, /<h4>Halted<\/h4>/);
    assert.match(html, /verify_red/);
    assert.match(html, /verify failed/);
    assert.match(html, /<h4>Sync stopped<\/h4>/);
    assert.match(html, /sync_conflict/);
    assert.match(html, /src\/a\.ts conflicts/);
  });
});

describe('land view placement', () => {
  it('orders the land headings and puts the section before the task table', () => {
    const html = render(
      webChange({
        land: landView({
          gates: [gate()],
          diff: { files: 1, added: 1, removed: 0 },
          capabilities: [{ name: 'alpha', added: ['A'], modified: [], removed: [], renamed: [] }],
          disclosures: [{ task: '1', deviated: 'x', outsideScope: null }],
        }),
      }),
    );
    const order = [
      '<h3 id="land-title">Land</h3>',
      '<h4>Gates at archive</h4>',
      '<h4>Diff</h4>',
      '<h4>Spec changes</h4>',
      '<h4>Executor disclosures</h4>',
      '<table class="task-table">',
    ];
    let previous = -1;
    for (const marker of order) {
      const index = html.indexOf(marker);
      assert.ok(index > previous, `${marker} should follow the previous marker`);
      previous = index;
    }
  });

  it('shows the identical markup when land is missing and when it is null', () => {
    const change = webChange();
    const missing = render(change);
    const nulled = render({ ...change, land: null });
    assert.equal(missing, nulled);
    assert.equal(missing.includes('<h3 id="land-title">'), false);
  });
});

describe('land view against a real document', () => {
  it('renders the Land heading and gates for the archived fixture change', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-ui-land-'));
    roots.push(root);
    await buildWebFixture(root);
    const document = await getWebChange(root, '002-archived-change', DEFAULT_CONFIG);
    assert.ok(document.land, 'an archived change should carry a land view');
    const html = render(document);
    assert.match(html, /<h3 id="land-title">Land<\/h3>/);
    assert.match(html, /Gates at archive/);
  });
});
