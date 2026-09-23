import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { type PlanningTurn, observedSessionId } from '../src/core/report/planning-observed.js';
import { type PlanRecord, readPlanRecords } from '../src/core/report/planning-records.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { createChange, createProject, restoreEnv } from './planning-observed-helpers.js';

const BASE = Date.parse('2030-03-01T00:00:00.000Z');
const SESSION = observedSessionId('claude', 'slices-session');

function iso(offsetMs: number): string {
  return new Date(BASE + offsetMs).toISOString();
}

function turn(offsetMs: number, target: string): PlanningTurn {
  return {
    timestamp: iso(offsetMs),
    model: 'claude-test',
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 2,
    cacheWriteTokens: 1,
    reasoningTokens: 3,
    cost: 0.1,
    edits: [path.join(target, 'tasks', '1.md')],
  };
}

function session(turns: readonly PlanningTurn[]) {
  return {
    harness: 'claude',
    nativeSessionId: 'slices-session',
    sessionDir: null,
    model: 'claude-test',
    turns,
  };
}

function reader(turns: readonly PlanningTurn[]) {
  return () => Promise.resolve([session(turns)]);
}

function exitSlice(records: readonly PlanRecord[]) {
  const exit = records.find((record) => record.type === 'plan_exited');
  return exit?.type === 'plan_exited' ? exit.data.slice : undefined;
}

describe('approval-time planning slices', () => {
  let root = '';

  beforeEach(() => restoreEnv());
  afterEach(async () => {
    restoreEnv();
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  it('cuts one session across three changes at each approval', async () => {
    root = await createProject();
    const a = await createChange(root, 'Alpha');
    const b = await createChange(root, 'Beta');
    const c = await createChange(root, 'Gamma');
    for (const change of [a, b, c]) {
      await fs.mkdir(path.join(change.folderPath, '.run'), { recursive: true });
      await fs.writeFile(
        path.join(change.folderPath, '.run', 'manifest.json'),
        JSON.stringify({ createdAt: iso(-60_000) }),
        'utf8',
      );
    }

    const aTurns = [turn(0, a.folderPath), turn(60_000, a.folderPath)];
    const bTurns = [turn(180_000, b.folderPath), turn(240_000, b.folderPath)];
    const cTurns = [turn(360_000, c.folderPath)];

    const first = await approveSpec(root, a.specId, DEFAULT_CONFIG, {
      planningReaders: [reader(aTurns)],
      now: new Date(BASE + 120_000),
    });
    assert.equal(first.planningMatches, 1);

    const second = await approveSpec(root, b.specId, DEFAULT_CONFIG, {
      planningReaders: [reader([...aTurns, ...bTurns])],
      now: new Date(BASE + 300_000),
    });
    assert.equal(second.planningMatches, 1);

    const third = await approveSpec(root, c.specId, DEFAULT_CONFIG, {
      planningReaders: [reader([...aTurns, ...bTurns, ...cTurns])],
      now: new Date(BASE + 420_000),
    });
    assert.equal(third.planningMatches, 1);

    const aRecords = await readPlanRecords(a.folderPath);
    const bRecords = await readPlanRecords(b.folderPath);
    const cRecords = await readPlanRecords(c.folderPath);
    assert.equal(aRecords.length, 2);
    assert.equal(bRecords.length, 2);
    assert.equal(cRecords.length, 2);

    const aSlice = exitSlice(aRecords);
    const bSlice = exitSlice(bRecords);
    const cSlice = exitSlice(cRecords);
    assert.equal(aSlice?.turns, 2);
    assert.equal(aSlice?.start, iso(0));
    assert.equal(aSlice?.end, iso(60_000));
    assert.equal(aSlice?.tokens.input, 20);
    assert.equal(aSlice?.costSource, 'harness');
    assert.equal(bSlice?.turns, 2);
    assert.equal(bSlice?.start, iso(180_000));
    assert.equal(bSlice?.end, iso(240_000));
    assert.equal(cSlice?.turns, 1);
    assert.equal(cSlice?.start, iso(360_000));

    // Recorded pairs carry the slice and the session identity.
    const exited = aRecords.find((record) => record.type === 'plan_exited');
    assert.equal(exited?.sessionId, SESSION);
    assert.equal(exited?.type === 'plan_exited' && exited.data.usage.cost, 0.2);
  });
});
