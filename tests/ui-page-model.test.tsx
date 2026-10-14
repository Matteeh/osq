import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  changePage,
  haltFacts,
  landLine,
  landedLine,
  progressLine,
} from '../packages/ui/src/change/page-model.js';
import type { LandGate, LandView, WebChange } from '../packages/ui/src/contracts.js';
import type { NextStep } from '../src/core/status/next-step.js';
import type { WebTask } from '../src/core/web/web-data-types.js';

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
    folderKey: '010-page',
    id: 10,
    slug: '010-page',
    title: 'Page',
    state: 'active',
    location: 'active',
    planner: null,
    brief: null,
    goal: '',
    rejection: null,
    dependsOn: [],
    reads: [],
    writes: [],
    asOf: '2026-06-01T00:00:42.000Z',
    tasks: [],
    ...overrides,
  };
}

function nextStep(state: NextStep['state'], detail: string | null = null): NextStep {
  return { state, command: null, detail };
}

/** Three tasks, the first done, planned by `claude-opus-5-5`. */
function pageBase(): WebChange {
  return webChange({
    planner: 'claude-opus-5-5',
    tasks: [
      webTask({ taskNumber: '1', title: 'One', state: 'done', attempts: 1 }),
      webTask({ taskNumber: '2', title: 'Two' }),
      webTask({ taskNumber: '3', title: 'Three' }),
    ],
  });
}

function withNext(next: NextStep | null | undefined): WebChange {
  const change = pageBase();
  return next === undefined ? change : { ...change, nextStep: next };
}

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

describe('Page per state', () => {
  it('unplanned shows Needs a plan and Copy', () => {
    assert.deepEqual(changePage(withNext(nextStep('unplanned'))), {
      state: 'unplanned',
      label: 'Needs a plan',
      summary: 'Not planned yet',
      main: 'copy',
      second: null,
    });
  });

  it('ready-for-approval names the planner and offers Approve and Plan again', () => {
    assert.deepEqual(changePage(withNext(nextStep('ready-for-approval'))), {
      state: 'ready-for-approval',
      label: 'Waiting for you',
      summary: '3 tasks · planned by claude-opus-5-5',
      main: 'approve',
      second: 'plan-again',
    });
  });

  it('ready-for-approval without a planner drops the attribution', () => {
    const change = { ...withNext(nextStep('ready-for-approval')), planner: null };
    assert.equal(changePage(change).summary, '3 tasks');
  });

  it('running shows the done count and no button', () => {
    assert.deepEqual(changePage(withNext(nextStep('running'))), {
      state: 'running',
      label: 'Running',
      summary: '1 of 3 tasks done',
      main: null,
      second: null,
    });
  });

  it('blocked shows the done count and no button', () => {
    assert.deepEqual(changePage(withNext(nextStep('blocked'))), {
      state: 'blocked',
      label: 'Blocked',
      summary: '1 of 3 tasks done',
      main: null,
      second: null,
    });
  });

  it('dead without an automatic planner offers Plan it', () => {
    assert.deepEqual(changePage(withNext(nextStep('dead'))), {
      state: 'dead',
      label: 'Halted',
      summary: '1 of 3 tasks done',
      main: 'plan-it',
      second: null,
    });
  });

  it('dead with a ready automatic planner is revised and offers Approve and Plan it myself', () => {
    const change = {
      ...withNext(nextStep('dead')),
      autoSteer: { outcome: 'ready' as const, changed: ['tasks/2.md'] },
    };
    assert.deepEqual(changePage(change), {
      state: 'revised',
      label: 'Waiting for you',
      summary: 'Halted · revised by the automatic planner',
      main: 'approve',
      second: 'plan-it-myself',
    });
  });

  it('archived is ready to land with Land and Plan again', () => {
    assert.deepEqual(changePage(withNext(nextStep('archived'))), {
      state: 'archived',
      label: 'Ready to land',
      summary: '3 tasks done · archived',
      main: 'land',
      second: 'plan-again',
    });
  });

  it('landed is done with no button', () => {
    assert.deepEqual(changePage(withNext(nextStep('landed'))), {
      state: 'landed',
      label: 'Landed',
      summary: '3 tasks done · landed',
      main: null,
      second: null,
    });
  });

  it('a rejected location is rejected with no button, next step or not', () => {
    const change = { ...withNext(null), location: 'rejected' as const };
    assert.deepEqual(changePage(change), {
      state: 'rejected',
      label: 'Rejected',
      summary: '3 tasks',
      main: null,
      second: null,
    });
  });

  it('a missing next step is unknown with the done count', () => {
    assert.deepEqual(changePage(withNext(undefined)), {
      state: 'unknown',
      label: 'Change',
      summary: '1 of 3 tasks done',
      main: null,
      second: null,
    });
  });
});

describe('Progress line', () => {
  function runningWith(elapsed: number | null): WebChange {
    return webChange({
      tasks: [
        webTask({ taskNumber: '1', title: 'One', state: 'done', attempts: 1 }),
        webTask({
          taskNumber: '2',
          title: 'Two',
          state: 'running',
          runningElapsedSeconds: elapsed,
        }),
        webTask({ taskNumber: '3', title: 'Three' }),
      ],
    });
  }

  it('seconds under a minute read as seconds', () => {
    assert.equal(progressLine(runningWith(42)), 'Task 2 of 3 running · 42s');
  });

  it('60 seconds or more read as whole minutes', () => {
    assert.equal(progressLine(runningWith(750)), 'Task 2 of 3 running · 12 min');
  });

  it('a null elapsed reads unavailable', () => {
    assert.equal(progressLine(runningWith(null)), 'Task 2 of 3 running · unavailable');
  });

  it('no running task falls back to the done count', () => {
    assert.equal(progressLine(pageBase()), '1 of 3 tasks done');
  });
});

describe('Halt facts', () => {
  it('names the dead task, its reason, and its touched paths', () => {
    const change = webChange({
      tasks: [
        webTask({ taskNumber: '1', title: 'One' }),
        webTask({ taskNumber: '2', title: 'Two' }),
        webTask({ taskNumber: '3', title: 'Three' }),
        webTask({
          taskNumber: '4',
          title: 'Inbox rows',
          state: 'dead',
          reason: 'verify_red',
          result: 'Wrote the rows.\nTouched: src/core/status/inbox.ts, tests/inbox.test.ts\n',
        }),
      ],
    });
    assert.deepEqual(haltFacts(change), {
      heading: 'Task 4 stopped: Inbox rows',
      reason: 'verify_red',
      touched: ['src/core/status/inbox.ts', 'tests/inbox.test.ts'],
    });
  });

  it('with no dead or regressed task uses the next-step detail and no paths', () => {
    const change = webChange({
      tasks: [webTask({ taskNumber: '1', title: 'One', state: 'done' })],
      nextStep: nextStep('dead', 'needs steering'),
    });
    assert.deepEqual(haltFacts(change), {
      heading: 'The change stopped',
      reason: 'needs steering',
      touched: [],
    });
  });
});

describe('Land line', () => {
  it('all four gates passed', () => {
    const gates = [gate(), gate(), gate(), gate()];
    assert.equal(landLine(landView({ gates })), 'All 4 gates passed');
  });

  it('one gate passed reads gate, not gates', () => {
    assert.equal(landLine(landView({ gates: [gate()] })), 'All 1 gate passed');
  });

  it('a failed task gate is named', () => {
    const gates = [gate({ kind: 'task', task: '2', outcome: 'failed', exitCode: 7 })];
    assert.equal(landLine(landView({ gates })), 'Task 2 failed');
  });

  it('no gates read as no gates recorded', () => {
    assert.equal(landLine(landView()), 'No gates recorded');
  });

  it('a sync stop wins over the gates', () => {
    const land = landView({
      gates: [gate()],
      lastSyncStop: {
        timestamp: '2026-02-02T00:00:00.000Z',
        reason: 'sync_conflict',
        message: 'merge conflict in src/a.ts',
      },
    });
    assert.equal(landLine(land), 'Sync stopped: merge conflict in src/a.ts');
  });

  it('a halt wins over the sync stop', () => {
    const land = landView({
      halt: { reason: 'verify_red', message: 'verify failed after sync' },
      lastSyncStop: {
        timestamp: '2026-02-02T00:00:00.000Z',
        reason: 'sync_conflict',
        message: 'other',
      },
    });
    assert.equal(landLine(land), 'Halted: verify failed after sync');
  });
});

describe('Landed line', () => {
  it('counts the tasks and the done tasks that passed first try', () => {
    const change = webChange({
      tasks: [
        webTask({ taskNumber: '1', title: 'One', state: 'done', attempts: 1 }),
        webTask({ taskNumber: '2', title: 'Two', state: 'done', attempts: 1 }),
        webTask({ taskNumber: '3', title: 'Three', state: 'done', attempts: 1 }),
        webTask({ taskNumber: '4', title: 'Four', state: 'done', attempts: 2 }),
      ],
    });
    assert.equal(landedLine(change), '4 tasks, 3 first try');
  });
});
