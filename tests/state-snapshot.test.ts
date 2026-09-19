import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type SpecData, parseSpecMd } from '../src/core/parser.js';
import { type ChangeFolderSnapshot, deriveSpecState } from '../src/core/state.js';

function taskFile(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'verify: node -e "process.exit(0)"',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] passes',
    '',
  ].join('\n');
}

function baseSnapshot(overrides: Partial<ChangeFolderSnapshot> = {}): ChangeFolderSnapshot {
  const spec: SpecData = parseSpecMd(
    ['---', 'title: Snapshot Spec', 'depends_on: []', '---', '## Goal', 'prove purity', ''].join(
      '\n',
    ),
  );
  return {
    folderName: '001-snapshot',
    folderPath: '/does/not/exist/001-snapshot',
    spec,
    approvedHash: 'sha256:abc123',
    taskFiles: new Map([['1.md', taskFile('Task one')]]),
    doneMarkers: new Set<string>(),
    deadMarkers: new Map<string, string>(),
    regressedMarkers: new Map<string, string>(),
    runningPids: new Map<string, string>(),
    resultFiles: new Set<string>(),
    unmetDependencies: new Set<string>(),
    ...overrides,
  };
}

describe('deriveSpecState from in-memory snapshots', () => {
  it('derives an unapproved spec when no approval hash is present', () => {
    const state = deriveSpecState(baseSnapshot({ approvedHash: null }));
    assert.equal(state.status, 'unapproved');
    assert.equal(state.approvedHash, null);
  });

  it('derives a ready (pending) spec with a next task from pure data', () => {
    const state = deriveSpecState(baseSnapshot());
    assert.equal(state.status, 'pending');
    assert.ok(state.nextTask);
    assert.equal(state.nextTask.taskNumber, '1');
    assert.equal(state.tasks[0].status, 'pending');
    assert.equal(state.title, 'Snapshot Spec');
  });

  it('is synchronous and never returns a promise', () => {
    const state = deriveSpecState(baseSnapshot());
    assert.ok(!(state instanceof Promise), 'deriveSpecState must not be async');
    assert.equal(typeof (state as { then?: unknown }).then, 'undefined');
  });

  it('derives a running spec from the running pid map', () => {
    const state = deriveSpecState(baseSnapshot({ runningPids: new Map([['1', '4242']]) }));
    assert.equal(state.status, 'running');
    assert.equal(state.tasks[0].status, 'running');
  });

  it('derives a done spec from the done marker set', () => {
    const state = deriveSpecState(baseSnapshot({ doneMarkers: new Set(['1']) }));
    assert.equal(state.status, 'done');
    assert.equal(state.tasks[0].status, 'done');
    assert.equal(state.nextTask, null);
  });

  it('derives a dead spec and surfaces the dead reason', () => {
    const state = deriveSpecState(
      baseSnapshot({
        deadMarkers: new Map([['1', '---\nreason: verify_red\n---\nfailed\n']]),
      }),
    );
    assert.equal(state.status, 'dead');
    assert.equal(state.tasks[0].status, 'dead');
    assert.equal(state.tasks[0].deadReason, 'verify_red');
  });

  it('resolves a conflicted task in favor of completion', () => {
    const state = deriveSpecState(
      baseSnapshot({
        doneMarkers: new Set(['1']),
        runningPids: new Map([['1', '4242']]),
      }),
    );
    assert.equal(state.tasks[0].status, 'done');
    assert.equal(state.status, 'done');
  });

  it('reports dead when a conflicted spec mixes done and dead tasks', () => {
    const state = deriveSpecState(
      baseSnapshot({
        taskFiles: new Map([
          ['1.md', taskFile('Task one')],
          ['2.md', taskFile('Task two')],
        ]),
        doneMarkers: new Set(['1']),
        deadMarkers: new Map([['2', '---\nreason: timeout\n---\n']]),
      }),
    );
    assert.equal(state.status, 'dead');
    assert.equal(state.tasks[0].status, 'done');
    assert.equal(state.tasks[1].status, 'dead');
  });

  it('derives a blocked spec from unmet dependencies without touching disk', () => {
    const state = deriveSpecState(baseSnapshot({ unmetDependencies: new Set(['022']) }));
    assert.equal(state.status, 'blocked');
    assert.equal(state.nextTask, null);
  });

  it('derives a regressed task and spec from a regressed marker', () => {
    const state = deriveSpecState(
      baseSnapshot({
        regressedMarkers: new Map([['1', '---\nreason: scope_regression\n---\n']]),
      }),
    );
    assert.equal(state.tasks[0].status, 'regressed');
    assert.equal(state.status, 'regressed');
    assert.equal(state.nextTask, null);
  });

  it('prefers a regressed marker over a stale done marker', () => {
    const state = deriveSpecState(
      baseSnapshot({
        doneMarkers: new Set(['1']),
        regressedMarkers: new Map([['1', '---\nreason: verify_regression\n---\n']]),
      }),
    );
    assert.equal(state.tasks[0].status, 'regressed');
    assert.equal(state.status, 'regressed');
  });

  it('derives a regressed spec from a change-level regressed marker', () => {
    const state = deriveSpecState(
      baseSnapshot({
        doneMarkers: new Set(['1']),
        regressedMarkers: new Map([['change', '---\nreason: verify_regression\n---\n']]),
      }),
    );
    assert.equal(state.status, 'regressed');
    assert.equal(state.tasks[0].status, 'done');
  });

  it('ignores regressed markers that match no task or the change', () => {
    const state = deriveSpecState(
      baseSnapshot({ regressedMarkers: new Map([['9', '---\nreason: scope_regression\n---\n']]) }),
    );
    assert.equal(state.tasks[0].status, 'pending');
    assert.equal(state.status, 'pending');
  });
});
