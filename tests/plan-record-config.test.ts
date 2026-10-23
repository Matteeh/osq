import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { buildOpeningPrompt } from '../src/cli/plan.js';
import { DEFAULT_PLANNING_RECORD } from '../src/core/foundation/config-planning.js';
import { defineConfig, loadConfig } from '../src/core/foundation/config.js';

const RECORD_HEADING = "## This repository's record";
const BASE_MS = Date.UTC(2026, 8, 1, 0, 0, 0);

const iso = (sec: number): string => new Date(BASE_MS + sec * 1000).toISOString();

const mStart = (sec: number, scopeFiles: number): Record<string, unknown> => ({
  type: 'measures',
  timestamp: iso(sec),
  data: { phase: 'start', scopeFiles },
});
const mEnd = (sec: number, scopeFiles: number): Record<string, unknown> => ({
  type: 'measures',
  timestamp: iso(sec),
  data: { phase: 'end', scopeFiles },
});
const started = (sec: number): Record<string, unknown> => ({
  type: 'started',
  timestamp: iso(sec),
  data: { tier: 'coding', taskTitle: 'x', scope: [], entry: [], skills: [] },
});
const done = (sec: number): Record<string, unknown> => ({
  type: 'done',
  timestamp: iso(sec),
  data: { task: '1' },
});
const dead = (sec: number, reason: string): Record<string, unknown> => ({
  type: 'dead',
  timestamp: iso(sec),
  data: { task: '1', reason },
});

interface TaskSpec {
  readonly title: string;
  readonly events: readonly Record<string, unknown>[];
}

function taskMd(title: string): string {
  return `---
title: ${title}
verify: node -e "process.exit(0)"
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] criterion
`;
}

/** Writes one canonical archived change folder with numbered task files/events. */
async function writeArchivedChange(
  root: string,
  folder: string,
  tasks: readonly TaskSpec[],
): Promise<void> {
  const folderPath = path.join(root, 'openspec', 'changes', 'archive', folder);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(folderPath, 'proposal.md'),
    `---\ntitle: ${folder}\ndepends_on: []\nfeatures:\n  reads: []\n  writes: []\n---\n## Goal\n\nFixture change.\n`,
    'utf8',
  );
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const taskNumber = String(i + 1);
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${taskNumber}.md`),
      taskMd(task.title),
      'utf8',
    );
    await fs.mkdir(path.join(folderPath, '.run', 'events'), { recursive: true });
    await fs.writeFile(
      path.join(folderPath, '.run', 'events', `${taskNumber}.jsonl`),
      `${task.events.map((event) => JSON.stringify(event)).join('\n')}\n`,
      'utf8',
    );
  }
}

/** The measured tasks of one archived change, each ending in a typed outcome. */
function measuredTasks(
  prefix: string,
  count: number,
  outcome: (sec: number) => Record<string, unknown>,
): TaskSpec[] {
  return Array.from({ length: count }, (_, index) => ({
    title: `${prefix} ${index + 1}`,
    events: [mStart(0, 1), started(1), mEnd(2, 1), outcome(3)],
  }));
}

/** Writes three archived changes, each with one measured task that died. */
async function writeThreeDeadChanges(root: string): Promise<void> {
  await writeArchivedChange(root, '001-oldest', [
    { title: 'Oldest task', events: [mStart(0, 1), started(1), mEnd(2, 1), dead(3, 'timeout')] },
  ]);
  await writeArchivedChange(root, '002-middle', [
    {
      title: 'Middle task',
      events: [mStart(10, 1), started(11), mEnd(12, 1), dead(13, 'timeout')],
    },
  ]);
  await writeArchivedChange(root, '003-newest', [
    {
      title: 'Newest task',
      events: [mStart(20, 1), started(21), mEnd(22, 1), dead(23, 'timeout')],
    },
  ]);
}

/** The record body, cut before the next prompt section heading. */
function recordSection(prompt: string): string {
  const index = prompt.indexOf(RECORD_HEADING);
  assert.notEqual(index, -1, 'prompt must contain the repository record heading');
  const bodyStart = index + RECORD_HEADING.length;
  const next = prompt.indexOf('\n## ', bodyStart);
  return (next === -1 ? prompt.slice(bodyStart) : prompt.slice(bodyStart, next)).trim();
}

/** The lines after the `Dead outcomes:` label. */
function deadLines(body: string): string[] {
  const lines = body.split('\n');
  const index = lines.indexOf('Dead outcomes:');
  assert.notEqual(index, -1, body);
  return lines.slice(index + 1);
}

describe('plan record configuration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-record-config-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function openingPrompt(config: Awaited<ReturnType<typeof loadConfig>>): Promise<string> {
    return await buildOpeningPrompt({
      projectRoot: tmpDir,
      folderPath: path.join(tmpDir, 'openspec', 'changes', '001-probe'),
      specId: '001',
      specTitle: 'Probe',
      briefContent: '# Probe\n',
      openspecRoot: config.paths.openspecRoot,
      config,
    });
  }

  it('defaults the record sizes and prints the too-small sentence below five measured tasks', async () => {
    await writeArchivedChange(tmpDir, '001-four', measuredTasks('Task', 4, done));

    const config = await loadConfig(tmpDir);
    assert.deepEqual(config.planning?.record, DEFAULT_PLANNING_RECORD);
    assert.deepEqual(config.planning?.record, {
      minimumTasks: 5,
      recentChanges: 20,
      deadOutcomes: 10,
    });

    const body = recordSection(await openingPrompt(config));
    assert.equal(body, "This repository's measured record is too small (fewer than 5 tasks).");
  });

  it('uses a configured minimumTasks of six', async () => {
    await writeArchivedChange(tmpDir, '001-five', measuredTasks('Task', 5, done));
    const config = defineConfig({ planning: { record: { minimumTasks: 6 } } } as never);

    const body = recordSection(await openingPrompt(config));
    assert.equal(body, "This repository's measured record is too small (fewer than 6 tasks).");
  });

  it('uses a configured recentChanges window of two', async () => {
    await writeThreeDeadChanges(tmpDir);
    const config = defineConfig({
      planning: { record: { minimumTasks: 1, recentChanges: 2 } },
    } as never);

    const body = recordSection(await openingPrompt(config));
    assert.equal(body.split('\n')[0], 'First-attempt passes: 0/2');
    assert.deepEqual(deadLines(body), [
      '- 003-newest, Newest task, timeout',
      '- 002-middle, Middle task, timeout',
    ]);
  });

  it('uses a configured deadOutcomes count of one', async () => {
    await writeThreeDeadChanges(tmpDir);
    const config = defineConfig({
      planning: { record: { minimumTasks: 1, deadOutcomes: 1 } },
    } as never);

    const body = recordSection(await openingPrompt(config));
    assert.equal(body.split('\n')[0], 'First-attempt passes: 0/3');
    assert.deepEqual(deadLines(body), ['- 003-newest, Newest task, timeout']);
  });

  it('refuses zero, negative and fractional values for every record key', async () => {
    for (const key of ['minimumTasks', 'recentChanges', 'deadOutcomes'] as const) {
      for (const value of [0, -1, 1.5]) {
        await fs.writeFile(
          path.join(tmpDir, 'osq.config.ts'),
          `export default { planning: { record: { ${key}: ${JSON.stringify(value)} } } };\n`,
          'utf8',
        );
        await assert.rejects(
          loadConfig(tmpDir),
          new RegExp(`planning\\.record\\.${key} must be a positive integer`),
          `expected rejection for ${key}=${String(value)}`,
        );
      }
    }
  });
});
