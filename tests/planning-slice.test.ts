import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { resolveChangeApprovalTime } from '../src/core/report/planning-observed.js';
import {
  type PlanningUsage,
  getPlanLogPath,
  parsePlanRecords,
} from '../src/core/report/planning-records.js';
import {
  type PlanningTurn,
  changeFolderForPath,
  sliceChangeOwnership,
} from '../src/core/report/planning-slice.js';

const BASE = Date.parse('2026-02-01T00:00:00.000Z');
const SESSION = 'observed:claude:s1';

function at(minutes: number): string {
  return new Date(BASE + minutes * 60_000).toISOString();
}

function edit(folder: string): string {
  return path.join(folder, 'tasks', '1.md');
}

interface TurnInit {
  readonly at: number;
  readonly edits?: readonly string[];
  readonly model?: string | null;
  readonly input?: number | null;
  readonly output?: number | null;
  readonly cacheRead?: number | null;
  readonly cacheWrite?: number | null;
  readonly reasoning?: number | null;
  readonly cost?: number | null;
}

function turn(init: TurnInit): PlanningTurn {
  return {
    timestamp: at(init.at),
    model: init.model ?? null,
    inputTokens: init.input ?? null,
    outputTokens: init.output ?? null,
    cacheReadTokens: init.cacheRead ?? null,
    cacheWriteTokens: init.cacheWrite ?? null,
    reasoningTokens: init.reasoning ?? null,
    cost: init.cost ?? null,
    edits: init.edits ?? [],
  };
}

function usage(init: Partial<PlanningUsage> = {}): PlanningUsage {
  return {
    inputTokens: init.inputTokens ?? null,
    outputTokens: init.outputTokens ?? null,
    cachedTokens: init.cachedTokens ?? null,
    reasoningTokens: init.reasoningTokens ?? null,
    cost: init.cost ?? null,
  };
}

interface SliceOptions {
  readonly approvedAt: string;
  readonly approvals?: ReadonlyMap<string, string>;
  readonly sessionCost?: number | null;
  readonly idleGapMinutes?: number;
  readonly prices?: Record<
    string,
    { input: number; output: number; cacheRead: number; cacheWrite: number }
  >;
}

async function sliceFor(
  changesDir: string,
  target: string,
  turns: readonly PlanningTurn[],
  options: SliceOptions,
) {
  return sliceChangeOwnership({
    changeFolder: target,
    changesDir,
    sessionId: SESSION,
    sessionDir: changesDir,
    approvedAt: options.approvedAt,
    turns,
    sessionCost: options.sessionCost ?? null,
    idleGapMinutes: options.idleGapMinutes ?? 10,
    ...(options.prices ? { prices: options.prices } : {}),
    resolveApproval: async (folder) => options.approvals?.get(folder) ?? null,
  });
}

function sliceRecord(approvedAt: string) {
  return {
    start: at(0),
    end: at(0),
    approvedAt,
    lastEditAt: at(0),
    turns: 1,
    activeMinutes: 0,
    tokens: { input: null, output: null, cacheRead: null, cacheWrite: null, reasoning: null },
    costSource: null,
  };
}

describe('planning turn attribution', () => {
  let changesDir = '';

  beforeEach(async () => {
    changesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-planning-slice-'));
    for (const name of ['001-a', '002-b', '003-c']) {
      await fs.mkdir(path.join(changesDir, name, 'tasks'), { recursive: true });
    }
  });
  afterEach(async () => {
    if (changesDir) await fs.rm(changesDir, { recursive: true, force: true });
    changesDir = '';
  });

  it('cuts three sequential changes into non-overlapping slices', async () => {
    const a = path.join(changesDir, '001-a');
    const b = path.join(changesDir, '002-b');
    const c = path.join(changesDir, '003-c');
    const turns = [
      turn({ at: 0, edits: [edit(a)] }),
      turn({ at: 2, edits: [edit(a)] }),
      turn({ at: 4, edits: [edit(b)] }),
      turn({ at: 6, edits: [edit(b)] }),
      turn({ at: 8, edits: [edit(c)] }),
    ];
    const approvals = new Map([
      [a, at(3)],
      [b, at(7)],
    ]);
    const sa = await sliceFor(changesDir, a, turns, { approvedAt: at(3), approvals });
    const sb = await sliceFor(changesDir, b, turns, { approvedAt: at(7), approvals });
    const sc = await sliceFor(changesDir, c, turns, { approvedAt: at(9), approvals });

    assert.deepEqual(
      sa?.ownedTurns.map((entry) => entry.timestamp),
      [at(0), at(2)],
    );
    assert.deepEqual(
      sb?.ownedTurns.map((entry) => entry.timestamp),
      [at(4), at(6)],
    );
    assert.deepEqual(
      sc?.ownedTurns.map((entry) => entry.timestamp),
      [at(8)],
    );
    assert.equal(sa?.slice.start, at(0));
    assert.equal(sa?.slice.end, at(2));
    assert.equal(sa?.slice.turns, 2);
    assert.equal(sa?.slice.approvedAt, at(3));
  });

  it('attributes every parallel turn exactly once', async () => {
    const a = path.join(changesDir, '001-a');
    const b = path.join(changesDir, '002-b');
    const turns = [
      turn({ at: 0, edits: [edit(a)] }),
      turn({ at: 1, edits: [edit(b)] }),
      turn({ at: 2, edits: [edit(a)] }),
      turn({ at: 3, edits: [edit(b)] }),
    ];
    const approvals = new Map([[a, at(5)]]);
    const sa = await sliceFor(changesDir, a, turns, { approvedAt: at(5), approvals });
    const sb = await sliceFor(changesDir, b, turns, { approvedAt: at(6), approvals });

    const ownedA = sa?.ownedTurns.map((entry) => entry.timestamp) ?? [];
    const ownedB = sb?.ownedTurns.map((entry) => entry.timestamp) ?? [];
    const union = [...ownedA, ...ownedB].sort();
    assert.deepEqual(union, [at(0), at(1), at(2), at(3)]);
    assert.equal(new Set(union).size, union.length);
  });

  it('gives discussion before the first edit to that change', async () => {
    const a = path.join(changesDir, '001-a');
    const turns = [turn({ at: 0 }), turn({ at: 1 }), turn({ at: 2, edits: [edit(a)] })];
    const result = await sliceFor(changesDir, a, turns, { approvedAt: at(3) });
    assert.deepEqual(
      result?.ownedTurns.map((entry) => entry.timestamp),
      [at(0), at(1), at(2)],
    );
    assert.equal(result?.slice.lastEditAt, at(2));
  });

  it('recognizes change folders under the changes directory or archive', () => {
    assert.equal(
      changeFolderForPath(changesDir, path.join(changesDir, '001-a', 'tasks', '1.md')),
      path.join(changesDir, '001-a'),
    );
    assert.equal(
      changeFolderForPath(changesDir, path.join(changesDir, 'archive', '001-a', 'tasks', '1.md')),
      path.join(changesDir, 'archive', '001-a'),
    );
    assert.equal(
      changeFolderForPath(changesDir, path.join(changesDir, 'rejected', '001-a', 'x.md')),
      null,
    );
    assert.equal(changeFolderForPath(changesDir, path.join(changesDir, 'queue.md')), null);
  });

  it('prefers a recorded slice approval over a later manifest approval', async () => {
    const a = path.join(changesDir, '001-a');
    await fs.mkdir(path.join(a, '.run'), { recursive: true });
    await fs.writeFile(
      getPlanLogPath(a),
      `${JSON.stringify({
        type: 'plan_exited',
        sessionId: SESSION,
        timestamp: at(3),
        data: { exitCode: null, wallSeconds: 0, usage: usage(), slice: sliceRecord(at(3)) },
      })}\n`,
      'utf8',
    );
    await fs.writeFile(
      path.join(a, '.run', 'manifest.json'),
      JSON.stringify({ approvedAt: at(9) }),
      'utf8',
    );

    assert.equal(await resolveChangeApprovalTime(a, SESSION), at(3));
    assert.equal(await resolveChangeApprovalTime(a, 'observed:claude:other'), at(9));
  });
});

describe('planning slice measures', () => {
  let changesDir = '';

  beforeEach(async () => {
    changesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-planning-slice-'));
    for (const name of ['001-a', '002-b']) {
      await fs.mkdir(path.join(changesDir, name, 'tasks'), { recursive: true });
    }
  });
  afterEach(async () => {
    if (changesDir) await fs.rm(changesDir, { recursive: true, force: true });
    changesDir = '';
  });

  it('sums token kinds and combines the cache split', async () => {
    const a = path.join(changesDir, '001-a');
    const turns = [
      turn({
        at: 0,
        edits: [edit(a)],
        input: 10,
        output: 5,
        cacheRead: 2,
        cacheWrite: 1,
        reasoning: 3,
      }),
      turn({ at: 1, edits: [edit(a)], input: 4, cacheWrite: 6 }),
    ];
    const result = await sliceFor(changesDir, a, turns, { approvedAt: at(2) });
    assert.deepEqual(result?.slice.tokens, {
      input: 14,
      output: 5,
      cacheRead: 2,
      cacheWrite: 7,
      reasoning: 3,
    });
    assert.equal(result?.usage.inputTokens, 14);
    assert.equal(result?.usage.cachedTokens, 9);
  });

  it('drops gaps longer than the idle gap from active minutes', async () => {
    const a = path.join(changesDir, '001-a');
    const turns = [
      turn({ at: 0, edits: [edit(a)] }),
      turn({ at: 2, edits: [edit(a)] }),
      turn({ at: 5, edits: [edit(a)] }),
      turn({ at: 30, edits: [edit(a)] }),
    ];
    const result = await sliceFor(changesDir, a, turns, { approvedAt: at(31), idleGapMinutes: 10 });
    assert.equal(result?.slice.activeMinutes, 5);
  });

  it('takes the per-turn harness sum when every owned turn reported a cost', async () => {
    const a = path.join(changesDir, '001-a');
    const turns = [
      turn({ at: 0, edits: [edit(a)], cost: 0.1 }),
      turn({ at: 1, edits: [edit(a)], cost: 0.2 }),
    ];
    const result = await sliceFor(changesDir, a, turns, { approvedAt: at(2) });
    assert.ok(Math.abs((result?.usage.cost ?? 0) - 0.3) <= 1e-9);
    assert.equal(result?.slice.costSource, 'harness');
  });

  it('takes the whole-session cost only when the slice holds every turn', async () => {
    const a = path.join(changesDir, '001-a');
    const complete = await sliceFor(changesDir, a, [turn({ at: 0, edits: [edit(a)] })], {
      approvedAt: at(2),
      sessionCost: 0.42,
    });
    assert.equal(complete?.usage.cost, 0.42);
    assert.equal(complete?.slice.costSource, 'harness');

    const b = path.join(changesDir, '002-b');
    const partialTurns = [turn({ at: 0, edits: [edit(a)] }), turn({ at: 1, edits: [edit(b)] })];
    const partial = await sliceFor(changesDir, a, partialTurns, {
      approvedAt: at(2),
      sessionCost: 0.42,
    });
    assert.equal(partial?.ownedTurns.length, 1);
    assert.equal(partial?.usage.cost, null);
    assert.equal(partial?.slice.costSource, null);
  });

  it('prices a slice only when every owned turn is priced with input and output', async () => {
    const a = path.join(changesDir, '001-a');
    const prices = { m: { input: 3, output: 6, cacheRead: 0, cacheWrite: 0 } };
    const result = await sliceFor(
      changesDir,
      a,
      [turn({ at: 0, edits: [edit(a)], model: 'm', input: 1_000_000, output: 0 })],
      { approvedAt: at(2), prices },
    );
    assert.equal(result?.usage.cost, 3);
    assert.equal(result?.slice.costSource, 'price_table');

    const unpriced = await sliceFor(
      changesDir,
      a,
      [turn({ at: 0, edits: [edit(a)], model: 'other', input: 1_000_000, output: 0 })],
      { approvedAt: at(2), prices },
    );
    assert.equal(unpriced?.usage.cost, null);
    assert.equal(unpriced?.slice.costSource, null);
  });

  it('reads a valid slice and leaves a malformed one absent', () => {
    const valid = JSON.stringify({
      type: 'plan_exited',
      sessionId: 's',
      timestamp: at(1),
      data: { exitCode: null, wallSeconds: 0, usage: usage(), slice: sliceRecord(at(1)) },
    });
    const malformed = JSON.stringify({
      type: 'plan_exited',
      sessionId: 's2',
      timestamp: at(2),
      data: { exitCode: null, wallSeconds: 0, usage: usage(), slice: { start: 1 } },
    });
    const records = parsePlanRecords(`${valid}\n${malformed}`);
    assert.equal(records.length, 2);
    assert.equal(records[0].type === 'plan_exited' && records[0].data.slice?.approvedAt, at(1));
    assert.equal(records[1].type === 'plan_exited' && records[1].data.slice, undefined);
  });
});
