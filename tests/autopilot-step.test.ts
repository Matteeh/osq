import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, before, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { type PlanRunView, writePlanRunRecord } from '../src/core/run/plan-run-record.js';
import { hashChangeFolder } from '../src/core/spec/hasher.js';
import {
  type AutopilotMarker,
  readAutopilotMarker,
  updateAutopilotMarker,
  writeAutopilotMarker,
} from '../src/core/status/autopilot-marker.js';
import { autopilotStep } from '../src/core/status/autopilot-step.js';
import {
  type AutopilotChangeView,
  type AutopilotItemView,
  type AutopilotView,
  readAutopilotView,
} from '../src/core/status/autopilot-view.js';
import type { NextStep } from '../src/core/status/next-step.js';
import { writeQueueApproval } from '../src/core/status/queue-approval.js';
import { type QueueItem, getQueuePath, parseQueue } from '../src/core/status/queue-parser.js';
import type { QueueRow } from '../src/core/status/queue-state.js';

const OPENSPEC = 'openspec';
const MARKER_TIME = '2026-10-17T00:00:00.000Z';
const STARTED_TIME = '2026-10-17T00:01:00.000Z';
const CHANGE_ID = '003';
const HALT_COMMAND = 'osq retry 003 1';

const tmpDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

async function writeAt(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// --- Marker round trip ------------------------------------------------------

describe('autopilot marker', () => {
  it('Marker round trip', async () => {
    const folder = await makeTempDir('osq-autopilot-marker-');
    await writeAutopilotMarker(folder, {
      item: 'orders',
      queueApproval: 'sha256:abc',
      createdAt: MARKER_TIME,
    });
    await updateAutopilotMarker(folder, { plannerStartedAt: STARTED_TIME });

    const marker = await readAutopilotMarker(folder);
    assert.ok(marker, 'the marker must read back');
    assert.equal(marker.item, 'orders');
    assert.equal(marker.queueApproval, 'sha256:abc');
    assert.equal(marker.createdAt, MARKER_TIME);
    assert.equal(marker.plannerStartedAt, STARTED_TIME);
    assert.equal(marker.approvedAt, undefined);
  });

  it('reads a missing or unparsable marker as none', async () => {
    const folder = await makeTempDir('osq-autopilot-marker-missing-');
    assert.equal(await readAutopilotMarker(folder), null);
    await writeAt(folder, '.run/autopilot.md', 'not a marker\n');
    assert.equal(await readAutopilotMarker(folder), null);
    assert.equal(await updateAutopilotMarker(folder, { approvedAt: MARKER_TIME }), null);
  });
});

// --- Hand-built views -------------------------------------------------------

function queueItem(slug: string): QueueItem {
  return {
    slug,
    title: 'Orders',
    dependsOn: [],
    fixes: [],
    body: 'Body.',
    hash: `sha256:${slug}`,
  };
}

function queueRow(over: Partial<QueueRow> = {}): QueueRow {
  return {
    slug: 'orders',
    title: 'Orders',
    state: 'planned',
    changeId: CHANGE_ID,
    rejectionCount: 0,
    changedSincePlanned: false,
    unmetDependencies: [],
    ...over,
  };
}

function marker(over: Partial<AutopilotMarker> = {}): AutopilotMarker {
  return {
    item: 'orders',
    queueApproval: 'sha256:approval',
    createdAt: MARKER_TIME,
    plannerStartedAt: STARTED_TIME,
    ...over,
  };
}

function planRun(outcome: PlanRunView['outcome']): PlanRunView {
  return { outcome, at: MARKER_TIME, changed: [], detail: null };
}

function nextStep(over: Partial<NextStep> = {}): NextStep {
  return { state: 'running', command: `osq show ${CHANGE_ID}`, detail: null, ...over };
}

function changeView(over: Partial<AutopilotChangeView> = {}): AutopilotChangeView {
  return {
    id: CHANGE_ID,
    folderName: '003-orders',
    folderPath: '/tmp/003-orders',
    location: 'active',
    approved: false,
    marker: marker(),
    planRun: planRun('ready'),
    nextStep: nextStep(),
    ...over,
  };
}

function itemView(over: Partial<AutopilotItemView> = {}): AutopilotItemView {
  return {
    item: queueItem('orders'),
    row: queueRow(),
    approval: 'approved',
    change: changeView(),
    ...over,
  };
}

function view(over: Partial<AutopilotView> = {}): AutopilotView {
  return {
    queue: { exists: true, error: null },
    pauseActive: false,
    approvedChangeIds: [],
    firstOpenItem: itemView(),
    ...over,
  };
}

function handBuiltViews(): Record<string, AutopilotView> {
  const noChange = (approval: AutopilotItemView['approval']): AutopilotView =>
    view({
      firstOpenItem: itemView({
        change: null,
        row: queueRow({ changeId: null, state: 'unplanned' }),
        approval,
      }),
    });
  return {
    'no queue file': view({ queue: { exists: false, error: null }, firstOpenItem: null }),
    'the queue file does not parse': view({
      queue: { exists: true, error: 'openspec/queue.md: bad' },
      firstOpenItem: null,
    }),
    'a usage-limit pause is active': view({ pauseActive: true }),
    'every item landed': view({ firstOpenItem: null }),
    'another approved change is active': view({ approvedChangeIds: ['004'] }),
    'the item has no change and no recorded hash': noChange('unapproved'),
    'the item has no change and another recorded hash': noChange('changed'),
    'the item was rejected': view({
      firstOpenItem: itemView({ change: null, row: queueRow({ state: 'rejected' }) }),
    }),
    'the item is unplanned': view({
      firstOpenItem: itemView({
        change: null,
        row: queueRow({ changeId: null, state: 'unplanned' }),
        approval: 'approved',
      }),
    }),
    'its change is unapproved and has no marker': view({
      firstOpenItem: itemView({ change: changeView({ approved: false, marker: null }) }),
    }),
    'its marker has no planner_started_at': view({
      firstOpenItem: itemView({
        change: changeView({ marker: marker({ plannerStartedAt: undefined }) }),
      }),
    }),
    'its planner is running': view({
      firstOpenItem: itemView({ change: changeView({ planRun: planRun('running') }) }),
    }),
    'its planner is ready': view({
      firstOpenItem: itemView({ change: changeView({ planRun: planRun('ready') }) }),
    }),
    'its planner is lint_red': view({
      firstOpenItem: itemView({ change: changeView({ planRun: planRun('lint_red') }) }),
    }),
    'its planner started and no planner run is current': view({
      firstOpenItem: itemView({ change: changeView({ planRun: null }) }),
    }),
    'its change is approved and its next step is running or blocked': view({
      firstOpenItem: itemView({ change: changeView({ approved: true }) }),
    }),
    "its change's next step is dead": view({
      firstOpenItem: itemView({
        change: changeView({
          approved: true,
          nextStep: nextStep({ state: 'dead', command: HALT_COMMAND, detail: null }),
        }),
      }),
    }),
    'its change is archived and not landed': view({
      firstOpenItem: itemView({
        change: changeView({
          approved: true,
          location: 'archived',
          nextStep: nextStep({
            state: 'archived',
            command: `osq land ${CHANGE_ID}`,
            detail: 'not landed',
          }),
        }),
      }),
    }),
  };
}

// --- Views read from a temporary project ------------------------------------

function oneItemQueue(): string {
  return '## [orders] Orders\nDepends on: nothing\n\nBrief body for orders.\n';
}

/** A project whose first queue item's active change has a `ready` planner run. */
async function makeReadyPlanProject(): Promise<string> {
  const root = await makeTempDir('osq-autopilot-ready-');
  const queueText = oneItemQueue();
  await writeAt(root, `${OPENSPEC}/queue.md`, queueText);
  const item = parseQueue(queueText, getQueuePath(root, DEFAULT_CONFIG))[0];
  assert.ok(item, 'the queue fixture must hold one item');
  const folder = path.join(root, OPENSPEC, 'changes', '003-orders');
  await writeAt(
    folder,
    'proposal.md',
    '---\ntitle: Orders\nverify: node verify.cjs\n---\n## Goal\nDo it.\n',
  );
  await writeAt(folder, 'brief.md', `---\nqueue_item: orders\nqueue_hash: ${item.hash}\n---\n`);
  const hash = await hashChangeFolder(folder);
  await writePlanRunRecord(folder, { outcome: 'ready', changed: [], at: MARKER_TIME, hash });
  await writeAutopilotMarker(folder, {
    item: 'orders',
    queueApproval: 'sha256:pending',
    createdAt: MARKER_TIME,
    plannerStartedAt: STARTED_TIME,
  });
  await writeQueueApproval(
    root,
    DEFAULT_CONFIG,
    [{ slug: 'orders', hash: item.hash }],
    '',
    MARKER_TIME,
  );
  return root;
}

async function realProjectViews(): Promise<Record<string, AutopilotView>> {
  const empty = await makeTempDir('osq-autopilot-empty-');
  const bad = await makeTempDir('osq-autopilot-bad-');
  await writeAt(bad, `${OPENSPEC}/queue.md`, '## [orders] Orders\n');
  const noApproval = await makeTempDir('osq-autopilot-noapproval-');
  await writeAt(noApproval, `${OPENSPEC}/queue.md`, oneItemQueue());
  const changed = await makeTempDir('osq-autopilot-changed-');
  await writeAt(changed, `${OPENSPEC}/queue.md`, oneItemQueue());
  await writeQueueApproval(
    changed,
    DEFAULT_CONFIG,
    [{ slug: 'orders', hash: 'sha256:other' }],
    '',
    MARKER_TIME,
  );
  const ready = await makeReadyPlanProject();
  return {
    'no queue file': await readAutopilotView(empty, DEFAULT_CONFIG),
    'the queue file does not parse': await readAutopilotView(bad, DEFAULT_CONFIG),
    'the item has no change and no recorded hash': await readAutopilotView(
      noApproval,
      DEFAULT_CONFIG,
    ),
    'the item has no change and another recorded hash': await readAutopilotView(
      changed,
      DEFAULT_CONFIG,
    ),
    'its planner is ready': await readAutopilotView(ready, DEFAULT_CONFIG),
  };
}

// --- The step ---------------------------------------------------------------

interface ExpectedStep {
  readonly state: string;
  readonly kind: string;
  readonly item: string | null;
  readonly change: string | null;
  readonly reason: string | null;
  /** The exact command, `the next step's command`, or null for a non-stop step. */
  readonly command: string | null;
}

/**
 * One case per row of "Autopilot steps", in the spec's table order. Values are
 * transcribed from the delta spec's state/step table, not computed.
 */
const STEP_ROWS: readonly ExpectedStep[] = [
  { state: 'no queue file', kind: 'done', item: null, change: null, reason: null, command: null },
  {
    state: 'the queue file does not parse',
    kind: 'stop',
    item: null,
    change: null,
    reason: 'queue_unreadable',
    command: 'osq queue',
  },
  {
    state: 'a usage-limit pause is active',
    kind: 'wait',
    item: null,
    change: null,
    reason: null,
    command: null,
  },
  {
    state: 'every item landed',
    kind: 'done',
    item: null,
    change: null,
    reason: null,
    command: null,
  },
  {
    state: 'another approved change is active',
    kind: 'wait',
    item: 'orders',
    change: CHANGE_ID,
    reason: null,
    command: null,
  },
  {
    state: 'the item has no change and no recorded hash',
    kind: 'stop',
    item: 'orders',
    change: null,
    reason: 'not_approved',
    command: 'osq queue approve',
  },
  {
    state: 'the item has no change and another recorded hash',
    kind: 'stop',
    item: 'orders',
    change: null,
    reason: 'changed_since_approval',
    command: 'osq queue approve',
  },
  {
    state: 'the item was rejected',
    kind: 'stop',
    item: 'orders',
    change: CHANGE_ID,
    reason: 'rejected',
    command: 'osq plan --next --replan',
  },
  {
    state: 'the item is unplanned',
    kind: 'plan-next',
    item: 'orders',
    change: null,
    reason: null,
    command: null,
  },
  {
    state: 'its change is unapproved and has no marker',
    kind: 'wait',
    item: 'orders',
    change: CHANGE_ID,
    reason: null,
    command: null,
  },
  {
    state: 'its marker has no planner_started_at',
    kind: 'plan',
    item: 'orders',
    change: CHANGE_ID,
    reason: null,
    command: null,
  },
  {
    state: 'its planner is running',
    kind: 'wait',
    item: 'orders',
    change: CHANGE_ID,
    reason: null,
    command: null,
  },
  {
    state: 'its planner is ready',
    kind: 'approve',
    item: 'orders',
    change: CHANGE_ID,
    reason: null,
    command: null,
  },
  {
    state: 'its planner is lint_red',
    kind: 'stop',
    item: 'orders',
    change: CHANGE_ID,
    reason: 'planner_not_ready',
    command: `osq plan ${CHANGE_ID}`,
  },
  {
    state: 'its planner started and no planner run is current',
    kind: 'wait',
    item: 'orders',
    change: CHANGE_ID,
    reason: null,
    command: null,
  },
  {
    state: 'its change is approved and its next step is running or blocked',
    kind: 'wait',
    item: 'orders',
    change: CHANGE_ID,
    reason: null,
    command: null,
  },
  {
    state: "its change's next step is dead",
    kind: 'stop',
    item: 'orders',
    change: CHANGE_ID,
    reason: 'halted',
    command: "the next step's command",
  },
  {
    state: 'its change is archived and not landed',
    kind: 'land',
    item: 'orders',
    change: CHANGE_ID,
    reason: null,
    command: null,
  },
];

describe('autopilot step', () => {
  let views: Record<string, AutopilotView> = {};

  before(async () => {
    views = { ...handBuiltViews(), ...(await realProjectViews()) };
  });

  for (const row of STEP_ROWS) {
    it(`Autopilot steps: ${row.state}`, () => {
      const currentView = views[row.state];
      assert.ok(currentView, `no view for "${row.state}"`);
      const step = autopilotStep(currentView);
      assert.equal(step.kind, row.kind, row.state);
      assert.equal(step.item, row.item, row.state);
      assert.equal(step.change, row.change, row.state);
      if (row.kind !== 'stop') return;
      assert.equal(step.reason, row.reason, row.state);
      const expectedCommand =
        row.command === "the next step's command"
          ? (currentView.firstOpenItem?.change?.nextStep.command ?? null)
          : row.command;
      assert.equal(step.command, expectedCommand, row.state);
    });
  }

  it('carries no change for plan-next', () => {
    const planNext = autopilotStep(views['the item is unplanned'] as AutopilotView);
    assert.equal(planNext.change, null);
    assert.equal(planNext.item, 'orders');
  });
});
