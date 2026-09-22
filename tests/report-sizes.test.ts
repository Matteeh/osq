import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { reportCommand } from '../src/cli/report.js';
import { DEFAULT_CONFIG, defineConfig } from '../src/core/config.js';
import {
  type RepositoryRecord,
  formatMetricsReport,
  formatRepositoryRecordBody,
  getMetricsReport,
  getRepositoryRecord,
} from '../src/core/report.js';

const fixtureRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'report-sizes',
);

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
const dead = (sec: number, reason?: string): Record<string, unknown> => ({
  type: 'dead',
  timestamp: iso(sec),
  data: reason === undefined ? {} : { task: '1', reason },
});

interface TaskSpec {
  readonly title: string;
  readonly acceptanceLines: number;
  readonly events: Record<string, unknown>[] | null;
}

function taskMd(title: string, acceptanceLines: number): string {
  const lines = Array.from({ length: acceptanceLines }, (_, i) => `- [ ] criterion ${i + 1}`).join(
    '\n',
  );
  return `---
title: ${title}
verify: node -e "process.exit(0)"
scope: []
entry: []
skills: []
---
## Acceptance
${lines}
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
      taskMd(task.title, task.acceptanceLines),
      'utf8',
    );
    if (!task.events) continue;
    await fs.mkdir(path.join(folderPath, '.run', 'events'), { recursive: true });
    await fs.writeFile(
      path.join(folderPath, '.run', 'events', `${taskNumber}.jsonl`),
      `${task.events.map((event) => JSON.stringify(event)).join('\n')}\n`,
      'utf8',
    );
  }
}

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-sizes-'));
}

describe('report sizes over the checked-in fixture', () => {
  it('exposes ordered bucket rows for scope files and acceptance lines', async () => {
    const report = await getMetricsReport(fixtureRoot, DEFAULT_CONFIG);

    assert.deepEqual(report.history.sizes.byScopeFiles, [
      {
        bucket: '1-2',
        tasks: 3,
        firstAttemptPassRate: 0.67,
        meanAttempts: 1,
        medianDurationSeconds: 60,
      },
      {
        bucket: '3-4',
        tasks: 1,
        firstAttemptPassRate: 0,
        meanAttempts: 2,
        medianDurationSeconds: 150,
      },
      {
        bucket: '5-8',
        tasks: 3,
        firstAttemptPassRate: 1,
        meanAttempts: 1,
        medianDurationSeconds: 30,
      },
      {
        bucket: 'over-8',
        tasks: 1,
        firstAttemptPassRate: 0,
        meanAttempts: 1,
        medianDurationSeconds: 10,
      },
    ]);

    assert.deepEqual(report.history.sizes.byAcceptanceLines, [
      {
        bucket: '1-2',
        tasks: 2,
        firstAttemptPassRate: 0.5,
        meanAttempts: 1,
        medianDurationSeconds: 35,
      },
      {
        bucket: '3-4',
        tasks: 2,
        firstAttemptPassRate: 0,
        meanAttempts: 1.5,
        medianDurationSeconds: 150,
      },
      {
        bucket: '5-8',
        tasks: 4,
        firstAttemptPassRate: 1,
        meanAttempts: 1,
        medianDurationSeconds: 30,
      },
      {
        bucket: 'over-8',
        tasks: 0,
        firstAttemptPassRate: 0,
        meanAttempts: 0,
        medianDurationSeconds: null,
      },
    ]);
  });

  it('selects the largest first-attempt pass with deterministic tie-breaks', async () => {
    const report = await getMetricsReport(fixtureRoot, DEFAULT_CONFIG);

    assert.deepEqual(report.history.sizes.largestFirstAttemptPass, {
      change: '102-size-medium',
      task: '2',
      title: 'Tied largest A',
      scopeFiles: 8,
      acceptanceLines: 7,
    });
  });

  it('emits size tables and exactly one near-limit hint line in text', async () => {
    const output = await reportCommand({ cwd: fixtureRoot, stdout: () => {} });

    assert.ok(output.includes('Size by scope files:'), output);
    assert.ok(output.includes('Size by acceptance lines:'), output);
    assert.ok(output.includes('bucket'), output);

    const hintLines = output.split('\n').filter((line) => line.includes('Size hint:'));
    assert.equal(hintLines.length, 1, output);
    assert.ok(hintLines[0].includes('maxScopeFiles 8'), hintLines[0]);
    assert.ok(hintLines[0].includes('maxAcceptanceLines 7'), hintLines[0]);
    assert.ok(!/change (the|a|your) limit|set max|recommend|should be/i.test(hintLines[0]));
  });

  it('omits the hint when the largest pass is not near a limit', async () => {
    const report = await getMetricsReport(fixtureRoot, DEFAULT_CONFIG);
    const relaxed = defineConfig({ limits: { maxScopeFiles: 50, maxAcceptanceLines: 50 } });
    const output = formatMetricsReport(report, relaxed);

    assert.ok(!output.includes('Size hint:'), output);
  });

  it('renders stable JSON with ordered history.sizes', async () => {
    const raw = await reportCommand({ cwd: fixtureRoot, json: true, stdout: () => {} });
    const parsed = JSON.parse(raw) as {
      history: { sizes: { byScopeFiles: { bucket: string }[]; byAcceptanceLines: unknown[] } };
    };

    assert.deepEqual(
      parsed.history.sizes.byScopeFiles.map((row) => row.bucket),
      ['1-2', '3-4', '5-8', 'over-8'],
    );
    assert.deepEqual(
      (parsed.history.sizes.byAcceptanceLines as { bucket: string }[]).map((row) => row.bucket),
      ['1-2', '3-4', '5-8', 'over-8'],
    );
  });

  it('is deterministic across repeated derivations', async () => {
    const first = await getMetricsReport(fixtureRoot, DEFAULT_CONFIG);
    const second = await getMetricsReport(fixtureRoot, DEFAULT_CONFIG);
    assert.deepEqual(first.history.sizes, second.history.sizes);
  });
});

describe('measured task projection', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  async function root(): Promise<string> {
    const created = await tempRoot();
    roots.push(created);
    return created;
  }

  it('ignores tasks without a valid start measure and results files', async () => {
    const rootPath = await root();
    await writeArchivedChange(rootPath, '100-change', [
      {
        title: 'No measures',
        acceptanceLines: 1,
        events: [started(0), done(1)],
      },
    ]);
    // A misleading results file must never be read for size or outcome.
    await fs.mkdir(
      path.join(rootPath, 'openspec', 'changes', 'archive', '100-change', '.run', 'results'),
      {
        recursive: true,
      },
    );
    await fs.writeFile(
      path.join(
        rootPath,
        'openspec',
        'changes',
        'archive',
        '100-change',
        '.run',
        'results',
        '1.md',
      ),
      'This prose claims scopeFiles 99 and a pass.\n',
      'utf8',
    );

    const report = await getMetricsReport(rootPath, DEFAULT_CONFIG);
    assert.equal(report.history.sizes.largestFirstAttemptPass, null);
    assert.equal(
      report.history.sizes.byScopeFiles.reduce((sum, row) => sum + row.tasks, 0),
      0,
    );
  });

  it('uses the first valid start measure and counts started attempts', async () => {
    const rootPath = await root();
    await writeArchivedChange(rootPath, '100-change', [
      {
        title: 'Retried',
        acceptanceLines: 2,
        events: [
          { type: 'measures', timestamp: iso(0), data: { phase: 'start' } },
          mStart(10, 3),
          started(11),
          mEnd(20, 3),
          dead(21, 'verify_red'),
          mStart(30, 3),
          started(31),
          mEnd(45, 3),
          done(46),
        ],
      },
    ]);

    const report = await getMetricsReport(rootPath, DEFAULT_CONFIG);
    const bucket = report.history.sizes.byScopeFiles.find((row) => row.bucket === '3-4');
    assert.ok(bucket);
    assert.equal(bucket.tasks, 1);
    assert.equal(bucket.firstAttemptPassRate, 0);
    assert.equal(bucket.meanAttempts, 2);
    assert.equal(bucket.medianDurationSeconds, 25);
  });

  it('treats only a typed done before the next outcome as a first-attempt pass', async () => {
    const rootPath = await root();
    await writeArchivedChange(rootPath, '100-change', [
      {
        title: 'Died then done',
        acceptanceLines: 1,
        events: [mStart(0, 1), started(1), dead(2, 'crashed'), started(3), done(4), mEnd(5, 1)],
      },
      {
        title: 'Passed',
        acceptanceLines: 1,
        events: [mStart(10, 1), started(11), done(12), mEnd(20, 1)],
      },
    ]);

    const report = await getMetricsReport(rootPath, DEFAULT_CONFIG);
    const bucket = report.history.sizes.byScopeFiles.find((row) => row.bucket === '1-2');
    assert.ok(bucket);
    assert.equal(bucket.tasks, 2);
    assert.equal(bucket.firstAttemptPassRate, 0.5);
  });

  it('discards reversed and incomplete measure pairs for duration', async () => {
    const rootPath = await root();
    await writeArchivedChange(rootPath, '100-change', [
      {
        title: 'No covered duration',
        acceptanceLines: 1,
        events: [mStart(100, 1), mEnd(50, 1), mStart(200, 1), done(201)],
      },
    ]);

    const report = await getMetricsReport(rootPath, DEFAULT_CONFIG);
    const bucket = report.history.sizes.byScopeFiles.find((row) => row.bucket === '1-2');
    assert.ok(bucket);
    assert.equal(bucket.tasks, 1);
    assert.equal(bucket.medianDurationSeconds, null);
  });

  it('preserves pre-existing report fields and the queue view', async () => {
    const report = await getMetricsReport(fixtureRoot, DEFAULT_CONFIG);
    assert.equal(typeof report.completionRate, 'number');
    assert.ok(report.coverage);
    assert.ok(report.planning);
    assert.ok(report.cycle);
    assert.ok(report.now);
    assert.ok(report.queue);
    assert.equal(typeof report.queue.configured, 'boolean');
  });
});

describe('repository record derivation', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  async function root(): Promise<string> {
    const created = await tempRoot();
    roots.push(created);
    return created;
  }

  it('derives aggregates and dead outcomes from the checked-in fixture', async () => {
    const record = await getRepositoryRecord(fixtureRoot, DEFAULT_CONFIG);

    assert.equal(record.measuredTasks, 8);
    assert.equal(record.firstAttemptPassRate, 0.63);
    assert.equal(record.medianDurationSeconds, 35);
    assert.deepEqual(record.largestFirstAttemptPass, {
      change: '102-size-medium',
      task: '2',
      title: 'Tied largest A',
      scopeFiles: 8,
      acceptanceLines: 7,
    });
    assert.deepEqual(record.deadOutcomes, [
      { change: '103-size-large', title: 'Large dead task', reason: 'crashed' },
      { change: '103-size-large', title: 'Unknown reason task', reason: 'unknown' },
      { change: '102-size-medium', title: 'Medium retry task', reason: 'verify_red' },
    ]);
  });

  it('inspects only the 20 highest numeric archived changes', async () => {
    const rootPath = await root();
    for (let i = 0; i < 22; i++) {
      const folder = `${String(i + 1).padStart(3, '0')}-change-${i}`;
      const scopeFiles = i === 0 || i === 1 ? 50 : i === 21 ? 9 : 1;
      await writeArchivedChange(rootPath, folder, [
        {
          title: `Task ${i}`,
          acceptanceLines: 1,
          events:
            i === 0 || i === 1
              ? [mStart(0, scopeFiles), started(1), mEnd(2, scopeFiles), dead(3, 'excluded')]
              : [mStart(0, scopeFiles), started(1), mEnd(2, scopeFiles), done(3)],
        },
      ]);
    }

    const record = await getRepositoryRecord(rootPath, DEFAULT_CONFIG);
    assert.equal(record.measuredTasks, 20);
    assert.equal(record.firstAttemptPassRate, 1);
    assert.deepEqual(record.deadOutcomes, []);
    assert.equal(record.largestFirstAttemptPass?.change, '022-change-21');
    assert.equal(record.largestFirstAttemptPass?.scopeFiles, 9);
  });

  it('truncates dead outcomes to ten in change, task, event order', async () => {
    const rootPath = await root();
    const tasks: TaskSpec[] = [];
    for (let i = 1; i <= 12; i++) {
      tasks.push({
        title: `Dead ${i}`,
        acceptanceLines: 1,
        events: [
          mStart(0, 1),
          started(1),
          mEnd(2, 1),
          dead(3, `reason-${String(i).padStart(2, '0')}`),
        ],
      });
    }
    await writeArchivedChange(rootPath, '200-change', tasks);

    const record = await getRepositoryRecord(rootPath, DEFAULT_CONFIG);
    assert.equal(record.deadOutcomes.length, 10);
    assert.deepEqual(
      record.deadOutcomes.map((outcome) => outcome.reason),
      [
        'reason-01',
        'reason-02',
        'reason-03',
        'reason-04',
        'reason-05',
        'reason-06',
        'reason-07',
        'reason-08',
        'reason-09',
        'reason-10',
      ],
    );
    assert.ok(!record.deadOutcomes.some((outcome) => outcome.reason === 'reason-11'));
  });

  it('never reads results files when deriving the record', async () => {
    const rootPath = await root();
    await writeArchivedChange(rootPath, '300-change', [
      {
        title: 'Measured',
        acceptanceLines: 1,
        events: [mStart(0, 2), started(1), mEnd(2, 2), done(3)],
      },
    ]);
    await fs.mkdir(
      path.join(rootPath, 'openspec', 'changes', 'archive', '300-change', '.run', 'results'),
      {
        recursive: true,
      },
    );
    await fs.writeFile(
      path.join(
        rootPath,
        'openspec',
        'changes',
        'archive',
        '300-change',
        '.run',
        'results',
        '1.md',
      ),
      'scopeFiles: 999\nreason: synthetic\n',
      'utf8',
    );

    const record = await getRepositoryRecord(rootPath, DEFAULT_CONFIG);
    assert.equal(record.measuredTasks, 1);
    assert.equal(record.largestFirstAttemptPass?.scopeFiles, 2);
    assert.deepEqual(record.deadOutcomes, []);
  });
});

describe('formatRepositoryRecordBody', () => {
  it('prints the four labeled groups for a sufficient record', () => {
    const record: RepositoryRecord = {
      measuredTasks: 6,
      firstAttemptPassRate: 0.5,
      medianDurationSeconds: 30,
      largestFirstAttemptPass: {
        change: '102-size-medium',
        task: '2',
        title: 'Tied largest A',
        scopeFiles: 8,
        acceptanceLines: 7,
      },
      deadOutcomes: [
        { change: '103-size-large', title: 'Large dead task', reason: 'crashed' },
        { change: '103-size-large', title: 'Unknown reason task', reason: 'unknown' },
      ],
    };

    const body = formatRepositoryRecordBody(record);
    assert.ok(body.includes('First-attempt pass rate: 0.5'), body);
    assert.ok(body.includes('Largest first-attempt pass:'), body);
    assert.ok(body.includes('Median task duration: 30s'), body);
    assert.ok(body.includes('Dead outcomes:'), body);
    assert.ok(body.includes('- 103-size-large, Large dead task, crashed'), body);
    assert.ok(body.includes('- 103-size-large, Unknown reason task, unknown'), body);
  });

  it('prints only the too-small sentence below five measured tasks', () => {
    const record: RepositoryRecord = {
      measuredTasks: 4,
      firstAttemptPassRate: 0,
      medianDurationSeconds: null,
      largestFirstAttemptPass: null,
      deadOutcomes: [],
    };

    assert.equal(
      formatRepositoryRecordBody(record),
      "This repository's measured record is too small (fewer than 5 tasks).",
    );
  });
});
