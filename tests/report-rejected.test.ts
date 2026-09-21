import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { reportCommand } from '../src/cli/report.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { formatMetricsReport, getMetricsReport } from '../src/core/report.js';

const TASK = `---
title: Task One
verify: node -e "process.exit(0)"
scope: []
entry: []
skills: []
---
## Acceptance
- [ ] does the thing
`;

const PLAN_STARTED =
  '{"type":"plan_started","sessionId":"s1","timestamp":"2026-01-01T00:00:00.000Z","data":{"harness":"opencode","model":"m","osqVersion":"0.1.0","briefHash":"sha256:x"}}';
const PLAN_EXITED =
  '{"type":"plan_exited","sessionId":"s1","timestamp":"2026-01-01T00:00:30.000Z","data":{"exitCode":0,"wallSeconds":30,"usage":{"inputTokens":10,"outputTokens":5,"cachedTokens":0,"reasoningTokens":0,"cost":0.1}}}';

const TASK_EVENTS = [
  '{"type":"started","timestamp":"2026-01-01T00:00:00.000Z","data":{"attempt":1}}',
  '{"type":"tokens","timestamp":"2026-01-01T00:00:01.000Z","data":{"input":100,"output":50,"cost":0.5}}',
  '{"type":"exited","timestamp":"2026-01-01T00:00:02.000Z","data":{}}',
].join('\n');

interface RejectedFixture {
  readonly planner?: string | null;
  readonly events: string;
  readonly marker?: string | null;
}

async function makeRejected(root: string, folder: string, fixture: RejectedFixture): Promise<void> {
  const folderPath = path.join(root, 'openspec', 'changes', 'rejected', folder);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.mkdir(path.join(folderPath, '.run', 'events'), { recursive: true });
  await fs.mkdir(path.join(folderPath, '.run', 'done'), { recursive: true });

  const plannerLine =
    fixture.planner === undefined || fixture.planner === null
      ? ''
      : `planner: ${fixture.planner}\n`;
  await fs.writeFile(
    path.join(folderPath, 'brief.md'),
    `---\ntitle: ${folder}\ndate: 2026-01-01\n${plannerLine}---\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(folderPath, 'proposal.md'),
    `---\ntitle: ${folder}\nverify: node -e "process.exit(0)"\n---\n## Goal\nx\n`,
    'utf8',
  );
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), TASK, 'utf8');
  await fs.writeFile(path.join(folderPath, '.run', 'done', '1'), '', 'utf8');
  await fs.writeFile(path.join(folderPath, '.run', 'events', '1.jsonl'), TASK_EVENTS, 'utf8');
  await fs.writeFile(
    path.join(folderPath, '.run', 'plan.jsonl'),
    `${PLAN_STARTED}\n${PLAN_EXITED}\n`,
    'utf8',
  );
  await fs.writeFile(path.join(folderPath, '.run', 'events', 'change.jsonl'), fixture.events, {
    encoding: 'utf8',
  });

  if (fixture.marker !== null) {
    await fs.writeFile(
      path.join(folderPath, '.run', 'rejected.md'),
      fixture.marker ?? '---\nreason: "stopped"\ntimestamp: "2026-01-03T00:00:00.000Z"\n---\n',
      'utf8',
    );
  }
}

interface RejectedSeed {
  readonly folder: string;
  readonly planner?: string | null;
  readonly events: string;
  readonly marker?: string | null;
}

const SEEDS: readonly RejectedSeed[] = [
  {
    folder: '060-rejected-alpha',
    planner: 'opencode/big-pickle',
    events: [
      '{"type":"rejected","timestamp":"2026-01-03T00:00:00.000Z","data":{"reason":"alpha"}}',
      'not json at all',
      '{"type":"rejected"',
      '{"type":"rejected","timestamp":"2026-01-03T00:00:01.000Z","data":{"reason":"alpha again"}}',
    ].join('\n'),
  },
  { folder: '061-rejected-unknown', events: '{"type":"rejected","data":{"reason":"b"}}' },
  {
    folder: '062-rejected-handmoved',
    planner: 'codex/gpt',
    events: '{"type":"archived","timestamp":"2026-01-03T00:00:00.000Z"}',
  },
  {
    folder: '063-rejected-gamma',
    planner: 'codex/gpt',
    events: '{"type":"rejected","data":{"reason":"c"}}',
  },
];

describe('osq report rejection history', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-rejected-'));
    await fs.mkdir(path.join(tmpDir, 'openspec', 'changes'), { recursive: true });
    for (const seed of SEEDS) {
      await makeRejected(tmpDir, seed.folder, seed);
    }
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('counts each rejected folder once only when a valid rejected event exists', async () => {
    const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

    assert.equal(report.history.rejections.total, 3);
    assert.deepEqual(report.history.rejections.byPlannerModel, {
      'codex/gpt': 1,
      'opencode/big-pickle': 1,
      unknown: 1,
    });
    assert.deepEqual(Object.keys(report.history.rejections.byPlannerModel), [
      'codex/gpt',
      'opencode/big-pickle',
      'unknown',
    ]);
  });

  it('groups a missing or empty planner value as unknown', async () => {
    await makeRejected(tmpDir, '064-rejected-empty-planner', {
      planner: '""',
      events: '{"type":"rejected","data":{"reason":"d"}}',
    });

    const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);
    assert.equal(report.history.rejections.total, 4);
    assert.equal(report.history.rejections.byPlannerModel.unknown, 2);
  });

  it('excludes rejected artifacts from every non-rejection aggregate', async () => {
    const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);

    assert.equal(report.specs.total, 0);
    assert.equal(report.specs.active, 0);
    assert.equal(report.specs.archived, 0);

    assert.equal(report.now.total, 0);
    assert.equal(report.now.done, 0);
    assert.equal(report.completionRate, 0);

    assert.equal(report.history.attempts.total, 0);
    assert.deepEqual(report.history.deadByReason, {});

    assert.equal(report.coverage.withEvents, 0);
    assert.equal(report.coverage.withoutEvents, 0);

    assert.equal(report.planning.sessions, 0);
    assert.equal(report.planning.wallSeconds, 0);
    assert.equal(report.planning.tokens.input, 0);

    assert.equal(report.cycle.byChange.length, 0);
    assert.equal(report.tokens.input, 0);
    assert.equal(report.fileChanges.totalChanges, 0);
  });

  it('renders rejection totals and planner-model counts in the History text section', async () => {
    const report = await getMetricsReport(tmpDir, DEFAULT_CONFIG);
    const formatted = formatMetricsReport(report);

    assert.ok(formatted.includes('History:'));
    assert.ok(formatted.includes('Rejections: 3'));
    assert.ok(formatted.includes('Rejections by planner model:'));
    assert.ok(formatted.includes('codex/gpt: 1'));
    assert.ok(formatted.includes('opencode/big-pickle: 1'));
    assert.ok(formatted.includes('unknown: 1'));
  });

  it('exposes history.rejections through the JSON report command', async () => {
    const raw = await reportCommand({ cwd: tmpDir, json: true, stdout: () => {} });
    const parsed = JSON.parse(raw) as {
      history: { rejections: { total: number; byPlannerModel: Record<string, number> } };
    };

    assert.equal(parsed.history.rejections.total, 3);
    assert.deepEqual(parsed.history.rejections.byPlannerModel, {
      'codex/gpt': 1,
      'opencode/big-pickle': 1,
      unknown: 1,
    });
  });
});
