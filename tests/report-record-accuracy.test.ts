import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import {
  formatMetricsReport,
  formatRepositoryRecordBody,
  getMetricsReport,
  getRepositoryRecord,
} from '../src/core/report/report.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-record-'));
  roots.push(root);
  await fs.mkdir(path.join(root, 'openspec', 'changes', 'archive'), { recursive: true });
  return root;
}

const BASE_MS = Date.UTC(2026, 8, 1, 0, 0, 0);
const iso = (sec: number): string => new Date(BASE_MS + sec * 1000).toISOString();

interface TaskSpec {
  readonly title: string;
  readonly events: Record<string, unknown>[] | null;
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
): Promise<string> {
  const folderPath = path.join(root, 'openspec', 'changes', 'archive', folder);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(folderPath, 'proposal.md'),
    `---\ntitle: ${folder}\ndepends_on: []\nfeatures:\n  reads: []\n  writes: []\n---\n## Goal\n\nFixture change.\n`,
    'utf8',
  );
  for (let index = 0; index < tasks.length; index++) {
    const task = tasks[index];
    const taskNumber = String(index + 1);
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${taskNumber}.md`),
      taskMd(task.title),
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
  return folderPath;
}

interface Lifecycle {
  readonly createdAt?: string;
  readonly createdAtSource?: boolean;
  readonly approvedAt?: string;
  readonly approved?: boolean;
}

/** Writes a manifest (and optional `.run/approved`) for one change folder. */
async function writeLifecycle(folderPath: string, lifecycle: Lifecycle): Promise<void> {
  const manifest: Record<string, unknown> = {};
  if (lifecycle.createdAt !== undefined) manifest.createdAt = lifecycle.createdAt;
  if (lifecycle.createdAtSource) manifest.createdAtSource = 'created';
  if (lifecycle.approvedAt !== undefined) manifest.approvedAt = lifecycle.approvedAt;
  await fs.mkdir(path.join(folderPath, '.run'), { recursive: true });
  await fs.writeFile(
    path.join(folderPath, '.run', 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  if (lifecycle.approved) {
    await fs.writeFile(path.join(folderPath, '.run', 'approved'), '', 'utf8');
  }
}

const mStart = (sec: number, scopeFiles: number): Record<string, unknown> => ({
  type: 'measures',
  timestamp: iso(sec),
  data: { phase: 'start', scopeFiles },
});
const mEnd = (
  sec: number,
  scopeFiles: number,
  scopeHashes?: Record<string, unknown>,
): Record<string, unknown> => ({
  type: 'measures',
  timestamp: iso(sec),
  data:
    scopeHashes === undefined
      ? { phase: 'end', scopeFiles }
      : { phase: 'end', scopeFiles, scopeHashes },
});
const started = (sec: number): Record<string, unknown> => ({
  type: 'started',
  timestamp: iso(sec),
  data: { taskTitle: 'x' },
});
const done = (sec: number): Record<string, unknown> => ({
  type: 'done',
  timestamp: iso(sec),
  data: { task: '1' },
});

function legacySeries(report: Awaited<ReturnType<typeof getMetricsReport>>) {
  const found = report.history.sizes.scopeFileSeries.find((entry) => entry.resolver === 'legacy');
  assert.ok(found, 'expected a legacy scope-file series');
  return found;
}

describe('brief to approval from manifest creation', () => {
  it('measures from a marked creation time to a trusted approval', async () => {
    const root = await tempRoot();
    const folder = await writeArchivedChange(root, '050-marked', []);
    await writeLifecycle(folder, {
      createdAt: iso(0),
      createdAtSource: true,
      approvedAt: iso(3600),
      approved: true,
    });

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.equal(report.cycle.byChange[0]?.briefToApprovalSeconds, 3600);
  });

  it('is null without the creation marker', async () => {
    const root = await tempRoot();
    const folder = await writeArchivedChange(root, '051-unmarked', []);
    await writeLifecycle(folder, { createdAt: iso(0), approvedAt: iso(3600), approved: true });

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.equal(report.cycle.byChange[0]?.briefToApprovalSeconds, null);
  });

  it('is null when the approval is untrusted without .run/approved', async () => {
    const root = await tempRoot();
    const folder = await writeArchivedChange(root, '052-unapproved', []);
    await writeLifecycle(folder, {
      createdAt: iso(0),
      createdAtSource: true,
      approvedAt: iso(3600),
    });

    const report = await getMetricsReport(root, DEFAULT_CONFIG);

    assert.equal(report.cycle.byChange[0]?.briefToApprovalSeconds, null);
  });

  it('prints not reported for a phase with no covered archived change', async () => {
    const root = await tempRoot();
    const folder = await writeArchivedChange(root, '053-uncovered', []);
    await writeLifecycle(folder, {
      createdAt: iso(0),
      createdAtSource: true,
      approvedAt: iso(3600),
      approved: true,
    });

    const report = await getMetricsReport(root, DEFAULT_CONFIG);
    const text = formatMetricsReport(report);

    assert.ok(
      text.includes('Approval to first task: not reported (0 of 1 archived changes)'),
      text,
    );
    assert.ok(
      text.includes('Brief to approval: total 60m, average 60m (1 of 1 archived changes)'),
      text,
    );
  });
});

describe('scope size from the last end measure', () => {
  it('counts the files a task created in buckets, largest pass, and record', async () => {
    const root = await tempRoot();
    const scopeHashes = Object.fromEntries(
      Array.from({ length: 5 }, (_, index) => [
        `created/file-${index}.ts`,
        { before: null, after: `sha256:${index}` },
      ]),
    );
    await writeArchivedChange(root, '100-created', [
      {
        title: 'Created files',
        events: [mStart(0, 0), started(1), done(2), mEnd(3, 0, scopeHashes)],
      },
    ]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);
    const legacy = legacySeries(report);
    const bucket = legacy.byScopeFiles.find((row) => row.bucket === '5-8');

    assert.equal(bucket?.tasks, 1);
    assert.equal(legacy.largestFirstAttemptPass?.scopeFiles, 5);

    const record = await getRepositoryRecord(root, DEFAULT_CONFIG);
    assert.equal(record.largestFirstAttemptPass?.scopeFiles, 5);
  });

  it('falls back to the start scopeFiles without an end event', async () => {
    const root = await tempRoot();
    await writeArchivedChange(root, '101-start-only', [
      { title: 'Start only', events: [mStart(0, 3), started(1)] },
    ]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);
    const legacy = legacySeries(report);
    const bucket = legacy.byScopeFiles.find((row) => row.bucket === '3-4');

    assert.equal(bucket?.tasks, 1);
  });

  it('prints first-attempt passes as a count over measured tasks', async () => {
    const root = await tempRoot();
    const tasks = Array.from(
      { length: 8 },
      (_, index): TaskSpec => ({
        title: `Pass ${index}`,
        events: [mStart(0, 1), started(1), done(2), mEnd(3, 1)],
      }),
    );
    await writeArchivedChange(root, '200-passes', tasks);

    const record = await getRepositoryRecord(root, DEFAULT_CONFIG);

    assert.equal(record.measuredTasks, 8);
    assert.equal(record.firstAttemptPasses, 8);
    assert.ok(formatRepositoryRecordBody(record).includes('First-attempt passes: 8/8'));
  });
});
