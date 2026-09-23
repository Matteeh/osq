import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveCommand } from '../src/cli/approve.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import {
  appendObservedSessions,
  findPlanningSessions,
  observedSessionId,
  resolveChangeCreationTime,
} from '../src/core/report/planning-observed.js';
import {
  NULL_PLANNING_USAGE,
  getPlanLogPath,
  planningRecordSource,
  readPlanRecords,
  recordPlanStarted,
} from '../src/core/report/planning.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { readClaudePlanningSessions } from '../src/harness/claude/claude-usage.js';
import {
  CLAUDE_FIXTURE_DIR,
  candidate,
  captureLogs,
  createChange,
  createProject,
  editTurn,
  readManifest,
  renderTree,
  restoreEnv,
} from './planning-observed-helpers.js';

function sliceFor(start: string, end: string) {
  return {
    start,
    end,
    approvedAt: end,
    lastEditAt: start,
    turns: 1,
    activeMinutes: 0,
    tokens: { input: null, output: null, cacheRead: null, cacheWrite: null, reasoning: null },
    costSource: null,
  };
}

describe('approval-time observation', () => {
  let root = '';

  beforeEach(() => {
    restoreEnv();
  });
  afterEach(async () => {
    restoreEnv();
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  it('appends one observed pair, preserves usage/model, and never duplicates', async () => {
    root = await createProject();
    const change = await createChange(root, 'Observed Claude');
    const now = Date.now();
    const createdMs = now - 120000;
    const createdAt = new Date(createdMs).toISOString();
    // Keep the persisted creation time stable across reapproval: the manifest
    // `createdAt` is derived from the change document's modification time.
    await fs.utimes(
      path.join(change.folderPath, 'proposal.md'),
      new Date(createdMs),
      new Date(createdMs),
    );
    await fs.mkdir(path.join(change.folderPath, '.run'), { recursive: true });
    await fs.writeFile(
      path.join(change.folderPath, '.run', 'manifest.json'),
      JSON.stringify({ createdAt }),
      'utf8',
    );

    const projectsDir = path.join(root, 'claude-projects');
    await renderTree(CLAUDE_FIXTURE_DIR, projectsDir, {
      CWD: change.folderPath,
      INSIDE_PATH: 'tasks/1.md',
      OUTSIDE_PATH: '../999-other/file.md',
      NOW_ISO: new Date(now - 30000).toISOString(),
      START_MS: now - 42000,
    });
    const reader = () => readClaudePlanningSessions(projectsDir);

    const first = await approveSpec(root, change.specId, DEFAULT_CONFIG, {
      planningReaders: [reader],
      now: new Date(now),
    });
    assert.equal(first.planningMatches, 1);

    const records = await readPlanRecords(change.folderPath);
    assert.equal(records.length, 2);
    const started = records[0];
    const exited = records[1];
    assert.equal(started.type, 'plan_started');
    assert.equal(started.source, 'observed');
    assert.equal(planningRecordSource(started), 'observed');
    assert.equal(started.type === 'plan_started' && started.data.model, 'claude-x');
    assert.equal(exited.type, 'plan_exited');
    assert.equal(exited.type === 'plan_exited' && exited.data.exitCode, null);
    if (started.type === 'plan_started' && exited.type === 'plan_exited') {
      assert.equal(started.sessionId, exited.sessionId);
      assert.equal(started.sessionId, observedSessionId('claude', 'claude-session-inside'));
      // Task 4 stops reading cost-state counters as turn usage, so the slice
      // cost survives while the exact token counts no longer do.
      assert.equal(exited.data.usage.cost, 0.42);
    }

    const manifest = await readManifest(change.folderPath);
    assert.equal(manifest.planningSessions, 1);
    assert.equal(manifest.planner, 'claude-x');

    const second = await approveSpec(root, change.specId, DEFAULT_CONFIG, {
      planningReaders: [reader],
      now: new Date(now + 1000),
    });
    assert.equal(second.planningMatches, 1);
    assert.equal((await readPlanRecords(change.folderPath)).length, 2);
    assert.equal((await readManifest(change.folderPath)).planningSessions, 1);
  });

  it('records no observed pair and leaves planner null when nothing matches', async () => {
    root = await createProject();
    const change = await createChange(root, 'No Observed');
    const result = await approveSpec(root, change.specId, DEFAULT_CONFIG, {
      planningReaders: [],
      now: new Date(),
    });
    assert.equal(result.planningMatches, 0);
    assert.deepEqual(await readPlanRecords(change.folderPath), []);
    const manifest = await readManifest(change.folderPath);
    assert.equal(manifest.planningSessions, 0);
    assert.equal(manifest.planner, null);
  });

  it('attributes the newest observed model then the newest owned model, never config', async () => {
    root = await createProject();
    const change = await createChange(root, 'Attribution');
    const briefPath = path.join(change.folderPath, 'brief.md');
    await fs.writeFile(briefPath, '# brief\n', 'utf8');

    // Config alone never populates attribution.
    await approveSpec(root, change.specId, DEFAULT_CONFIG, { planningReaders: [] });
    assert.equal((await readManifest(change.folderPath)).planner, null);

    // An owned record supplies the fallback.
    await recordPlanStarted(change.folderPath, {
      harness: 'mock',
      model: 'owned-model',
      briefPath,
    });
    await approveSpec(root, change.specId, DEFAULT_CONFIG, { planningReaders: [] });
    assert.equal((await readManifest(change.folderPath)).planner, 'owned-model');

    // A newer observed model wins over the owned model.
    await appendObservedSessions(
      change.folderPath,
      [
        {
          harness: 'claude',
          nativeSessionId: 'winner',
          sessionId: observedSessionId('claude', 'winner'),
          model: 'observed-model',
          startedAt: '2030-01-01T00:00:00.000Z',
          endedAt: '2030-01-01T00:01:00.000Z',
          usage: NULL_PLANNING_USAGE,
          slice: sliceFor('2030-01-01T00:00:00.000Z', '2030-01-01T00:01:00.000Z'),
        },
      ],
      { briefHash: 'sha256:brief', osqVersion: '1.0.0' },
    );
    await approveSpec(root, change.specId, DEFAULT_CONFIG, { planningReaders: [] });
    const manifest = await readManifest(change.folderPath);
    assert.equal(manifest.planner, 'observed-model');
    assert.equal(manifest.planningSessions, 2);
  });

  it('prefers a persisted creation time and rejects edits before it', async () => {
    root = await createProject();
    const change = await createChange(root, 'Window');
    const now = Date.now();
    await fs.mkdir(path.join(change.folderPath, '.run'), { recursive: true });
    await fs.writeFile(
      path.join(change.folderPath, '.run', 'manifest.json'),
      JSON.stringify({ createdAt: new Date(now).toISOString() }),
      'utf8',
    );
    const createdAt = await resolveChangeCreationTime(change.folderPath);
    assert.equal(createdAt, new Date(now).toISOString());

    const before = await findPlanningSessions(change.folderPath, {
      createdAt,
      observedAt: new Date(now + 60000).toISOString(),
      readers: [
        () =>
          Promise.resolve([
            candidate({
              sessionDir: change.folderPath,
              turns: [editTurn('tasks/1.md', new Date(now - 1000).toISOString())],
            }),
          ]),
      ],
    });
    assert.deepEqual(before, []);
  });

  it('appends deterministically without re-reading a duplicate native session', async () => {
    root = await createProject();
    const change = await createChange(root, 'Idempotent');
    const observation = {
      harness: 'codex',
      nativeSessionId: 'native-z',
      sessionId: observedSessionId('codex', 'native-z'),
      model: null,
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T00:00:30.000Z',
      usage: NULL_PLANNING_USAGE,
      slice: sliceFor('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:30.000Z'),
    };
    assert.equal(
      await appendObservedSessions(change.folderPath, [observation], {
        briefHash: 'sha256:b',
        osqVersion: '1.0.0',
      }),
      1,
    );
    assert.equal(
      await appendObservedSessions(change.folderPath, [observation], {
        briefHash: 'sha256:b',
        osqVersion: '1.0.0',
      }),
      0,
    );
    const records = await readPlanRecords(change.folderPath);
    assert.equal(records.length, 2);
    const exited = records[1];
    assert.equal(exited.type === 'plan_exited' && exited.data.wallSeconds, 30);
    assert.equal(exited.type === 'plan_exited' && exited.data.exitCode, null);
  });
});

describe('approve command planning notice', () => {
  let root = '';

  beforeEach(() => {
    restoreEnv();
  });
  afterEach(async () => {
    restoreEnv();
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  it('prints exactly one no-record notice when no observed session matches', async () => {
    root = await createProject();
    const change = await createChange(root, 'No Log');
    const lines = await captureLogs(() =>
      approveCommand([change.specId], {
        cwd: root,
        config: DEFAULT_CONFIG,
        planningReaders: [],
        now: new Date(),
      }),
    );
    const notices = lines.filter((line) => line.startsWith('No planning record found for'));
    assert.deepEqual(notices, [`No planning record found for ${change.specId}.`]);
    assert.ok(lines.some((line) => line.startsWith('Approved ')));
  });

  it('prints no notice when a session matches', async () => {
    root = await createProject();
    const change = await createChange(root, 'Log Found');
    const now = Date.now();
    await fs.mkdir(path.join(change.folderPath, '.run'), { recursive: true });
    await fs.writeFile(
      path.join(change.folderPath, '.run', 'manifest.json'),
      JSON.stringify({ createdAt: new Date(now - 60000).toISOString() }),
      'utf8',
    );
    const reader = () =>
      Promise.resolve([
        candidate({
          harness: 'claude',
          sessionDir: change.folderPath,
          nativeSessionId: 'matched',
          turns: [editTurn('tasks/1.md', new Date(now - 30000).toISOString())],
        }),
      ]);
    const lines = await captureLogs(() =>
      approveCommand([change.specId], {
        cwd: root,
        config: DEFAULT_CONFIG,
        planningReaders: [reader],
        now: new Date(now),
      }),
    );
    assert.equal(
      lines.some((line) => line.startsWith('No planning record found for')),
      false,
    );
    assert.equal((await readPlanRecords(change.folderPath)).length, 2);
  });

  it('supplies the default readers and still approves with empty local stores', async () => {
    root = await createProject();
    const change = await createChange(root, 'Default Readers');
    process.env.CODEX_HOME = path.join(root, 'empty-codex');
    process.env.OSQ_CLAUDE_PROJECTS_DIR = path.join(root, 'empty-claude');
    process.env.OPENCODE_PATH = path.join(root, 'missing-opencode');
    const lines = await captureLogs(() =>
      approveCommand([change.specId], {
        cwd: root,
        config: DEFAULT_CONFIG,
        now: new Date(),
      }),
    );
    assert.ok(lines.some((line) => line.startsWith('Approved ')));
    assert.deepEqual(
      lines.filter((line) => line.startsWith('No planning record found for')),
      [`No planning record found for ${change.specId}.`],
    );
  });

  it('does not write approval artifacts when lint fails', async () => {
    root = await createProject();
    const change = await createChange(root, 'Broken');
    await fs.writeFile(
      path.join(change.folderPath, 'tasks', '1.md'),
      `---
title: Broken
verify: pnpm test && pnpm lint
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] fails`,
      'utf8',
    );
    await assert.rejects(
      () =>
        approveSpec(root, change.specId, DEFAULT_CONFIG, {
          planningReaders: [() => Promise.resolve([candidate()])],
        }),
      /Lint failed/,
    );
    assert.deepEqual(await readPlanRecords(change.folderPath), []);
    await assert.rejects(fs.stat(path.join(change.folderPath, '.run', 'approved')));
    await assert.rejects(fs.stat(getPlanLogPath(change.folderPath)));
  });
});
