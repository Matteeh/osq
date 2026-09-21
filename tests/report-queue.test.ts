import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { reportCommand } from '../src/cli/report.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { type MetricsReport, formatMetricsReport, getMetricsReport } from '../src/core/report.js';

const OPENSPEC = 'openspec';
const fixtureReportRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixture',
  'report',
);

function proposalMd(title: string): string {
  return ['---', `title: ${title}`, 'depends_on: []', '---', '## Goal', `${title} goal.`, ''].join(
    '\n',
  );
}

function taskMd(): string {
  return [
    '---',
    'title: Task 1',
    'verify: node -e "process.exit(0)"',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] done',
    '',
  ].join('\n');
}

function briefMd(slug: string, hash: string | null): string {
  const lines = ['---', `queue_item: ${slug}`];
  if (hash !== null) lines.push(`queue_hash: ${hash}`);
  lines.push('---', `Brief body for ${slug}.`, '');
  return lines.join('\n');
}

interface ItemSpec {
  slug: string;
  title: string;
  depends?: string;
  body?: string;
}

function queueContent(items: ItemSpec[]): string {
  return items
    .map((item) =>
      [
        `## [${item.slug}] ${item.title}`,
        `Depends on: ${item.depends ?? 'nothing'}`,
        '',
        item.body ?? `Brief body for ${item.slug}.`,
        '',
      ].join('\n'),
    )
    .join('\n');
}

function sectionHash(content: string, slug: string): string {
  const marker = `## [${slug}] `;
  const start = content.indexOf(marker);
  assert.ok(start >= 0, `missing queue marker for ${slug}`);
  const next = content.indexOf('## [', start + marker.length);
  const raw = content.slice(start, next === -1 ? content.length : next);
  return `sha256:${createHash('sha256').update(raw, 'utf8').digest('hex')}`;
}

async function writeAt(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function writeQueue(root: string, content: string): Promise<string> {
  const queuePath = path.join(root, OPENSPEC, 'queue.md');
  await fs.mkdir(path.dirname(queuePath), { recursive: true });
  await fs.writeFile(queuePath, content, 'utf8');
  return queuePath;
}

interface PlanSessionSpec {
  id: string;
  start: string;
  end?: string;
  cost: number | null;
}

/** Minimal well-formed `plan.jsonl` body for one or more planning sessions. */
function planJsonl(sessions: PlanSessionSpec[]): string {
  const lines: string[] = [];
  for (const session of sessions) {
    lines.push(
      JSON.stringify({
        type: 'plan_started',
        sessionId: session.id,
        timestamp: session.start,
        data: { harness: 'mock', model: 'mock-model', osqVersion: '0.0.0', briefHash: 'h' },
      }),
    );
    if (session.end) {
      lines.push(
        JSON.stringify({
          type: 'plan_exited',
          sessionId: session.id,
          timestamp: session.end,
          data: {
            exitCode: 0,
            wallSeconds: 1,
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              cachedTokens: 0,
              reasoningTokens: 0,
              cost: session.cost,
            },
          },
        }),
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

function archivedEvent(timestamp: string): string {
  return `${JSON.stringify({ type: 'archived', timestamp })}\n`;
}

type Location = 'active' | 'archive' | 'rejected';
type Marker = 'dead' | 'regressed' | 'change-regressed' | 'running' | 'done';

interface ChangeOptions {
  slug: string;
  hash?: string | null;
  approved?: boolean;
  marker?: Marker;
  deadReason?: string | null;
  regressedReason?: string | null;
  changeReason?: string | null;
  plan?: string;
  archivedAt?: string;
  rejected?: { reason: string; timestamp: string } | null;
}

async function createChange(
  root: string,
  location: Location,
  folderName: string,
  options: ChangeOptions,
): Promise<string> {
  const base =
    location === 'active'
      ? path.join(root, OPENSPEC, 'changes', folderName)
      : path.join(root, OPENSPEC, 'changes', location, folderName);
  await fs.mkdir(path.join(base, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(base, 'proposal.md'), proposalMd(folderName), 'utf8');
  await fs.writeFile(path.join(base, 'tasks', '1.md'), taskMd(), 'utf8');
  await fs.writeFile(
    path.join(base, 'brief.md'),
    briefMd(options.slug, options.hash ?? null),
    'utf8',
  );
  if (options.approved) await writeAt(base, '.run/approved', 'sha256:fixture\n');
  if (options.marker === 'done') await writeAt(base, '.run/done/1', '');
  if (options.marker === 'running') {
    await writeAt(
      base,
      '.run/running/1.pid',
      JSON.stringify({ pid: process.pid, startedAt: Date.now() }),
    );
  }
  if (options.marker === 'dead') {
    const reason = options.deadReason === undefined ? 'verify_red' : options.deadReason;
    await writeAt(
      base,
      '.run/dead/1.md',
      reason === null ? 'not frontmatter\n' : `---\nreason: ${reason}\n---\nfailed\n`,
    );
  }
  if (options.marker === 'regressed') {
    const reason =
      options.regressedReason === undefined ? 'scope_regression' : options.regressedReason;
    await writeAt(base, '.run/regressed/1.md', `---\nreason: ${reason}\n---\nfailed\n`);
  }
  if (options.marker === 'change-regressed') {
    const reason = options.changeReason === undefined ? 'change_regressed' : options.changeReason;
    await writeAt(
      base,
      '.run/regressed/change.md',
      reason === null ? 'not frontmatter\n' : `---\nreason: ${reason}\n---\nfailed\n`,
    );
  }
  if (options.plan !== undefined) await writeAt(base, '.run/plan.jsonl', options.plan);
  if (options.archivedAt !== undefined) {
    await writeAt(base, '.run/events/change.jsonl', archivedEvent(options.archivedAt));
  }
  if (options.rejected !== undefined) {
    const content =
      options.rejected === null
        ? 'not frontmatter\n'
        : `---\nreason: ${JSON.stringify(options.rejected.reason)}\ntimestamp: ${JSON.stringify(options.rejected.timestamp)}\n---\n`;
    await writeAt(base, '.run/rejected.md', content);
  }
  return base;
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-queue-'));
  await scaffoldProject(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('queue report view', () => {
  it('returns an unconfigured empty queue view and leaves existing aggregates unchanged', async () => {
    await createChange(tmpDir, 'active', '001-active', {
      slug: 'alpha',
      approved: true,
      marker: 'dead',
    });

    const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

    assert.deepEqual(report.queue, {
      configured: false,
      landed: 0,
      total: 0,
      planning: { sessions: 0, cost: 0, costCoverageComplete: false },
      items: [],
      failures: [],
      rejections: [],
    });
    // Existing non-queue aggregates are untouched by the queue view.
    assert.equal(report.specs.active, 1);
    assert.equal(report.now.total, 1);
    assert.equal(report.now.dead, 1);
    assert.equal(report.planning.sessions, 0);
  });

  it('fails a malformed configured queue with its actionable parse error', async () => {
    await writeQueue(tmpDir, '## [broken Title\nDepends on: nothing\n\nBody\n');

    await assert.rejects(
      () => getMetricsReport(tmpDir, DEFAULT_CONFIG),
      /queue\.md: malformed queue item heading/,
    );
  });

  it('projects ordered item rows with state, drift, rejections, and elapsed time', async () => {
    const content = queueContent([
      { slug: 'alpha', title: 'Alpha' },
      { slug: 'beta', title: 'Beta' },
      { slug: 'gamma', title: 'Gamma' },
      { slug: 'delta', title: 'Delta' },
    ]);
    await writeQueue(tmpDir, content);

    await createChange(tmpDir, 'archive', '010-alpha', {
      slug: 'alpha',
      hash: 'sha256:different',
      archivedAt: '2026-09-01T00:02:00.000Z',
      plan: planJsonl([
        {
          id: 'a1',
          start: '2026-09-01T00:00:00.000Z',
          end: '2026-09-01T00:00:30.000Z',
          cost: 0.25,
        },
      ]),
    });
    await createChange(tmpDir, 'active', '011-beta', {
      slug: 'beta',
      hash: sectionHash(content, 'beta'),
      approved: true,
      marker: 'dead',
    });
    await createChange(tmpDir, 'rejected', '012-gamma', {
      slug: 'gamma',
      hash: sectionHash(content, 'gamma'),
      rejected: { reason: 'first reason', timestamp: '2026-09-02T00:00:00.000Z' },
    });
    await createChange(tmpDir, 'rejected', '013-gamma-second', {
      slug: 'gamma',
      hash: sectionHash(content, 'gamma'),
      rejected: null,
    });

    const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

    assert.equal(report.queue.configured, true);
    assert.equal(report.queue.total, 4);
    assert.equal(report.queue.landed, 1);
    assert.deepEqual(
      report.queue.items.map((item) => item.slug),
      ['alpha', 'beta', 'gamma', 'delta'],
    );

    const bySlug = new Map(report.queue.items.map((item) => [item.slug, item]));
    assert.deepEqual(bySlug.get('alpha'), {
      slug: 'alpha',
      title: 'Alpha',
      state: 'landed',
      change: '010',
      rejectionCount: 0,
      changedSincePlanned: true,
      plannedToLandedSeconds: 120,
    });
    assert.equal(bySlug.get('beta')?.state, 'dead');
    assert.equal(bySlug.get('beta')?.change, '011');
    assert.equal(bySlug.get('gamma')?.state, 'rejected');
    assert.equal(bySlug.get('gamma')?.change, '013');
    assert.equal(bySlug.get('gamma')?.rejectionCount, 2);
    assert.deepEqual(bySlug.get('delta'), {
      slug: 'delta',
      title: 'Delta',
      state: 'unplanned',
      change: null,
      rejectionCount: 0,
      changedSincePlanned: false,
      plannedToLandedSeconds: null,
    });

    // One retained rejection per attempt, in numeric change order, with malformed
    // metadata shown as unavailable rather than dropped.
    assert.deepEqual(report.queue.rejections, [
      {
        slug: 'gamma',
        change: '012-gamma',
        reason: 'first reason',
        timestamp: '2026-09-02T00:00:00.000Z',
      },
      { slug: 'gamma', change: '013-gamma-second', reason: 'unavailable', timestamp: null },
    ]);
  });

  it('uses the earliest plan start across attempts and nulls missing or reversed endpoints', async () => {
    const content = queueContent([
      { slug: 'alpha', title: 'Alpha' },
      { slug: 'beta', title: 'Beta' },
      { slug: 'gamma', title: 'Gamma' },
    ]);
    await writeQueue(tmpDir, content);

    // alpha: a rejected attempt started earlier than the archived attempt.
    await createChange(tmpDir, 'archive', '010-alpha', {
      slug: 'alpha',
      hash: sectionHash(content, 'alpha'),
      archivedAt: '2026-09-01T00:05:00.000Z',
      plan: planJsonl([
        { id: 'a2', start: '2026-09-01T00:01:00.000Z', end: '2026-09-01T00:02:00.000Z', cost: 0.1 },
      ]),
    });
    await createChange(tmpDir, 'rejected', '009-alpha', {
      slug: 'alpha',
      hash: sectionHash(content, 'alpha'),
      plan: planJsonl([
        { id: 'a1', start: '2026-09-01T00:00:00.000Z', end: '2026-09-01T00:00:30.000Z', cost: 0.1 },
      ]),
      rejected: { reason: 'superseded', timestamp: '2026-09-01T00:00:31.000Z' },
    });

    // beta: landed but no planning start -> null.
    await createChange(tmpDir, 'archive', '020-beta', {
      slug: 'beta',
      hash: sectionHash(content, 'beta'),
      archivedAt: '2026-09-02T00:05:00.000Z',
    });

    // gamma: plan start after the archive event -> reversed -> null.
    await createChange(tmpDir, 'archive', '030-gamma', {
      slug: 'gamma',
      hash: sectionHash(content, 'gamma'),
      archivedAt: '2026-09-03T00:00:00.000Z',
      plan: planJsonl([
        { id: 'g1', start: '2026-09-03T01:00:00.000Z', end: '2026-09-03T01:01:00.000Z', cost: 0 },
      ]),
    });

    const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);
    const bySlug = new Map(report.queue.items.map((item) => [item.slug, item]));

    assert.equal(bySlug.get('alpha')?.plannedToLandedSeconds, 300);
    assert.equal(bySlug.get('beta')?.plannedToLandedSeconds, null);
    assert.equal(bySlug.get('gamma')?.plannedToLandedSeconds, null);
    assert.equal(report.queue.landed, 3);
  });

  it('reads active dead, regressed, and change-level failure reasons, defaulting to unavailable', async () => {
    const content = queueContent([
      { slug: 'dead', title: 'Dead' },
      { slug: 'regressed', title: 'Regressed' },
      { slug: 'change', title: 'Change' },
      { slug: 'noreason', title: 'No Reason' },
    ]);
    await writeQueue(tmpDir, content);

    await createChange(tmpDir, 'active', '020-dead', {
      slug: 'dead',
      hash: null,
      approved: true,
      marker: 'dead',
      deadReason: 'verify_red',
    });
    await createChange(tmpDir, 'active', '021-regressed', {
      slug: 'regressed',
      hash: null,
      approved: true,
      marker: 'regressed',
      regressedReason: 'scope_regression',
    });
    await createChange(tmpDir, 'active', '022-change', {
      slug: 'change',
      hash: null,
      approved: true,
      marker: 'change-regressed',
      changeReason: 'change_regressed',
    });
    await createChange(tmpDir, 'active', '023-noreason', {
      slug: 'noreason',
      hash: null,
      approved: true,
      marker: 'dead',
      deadReason: null,
    });

    const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

    assert.deepEqual(
      report.queue.failures.map((failure) => [failure.change, failure.target, failure.reason]),
      [
        ['020', '1', 'verify_red'],
        ['021', '1', 'scope_regression'],
        ['022', 'change', 'change_regressed'],
        ['023', '1', 'unavailable'],
      ],
    );
  });

  it('counts queue planning sessions and finite cost across rejected attempts only for the queue block', async () => {
    const content = queueContent([{ slug: 'alpha', title: 'Alpha' }]);
    await writeQueue(tmpDir, content);

    await createChange(tmpDir, 'archive', '010-alpha', {
      slug: 'alpha',
      hash: null,
      archivedAt: '2026-09-01T00:10:00.000Z',
      plan: planJsonl([
        { id: 's1', start: '2026-09-01T00:00:00.000Z', end: '2026-09-01T00:01:00.000Z', cost: 0.5 },
        {
          id: 's2',
          start: '2026-09-01T00:02:00.000Z',
          end: '2026-09-01T00:03:00.000Z',
          cost: 0.25,
        },
      ]),
    });
    await createChange(tmpDir, 'rejected', '011-alpha', {
      slug: 'alpha',
      hash: null,
      rejected: { reason: 'retry', timestamp: '2026-09-02T00:00:00.000Z' },
      plan: planJsonl([
        {
          id: 's3',
          start: '2026-09-02T00:00:00.000Z',
          end: '2026-09-02T00:01:00.000Z',
          cost: null,
        },
      ]),
    });

    const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

    assert.equal(report.queue.planning.sessions, 3);
    assert.equal(report.queue.planning.cost, 0.75);
    assert.equal(report.queue.planning.costCoverageComplete, false);

    // The established global planning block still ignores rejected folders.
    assert.equal(report.planning.sessions, 2);
    assert.equal(report.planning.cost.total, 0.75);
    assert.equal(report.planning.coverage.reportedSessions, 2);
  });

  it('reports complete queue cost coverage when every counted session records finite cost', async () => {
    const content = queueContent([{ slug: 'alpha', title: 'Alpha' }]);
    await writeQueue(tmpDir, content);
    await createChange(tmpDir, 'archive', '010-alpha', {
      slug: 'alpha',
      hash: null,
      archivedAt: '2026-09-01T00:10:00.000Z',
      plan: planJsonl([
        { id: 's1', start: '2026-09-01T00:00:00.000Z', end: '2026-09-01T00:01:00.000Z', cost: 0 },
        { id: 's2', start: '2026-09-01T00:02:00.000Z', end: '2026-09-01T00:03:00.000Z', cost: 1.5 },
      ]),
    });

    const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);
    assert.equal(report.queue.planning.sessions, 2);
    assert.equal(report.queue.planning.cost, 1.5);
    assert.equal(report.queue.planning.costCoverageComplete, true);
  });

  it('renders a concise Queue section and deterministic stable JSON', async () => {
    const content = queueContent([
      { slug: 'alpha', title: 'Alpha' },
      { slug: 'beta', title: 'Beta' },
    ]);
    await writeQueue(tmpDir, content);
    await createChange(tmpDir, 'archive', '010-alpha', {
      slug: 'alpha',
      hash: null,
      archivedAt: '2026-09-01T00:02:00.000Z',
      plan: planJsonl([
        { id: 'a1', start: '2026-09-01T00:00:00.000Z', end: '2026-09-01T00:00:30.000Z', cost: 0.5 },
      ]),
    });
    await createChange(tmpDir, 'active', '011-beta', {
      slug: 'beta',
      hash: null,
      approved: true,
      marker: 'dead',
      deadReason: 'verify_red',
    });
    await createChange(tmpDir, 'rejected', '012-beta-old', {
      slug: 'beta',
      hash: null,
      rejected: { reason: 'first attempt', timestamp: '2026-08-01T00:00:00.000Z' },
    });

    const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);
    const text = formatMetricsReport(report);

    assert.ok(text.includes('Queue:'));
    assert.ok(text.includes('Landed: 1 of 2 items'));
    assert.ok(text.includes('Planning sessions: 1, recorded cost: $0.50'));
    assert.ok(text.includes('Cost coverage: complete'));
    assert.ok(text.includes('alpha: 2m'));
    assert.ok(text.includes('011 1 (reason: verify_red)'));
    assert.ok(
      text.includes('beta 012-beta-old (reason: first attempt, at: 2026-08-01T00:00:00.000Z)'),
    );

    let captured = '';
    const raw = await reportCommand({
      cwd: tmpDir,
      config: DEFAULT_CONFIG,
      json: true,
      stdout: (msg) => {
        captured = msg;
      },
    });
    const parsed = JSON.parse(captured || raw) as MetricsReport;
    assert.equal(parsed.queue.configured, true);
    assert.equal(parsed.queue.landed, 1);
    assert.equal(parsed.queue.total, 2);

    const again = await reportCommand({
      cwd: tmpDir,
      config: DEFAULT_CONFIG,
      json: true,
      stdout: () => {},
    });
    assert.equal(raw, again);
  });

  it('renders an unconfigured Queue section for a repository without a queue', async () => {
    const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);
    const text = formatMetricsReport(report);
    assert.ok(text.includes('Queue:'));
    assert.ok(text.includes('(not configured)'));
  });

  it('keeps the checked-in report fixture unconfigured without a queue file', async () => {
    const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);
    assert.equal(report.queue.configured, false);
    assert.deepEqual(report.queue.items, []);
    assert.deepEqual(report.queue.failures, []);
    assert.deepEqual(report.queue.rejections, []);
  });
});
