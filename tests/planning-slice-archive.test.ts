import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { resolveChangeApprovalTime } from '../src/core/report/planning-observed.js';
import { type PlanningUsage, getPlanLogPath } from '../src/core/report/planning-records.js';
import { type PlanningTurn, sliceChangeOwnership } from '../src/core/report/planning-slice.js';

const BASE = Date.parse('2026-02-01T00:00:00.000Z');
const SESSION = 'observed:claude:s1';
const EARLIER = '063-earlier-change';
const LATER = '064-later-change';

function at(minutes: number): string {
  return new Date(BASE + minutes * 60_000).toISOString();
}

function edit(folder: string): string {
  return path.join(folder, 'tasks', '1.md');
}

interface TurnInit {
  readonly at: number;
  readonly edits?: readonly string[];
}

function turn(init: TurnInit): PlanningTurn {
  return {
    timestamp: at(init.at),
    model: null,
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    reasoningTokens: null,
    cost: null,
    edits: init.edits ?? [],
  };
}

function usage(): PlanningUsage {
  return {
    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
    reasoningTokens: null,
    cost: null,
  };
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

async function writeSlice(folder: string, approvedAt: string): Promise<void> {
  await fs.mkdir(path.join(folder, '.run'), { recursive: true });
  await fs.writeFile(
    getPlanLogPath(folder),
    `${JSON.stringify({
      type: 'plan_exited',
      sessionId: SESSION,
      timestamp: approvedAt,
      data: { exitCode: null, wallSeconds: 0, usage: usage(), slice: sliceRecord(approvedAt) },
    })}\n`,
    'utf8',
  );
}

async function writeManifest(folder: string, approvedAt: string): Promise<void> {
  await fs.mkdir(path.join(folder, '.run'), { recursive: true });
  await fs.writeFile(
    path.join(folder, '.run', 'manifest.json'),
    JSON.stringify({ approvedAt }),
    'utf8',
  );
  await fs.writeFile(path.join(folder, '.run', 'approved'), 'sha256:sealed\n', 'utf8');
}

async function writeRejectedMarker(folder: string, timestamp: string): Promise<void> {
  await fs.mkdir(path.join(folder, '.run'), { recursive: true });
  await fs.writeFile(
    path.join(folder, '.run', 'rejected.md'),
    `---\nreason: "stop"\ntimestamp: ${JSON.stringify(timestamp)}\n---\n`,
    'utf8',
  );
}

describe('planning approval lookup after archive and rejection', () => {
  let changesDir = '';
  let earlier = '';
  let later = '';

  beforeEach(async () => {
    changesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-slice-archive-'));
    earlier = path.join(changesDir, EARLIER);
    later = path.join(changesDir, LATER);
    await fs.mkdir(path.join(earlier, 'tasks'), { recursive: true });
    await fs.mkdir(path.join(later, 'tasks'), { recursive: true });
    await writeManifest(later, at(40));
    await writeSlice(earlier, at(11));
  });
  afterEach(async () => {
    if (changesDir) await fs.rm(changesDir, { recursive: true, force: true });
    changesDir = '';
  });

  /** One edit of 063 at 10:00, edits of 064 at 10:30, talk in between. */
  function sessionTurns(): PlanningTurn[] {
    return [
      turn({ at: 0, edits: [edit(earlier)] }),
      turn({ at: 5 }),
      turn({ at: 10 }),
      turn({ at: 20 }),
      turn({ at: 30, edits: [edit(later)] }),
    ];
  }

  async function slice(target: string, approvedAt: string, turns = sessionTurns()) {
    const cache = new Map<string, string | null>();
    return sliceChangeOwnership({
      changeFolder: target,
      changesDir,
      sessionId: SESSION,
      sessionDir: changesDir,
      approvedAt,
      turns,
      sessionCost: null,
      idleGapMinutes: 10,
      resolveApproval: (folder, id) => resolveChangeApprovalTime(folder, id, cache),
    });
  }

  async function archive(): Promise<string> {
    const archiveDir = path.join(changesDir, 'archive');
    await fs.mkdir(archiveDir, { recursive: true });
    const destination = path.join(archiveDir, EARLIER);
    await fs.rename(earlier, destination);
    return archiveDir;
  }

  it('splits the session with the earlier change still active', async () => {
    const laterSlice = await slice(later, at(40));
    assert.deepEqual(
      laterSlice?.ownedTurns.map((entry) => entry.timestamp),
      [at(20), at(30)],
    );

    const earlierSlice = await slice(earlier, at(11));
    assert.deepEqual(
      earlierSlice?.ownedTurns.map((entry) => entry.timestamp),
      [at(0), at(5), at(10)],
    );

    const owned = new Set([
      ...(laterSlice?.ownedTurns.map((entry) => entry.timestamp) ?? []),
      ...(earlierSlice?.ownedTurns.map((entry) => entry.timestamp) ?? []),
    ]);
    assert.equal(owned.size, 5);
  });

  it('keeps the boundary when the earlier change moves to archive', async () => {
    await archive();
    const laterSlice = await slice(later, at(40));
    assert.deepEqual(
      laterSlice?.ownedTurns.map((entry) => entry.timestamp),
      [at(20), at(30)],
    );
  });

  it('keeps the boundary when archived under a collision suffix', async () => {
    const archiveDir = path.join(changesDir, 'archive');
    const unrelated = path.join(archiveDir, EARLIER);
    await fs.mkdir(path.join(unrelated, 'tasks'), { recursive: true });
    await writeManifest(unrelated, at(50));
    await fs.rename(earlier, path.join(archiveDir, `${EARLIER}-1`));

    const laterSlice = await slice(later, at(40));
    assert.deepEqual(
      laterSlice?.ownedTurns.map((entry) => entry.timestamp),
      [at(20), at(30)],
    );
  });

  it('closes the earlier segment at its rejection when no slice was recorded', async () => {
    await fs.rm(earlier, { recursive: true, force: true });
    const rejected = path.join(changesDir, 'rejected', EARLIER);
    await fs.mkdir(path.join(rejected, 'tasks'), { recursive: true });
    await writeRejectedMarker(rejected, at(11));

    const laterSlice = await slice(later, at(40));
    assert.deepEqual(
      laterSlice?.ownedTurns.map((entry) => entry.timestamp),
      [at(20), at(30)],
    );
  });
});
