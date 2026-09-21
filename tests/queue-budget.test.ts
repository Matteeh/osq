import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { planCommand } from '../src/cli/plan.js';
import { queueCommand } from '../src/cli/queue.js';
import { type OsqConfig, defineConfig } from '../src/core/config.js';
import {
  type QueuePlanningUsage,
  evaluateQueueBudget,
  prepareQueuePlan,
  readQueuePlanningUsage,
} from '../src/core/queue.js';
import { MockAdapter } from '../src/harness/mock.js';

const OPENSPEC = 'openspec';
const QUEUE_PATH = 'openspec/queue.md';
const CHANGES = path.join(OPENSPEC, 'changes');

const QUEUE = ['## [alpha] Queue Alpha', 'Depends on: nothing', '', 'Alpha brief body.', ''].join(
  '\n',
);

type Location = 'active' | 'archive' | 'rejected';

function proposalMd(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'depends_on: []',
    'verify: node -e "process.exit(0)"',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    '',
    'Goal.',
    '',
  ].join('\n');
}

function started(sessionId: string, timestamp: string): string {
  return JSON.stringify({
    type: 'plan_started',
    sessionId,
    timestamp,
    data: { harness: 'mock', model: 'm', osqVersion: '0.0.0', briefHash: 'sha256:x' },
  });
}

function exited(sessionId: string, timestamp: string, cost: number | null): string {
  return JSON.stringify({
    type: 'plan_exited',
    sessionId,
    timestamp,
    data: {
      exitCode: 0,
      wallSeconds: 1,
      usage: {
        inputTokens: null,
        outputTokens: null,
        cachedTokens: null,
        reasoningTokens: null,
        cost,
      },
    },
  });
}

async function writeAt(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/**
 * Create a change folder. `slug` present writes `queue_item` metadata; `plan`
 * writes a `.run/plan.jsonl` body; a missing `plan` leaves no planning log.
 */
async function createChange(
  root: string,
  location: Location,
  folderName: string,
  options: { slug?: string; plan?: string[] } = {},
): Promise<string> {
  const base =
    location === 'active'
      ? path.join(root, CHANGES, folderName)
      : path.join(root, CHANGES, location, folderName);
  await fs.mkdir(path.join(base, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(base, 'proposal.md'), proposalMd(folderName), 'utf8');
  const metadata = options.slug ? `---\nqueue_item: ${options.slug}\n---\n` : '';
  await fs.writeFile(path.join(base, 'brief.md'), `${metadata}body\n`, 'utf8');
  if (options.plan) {
    await writeAt(base, '.run/plan.jsonl', `${options.plan.join('\n')}\n`);
  }
  return base;
}

/** Map every file under `root` to its exact UTF-8 content. */
async function snapshotTree(root: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const walk = async (dir: string, prefix: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, rel);
      else out.set(rel, await fs.readFile(full, 'utf8'));
    }
  };
  await walk(root, '');
  return out;
}

async function activeFolderNames(root: string): Promise<string[]> {
  const entries = await fs
    .readdir(path.join(root, CHANGES), { withFileTypes: true })
    .catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== 'archive' && entry.name !== 'rejected')
    .map((entry) => entry.name)
    .sort();
}

async function captureStdout(run: () => Promise<void>): Promise<string> {
  let output = '';
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Buffer) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    await run();
  } finally {
    process.stdout.write = original;
  }
  return output;
}

async function captureStderr(run: () => Promise<void>): Promise<string> {
  let output = '';
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Buffer) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stderr.write;
  try {
    await run();
  } finally {
    process.stderr.write = original;
  }
  return output;
}

async function writeConfig(
  root: string,
  queue?: { maxPlanningSessions: number; maxPlanningCost: number },
): Promise<void> {
  const queueLine = queue
    ? `,\n  queue: { maxPlanningSessions: ${queue.maxPlanningSessions}, maxPlanningCost: ${queue.maxPlanningCost} }`
    : '';
  await fs.writeFile(
    path.join(root, 'osq.config.ts'),
    `export default { harness: 'mock'${queueLine} };\n`,
    'utf8',
  );
}

function usage(sessions: number, cost: number, costCoverageComplete: boolean): QueuePlanningUsage {
  return { sessions, cost, costCoverageComplete };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-queue-budget-'));
  process.exitCode = undefined;
  new MockAdapter().resetBehavior();
});

afterEach(async () => {
  process.exitCode = undefined;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('queue planning usage aggregate', () => {
  it('counts valid starts across active, archived, and rejected attempts, including retired slugs', async () => {
    await writeAt(tmpDir, QUEUE_PATH, QUEUE);
    await createChange(tmpDir, 'active', '001-alpha', {
      slug: 'alpha',
      plan: [
        started('s1', '2026-01-01T00:00:00.000Z'),
        exited('s1', '2026-01-01T00:01:00.000Z', 1),
      ],
    });
    await createChange(tmpDir, 'archive', '010-beta', {
      slug: 'beta',
      plan: [
        started('s2', '2026-01-01T01:00:00.000Z'),
        exited('s2', '2026-01-01T01:01:00.000Z', 2),
        started('s3', '2026-01-01T02:00:00.000Z'),
        exited('s3', '2026-01-01T02:01:00.000Z', 3),
      ],
    });
    await createChange(tmpDir, 'rejected', '020-gamma', {
      slug: 'gamma',
      plan: [started('s4', '2026-01-01T03:00:00.000Z')],
    });
    // Retained attempt for a slug no longer present in the current queue.
    await createChange(tmpDir, 'active', '030-retired', {
      slug: 'retired',
      plan: [
        started('s5', '2026-01-01T04:00:00.000Z'),
        exited('s5', '2026-01-01T04:01:00.000Z', 4),
      ],
    });
    // Non-queue change and malformed records contribute nothing.
    await createChange(tmpDir, 'active', '040-unrelated', {
      plan: [
        started('s6', '2026-01-01T05:00:00.000Z'),
        exited('s6', '2026-01-01T05:01:00.000Z', 5),
      ],
    });
    await createChange(tmpDir, 'active', '050-delta', {
      slug: 'delta',
      plan: [
        '{ not json',
        '',
        JSON.stringify({ type: 'unknown', sessionId: 'x', timestamp: '2026-01-01T00:00:00.000Z' }),
        started('s7', '2026-01-01T06:00:00.000Z'),
        exited('s7', '2026-01-01T06:01:00.000Z', 6),
      ],
    });

    const result = await readQueuePlanningUsage(tmpDir);

    // s1, s2, s3, s4, s5, s7 — s6 is not queue-associated.
    assert.equal(result.sessions, 6);
    assert.equal(result.cost, 16);
    assert.equal(result.costCoverageComplete, false, 's4 has no exit');
  });

  it('reports complete coverage when every start has one finite-cost exit, zero included', async () => {
    await writeAt(tmpDir, QUEUE_PATH, QUEUE);
    await createChange(tmpDir, 'active', '001-alpha', {
      slug: 'alpha',
      plan: [
        started('s1', '2026-01-01T00:00:00.000Z'),
        exited('s1', '2026-01-01T00:01:00.000Z', 0),
        started('s2', '2026-01-01T01:00:00.000Z'),
        exited('s2', '2026-01-01T01:01:00.000Z', 0.5),
      ],
    });
    await createChange(tmpDir, 'archive', '010-beta', {
      slug: 'beta',
      plan: [
        started('s3', '2026-01-01T02:00:00.000Z'),
        exited('s3', '2026-01-01T02:01:00.000Z', 0),
      ],
    });

    const result = await readQueuePlanningUsage(tmpDir);

    assert.equal(result.sessions, 3);
    assert.equal(result.cost, 0.5);
    assert.equal(result.costCoverageComplete, true);
  });

  it('treats missing, null-cost, duplicate, and orphan exits as incomplete', async () => {
    await createChange(tmpDir, 'active', '001-null', {
      slug: 'a-null',
      plan: [
        started('s1', '2026-01-01T00:00:00.000Z'),
        exited('s1', '2026-01-01T00:01:00.000Z', null),
      ],
    });
    await createChange(tmpDir, 'active', '002-duplicate', {
      slug: 'b-duplicate',
      plan: [
        started('s2', '2026-01-01T01:00:00.000Z'),
        exited('s2', '2026-01-01T01:01:00.000Z', 5),
        exited('s2', '2026-01-01T01:02:00.000Z', 5),
      ],
    });
    await createChange(tmpDir, 'active', '003-missing', {
      slug: 'c-missing',
      plan: [started('s3', '2026-01-01T02:00:00.000Z')],
    });
    await createChange(tmpDir, 'active', '004-orphan', {
      slug: 'd-orphan',
      plan: [exited('orphan', '2026-01-01T03:00:00.000Z', 9)],
    });

    const result = await readQueuePlanningUsage(tmpDir);

    assert.equal(result.sessions, 3, 'the orphan exit is not a session');
    assert.equal(result.cost, 0, 'no session has one finite-cost exit');
    assert.equal(result.costCoverageComplete, false);
  });

  it('derives complete zero coverage when there are no prior sessions', async () => {
    await createChange(tmpDir, 'active', '001-alpha', { slug: 'alpha' });

    const result = await readQueuePlanningUsage(tmpDir);

    assert.deepEqual(result, { sessions: 0, cost: 0, costCoverageComplete: true });
  });
});

describe('queue budget evaluation', () => {
  it('requires both ceilings for the spend gates', () => {
    const absent = evaluateQueueBudget(defineConfig({}), usage(0, 0, true));
    assert.equal(absent.kind, 'refused');
    if (absent.kind === 'refused') assert.match(absent.message, /queue\.maxPlanningSessions/);

    const partial = evaluateQueueBudget(
      { ...defineConfig({}), queue: { maxPlanningSessions: 1 } } as unknown as OsqConfig,
      usage(0, 0, true),
    );
    assert.equal(partial.kind, 'refused');
  });

  it('refuses only when one more session would exceed the maximum', () => {
    const config = defineConfig({ queue: { maxPlanningSessions: 2, maxPlanningCost: 100 } });

    assert.equal(evaluateQueueBudget(config, usage(1, 0, true)).kind, 'ok');

    const refused = evaluateQueueBudget(config, usage(2, 0, true));
    assert.equal(refused.kind, 'refused');
    if (refused.kind === 'refused') assert.match(refused.message, /session limit reached/);
  });

  it('refuses every launch under a zero session limit', () => {
    const config = defineConfig({ queue: { maxPlanningSessions: 0, maxPlanningCost: 100 } });
    const refused = evaluateQueueBudget(config, usage(0, 0, true));
    assert.equal(refused.kind, 'refused');
    if (refused.kind === 'refused') assert.match(refused.message, /session limit reached/);
  });

  it('enforces the cost ceiling only with complete coverage and at or above the maximum', () => {
    const config = defineConfig({ queue: { maxPlanningSessions: 10, maxPlanningCost: 0.5 } });

    assert.equal(evaluateQueueBudget(config, usage(0, 0.25, true)).kind, 'ok');

    for (const cost of [0.5, 0.75]) {
      const refused = evaluateQueueBudget(config, usage(0, cost, true));
      assert.equal(refused.kind, 'refused', `cost ${cost} should refuse`);
      if (refused.kind === 'refused') assert.match(refused.message, /cost limit reached/);
    }
  });

  it('ignores only the cost ceiling with incomplete coverage and notes it', () => {
    const config = defineConfig({ queue: { maxPlanningSessions: 10, maxPlanningCost: 0 } });

    const result = evaluateQueueBudget(config, usage(0, 1, false));
    assert.equal(result.kind, 'ok');
    if (result.kind === 'ok') assert.match(result.notice ?? '', /coverage is incomplete/);
  });

  it('keeps enforcing the session ceiling with incomplete coverage', () => {
    const config = defineConfig({ queue: { maxPlanningSessions: 0, maxPlanningCost: 0 } });

    const refused = evaluateQueueBudget(config, usage(0, 1, false));
    assert.equal(refused.kind, 'refused');
    if (refused.kind === 'refused') assert.match(refused.message, /session limit reached/);
  });
});

describe('prepareQueuePlan budget gate', () => {
  it('refuses before returning a selection when the budget is required but absent', async () => {
    await writeAt(tmpDir, QUEUE_PATH, QUEUE);
    const preparation = await prepareQueuePlan(tmpDir, defineConfig({}), { enforceBudget: true });
    assert.equal(preparation.kind, 'refused');
    if (preparation.kind === 'refused')
      assert.match(preparation.message, /queue\.maxPlanningSessions/);
  });

  it('returns a notice and a selection when cost coverage is incomplete', async () => {
    await writeAt(tmpDir, QUEUE_PATH, QUEUE);
    await createChange(tmpDir, 'active', '090-retired', {
      slug: 'retired',
      plan: [started('p1', '2026-01-01T00:00:00.000Z')],
    });

    const preparation = await prepareQueuePlan(
      tmpDir,
      defineConfig({ queue: { maxPlanningSessions: 5, maxPlanningCost: 0 } }),
      { enforceBudget: true },
    );

    assert.equal(preparation.kind, 'ready');
    if (preparation.kind === 'ready') {
      assert.equal(preparation.selection.item.slug, 'alpha');
      assert.match(preparation.notice ?? '', /coverage is incomplete/);
    }
  });
});

describe('queue modes without a queue config block', () => {
  it('keeps osq queue working without queue ceilings', async () => {
    await writeConfig(tmpDir);
    await writeAt(tmpDir, QUEUE_PATH, QUEUE);

    const output = await queueCommand({ cwd: tmpDir, stdout: () => {} });

    assert.match(output, /alpha: Queue Alpha \[unplanned\]/);
  });
});

describe('planCommand budget refusals', () => {
  it('refuses a non-print next plan without queue ceilings before any mutation', async () => {
    await writeConfig(tmpDir);
    await writeAt(tmpDir, QUEUE_PATH, QUEUE);
    const before = await snapshotTree(tmpDir);

    const stderr = await captureStderr(() =>
      planCommand(undefined, { next: true, cwd: tmpDir, adapter: new MockAdapter() }),
    );

    assert.equal(process.exitCode, 1);
    assert.match(stderr, /requires queue\.maxPlanningSessions/);
    assert.deepEqual([...(await snapshotTree(tmpDir)).entries()], [...before.entries()]);
    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 0);
  });

  it('lets print mode bypass the spend gates without a queue block', async () => {
    await writeConfig(tmpDir);
    await writeAt(tmpDir, QUEUE_PATH, QUEUE);

    const stdout = await captureStdout(() =>
      planCommand(undefined, { next: true, print: true, cwd: tmpDir }),
    );

    assert.equal(process.exitCode, undefined);
    assert.match(stdout, /# Change: 001 - Queue Alpha/);
    const folder = path.join(tmpDir, CHANGES, '001-alpha');
    assert.ok(
      await fs
        .stat(path.join(folder, 'brief.md'))
        .then(() => true)
        .catch(() => false),
    );
    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 0);
  });

  it('allows a launch exactly at the session boundary', async () => {
    await writeConfig(tmpDir, { maxPlanningSessions: 2, maxPlanningCost: 100 });
    await writeAt(tmpDir, QUEUE_PATH, QUEUE);
    await createChange(tmpDir, 'rejected', '090-retired', {
      slug: 'retired',
      plan: [
        started('p1', '2026-01-01T00:00:00.000Z'),
        exited('p1', '2026-01-01T00:01:00.000Z', 0.1),
      ],
    });

    await captureStdout(() =>
      planCommand(undefined, { next: true, cwd: tmpDir, adapter: new MockAdapter() }),
    );

    assert.equal(process.exitCode, undefined);
    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 1);
    const [folderName] = await activeFolderNames(tmpDir);
    assert.match(folderName ?? '', /^\d+-alpha$/);
    const folder = path.join(tmpDir, CHANGES, folderName ?? '');
    const log = await fs.readFile(path.join(folder, '.run', 'plan.jsonl'), 'utf8');
    assert.equal(log.trim().split('\n').length, 2);
  });

  it('refuses before folder creation when one more session would exceed the maximum', async () => {
    await writeConfig(tmpDir, { maxPlanningSessions: 1, maxPlanningCost: 100 });
    await writeAt(tmpDir, QUEUE_PATH, QUEUE);
    await createChange(tmpDir, 'rejected', '090-retired', {
      slug: 'retired',
      plan: [
        started('p1', '2026-01-01T00:00:00.000Z'),
        exited('p1', '2026-01-01T00:01:00.000Z', 0.1),
      ],
    });
    const before = await snapshotTree(tmpDir);

    const stderr = await captureStderr(() =>
      planCommand(undefined, { next: true, cwd: tmpDir, adapter: new MockAdapter() }),
    );

    assert.equal(process.exitCode, 1);
    assert.match(stderr, /session limit reached/);
    assert.deepEqual([...(await snapshotTree(tmpDir)).entries()], [...before.entries()]);
    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 0);
  });

  it('refuses under a zero session limit and with a reached cost ceiling', async () => {
    await writeConfig(tmpDir, { maxPlanningSessions: 0, maxPlanningCost: 100 });
    await writeAt(tmpDir, QUEUE_PATH, QUEUE);
    const zeroBefore = await snapshotTree(tmpDir);
    const zeroStderr = await captureStderr(() =>
      planCommand(undefined, { next: true, cwd: tmpDir, adapter: new MockAdapter() }),
    );
    assert.equal(process.exitCode, 1);
    assert.match(zeroStderr, /session limit reached/);
    assert.deepEqual([...(await snapshotTree(tmpDir)).entries()], [...zeroBefore.entries()]);

    process.exitCode = undefined;
    await writeConfig(tmpDir, { maxPlanningSessions: 10, maxPlanningCost: 0.5 });
    await createChange(tmpDir, 'rejected', '090-retired', {
      slug: 'retired',
      plan: [
        started('p2', '2026-01-01T00:00:00.000Z'),
        exited('p2', '2026-01-01T00:01:00.000Z', 0.5),
      ],
    });
    const costBefore = await snapshotTree(tmpDir);
    const costStderr = await captureStderr(() =>
      planCommand(undefined, { next: true, cwd: tmpDir, adapter: new MockAdapter() }),
    );
    assert.equal(process.exitCode, 1);
    assert.match(costStderr, /cost limit reached/);
    assert.deepEqual([...(await snapshotTree(tmpDir)).entries()], [...costBefore.entries()]);
    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 0);
  });

  it('prints one note and proceeds when coverage is incomplete, still enforcing sessions', async () => {
    await writeConfig(tmpDir, { maxPlanningSessions: 10, maxPlanningCost: 0 });
    await writeAt(tmpDir, QUEUE_PATH, QUEUE);
    await createChange(tmpDir, 'rejected', '090-retired', {
      slug: 'retired',
      plan: [started('p1', '2026-01-01T00:00:00.000Z')],
    });

    const stderr = await captureStderr(() =>
      planCommand(undefined, { next: true, cwd: tmpDir, adapter: new MockAdapter() }),
    );

    assert.equal(process.exitCode, undefined);
    assert.match(stderr, /coverage is incomplete/);
    assert.equal(MockAdapter.recordedInteractiveSpawns.length, 1);
    const [folderName] = await activeFolderNames(tmpDir);
    const folder = path.join(tmpDir, CHANGES, folderName ?? '');
    assert.ok(
      await fs
        .stat(path.join(folder, 'brief.md'))
        .then(() => true)
        .catch(() => false),
    );
  });
});
