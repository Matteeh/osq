import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { reportCommand, toStableMetrics } from '../src/cli/report.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { formatMetricsReport, getMetricsReport } from '../src/core/report/report.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** The default config with a traceability block, so mutation scores apply. */
function traceConfig(capabilities: 'all' | readonly string[]): OsqConfig {
  return {
    ...DEFAULT_CONFIG,
    limits: { ...DEFAULT_CONFIG.limits },
    traceability: { capabilities, mode: 'warn' },
  };
}

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-flaky-'));
  tmpDirs.push(root);
  await fs.mkdir(path.join(root, 'openspec', 'changes'), { recursive: true });
  return root;
}

async function writeFile(root: string, relative: string, content: string): Promise<void> {
  const full = path.join(root, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

/** One active change with a proposal and a single task. */
async function writeChange(root: string, change: string): Promise<void> {
  await writeFile(
    root,
    `openspec/changes/${change}/proposal.md`,
    '---\ntitle: Change\nverify: node verify.cjs\n---\n## Goal\n\nChange.\n',
  );
  await writeFile(
    root,
    `openspec/changes/${change}/tasks/1.md`,
    '---\ntitle: Task 1\nverify: node verify.cjs\nscope: []\nentry: []\nskills: []\n---\n## Acceptance\n- [ ] passes\n',
  );
}

/** Append hand-written events to one numbered task stream. */
async function writeEvents(
  root: string,
  change: string,
  task: string,
  events: readonly unknown[],
): Promise<void> {
  const lines = events.map((event) => JSON.stringify(event)).join('\n');
  await writeFile(root, `openspec/changes/${change}/.run/events/${task}.jsonl`, `${lines}\n`);
}

interface RerunEventInput {
  readonly tests: readonly string[];
  readonly passed?: boolean;
  readonly rerun?: number;
  readonly timestamp?: string;
}

/** One hand-written `change_verify_rerun` event. */
function rerunEvent(input: RerunEventInput): Record<string, unknown> {
  return {
    type: 'change_verify_rerun',
    timestamp: input.timestamp ?? '2026-09-18T00:00:00.000Z',
    data: {
      rerun: input.rerun ?? 1,
      tests: input.tests,
      passed: input.passed ?? true,
    },
  };
}

describe('report flaky tests', () => {
  it('counts passing reruns across changes and orders them by count then path', async () => {
    const root = await tempRoot();
    await writeChange(root, '160-flaky-a');
    await writeChange(root, '161-flaky-b');
    await writeEvents(root, '160-flaky-a', '1', [
      rerunEvent({ tests: ['tests/a.test.ts', 'tests/b.test.ts'] }),
    ]);
    await writeEvents(root, '161-flaky-b', '2', [rerunEvent({ tests: ['tests/a.test.ts'] })]);
    await writeEvents(root, '161-flaky-b', '3', [
      rerunEvent({ tests: ['tests/c.test.ts'], passed: false }),
    ]);

    const config = DEFAULT_CONFIG;
    const report = await getMetricsReport(root, config);
    assert.deepEqual(report.flakyTests, [
      { test: 'tests/a.test.ts', count: 2 },
      { test: 'tests/b.test.ts', count: 1 },
    ]);

    const lines = formatMetricsReport(report, config).split('\n');
    const headingIndex = lines.indexOf('Flaky tests:');
    assert.ok(headingIndex >= 0, lines.join('\n'));
    assert.equal(lines[headingIndex + 1], '  tests/a.test.ts: 2');
    assert.equal(lines[headingIndex + 2], '  tests/b.test.ts: 1');

    const stable = toStableMetrics(report) as { flakyTests?: unknown };
    assert.deepEqual(stable.flakyTests, [
      { test: 'tests/a.test.ts', count: 2 },
      { test: 'tests/b.test.ts', count: 1 },
    ]);

    const raw = await reportCommand({ cwd: root, config, json: true, stdout: () => {} });
    const parsed = JSON.parse(raw) as { flakyTests?: unknown };
    assert.deepEqual(parsed.flakyTests, [
      { test: 'tests/a.test.ts', count: 2 },
      { test: 'tests/b.test.ts', count: 1 },
    ]);
  });

  it('prints the section between the mutation and validation sections', async () => {
    const root = await tempRoot();
    await writeChange(root, '160-flaky');
    await writeEvents(root, '160-flaky', '1', [
      {
        type: 'mutation_ran',
        timestamp: '2026-09-18T00:00:00.000Z',
        data: {
          file: 'src/pricing/quote.ts',
          function: 'quote',
          ranges: ['src/pricing/quote.ts:1-2'],
          scenarios: ['pricing: Volume discount tiers'],
          tests: ['tests/pricing-quote.test.ts'],
          outcome: 'measured',
          killed: 1,
          survived: 0,
          invalid: 0,
          survivors: [],
          duration: 1,
          exitCode: 0,
        },
      },
      rerunEvent({ tests: ['tests/a.test.ts'] }),
    ]);
    await writeFile(
      root,
      'openspec/changes/archive/159-validated/.run/events/change.jsonl',
      `${JSON.stringify({
        type: 'validator_ran',
        timestamp: '2026-09-18T00:00:00.000Z',
        data: { outcome: 'validated', harness: 'claude', model: 'opus', findings: [] },
      })}\n`,
    );
    const config = traceConfig(['pricing']);

    const report = await getMetricsReport(root, config);
    const lines = formatMetricsReport(report, config).split('\n');
    const mutationIndex = lines.indexOf('Mutation:');
    const flakyIndex = lines.indexOf('Flaky tests:');
    const validationIndex = lines.indexOf('Validation:');
    assert.ok(mutationIndex >= 0, lines.join('\n'));
    assert.ok(flakyIndex > mutationIndex, lines.join('\n'));
    assert.ok(validationIndex > flakyIndex, lines.join('\n'));
  });

  it('counts a test once per event that names it twice and breaks ties by path', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-dup');
    await writeEvents(root, '001-dup', '1', [
      rerunEvent({ tests: ['tests/b.test.ts', 'tests/b.test.ts'] }),
      rerunEvent({ tests: ['tests/a.test.ts'] }),
    ]);

    const report = await getMetricsReport(root, DEFAULT_CONFIG);
    assert.deepEqual(report.flakyTests, [
      { test: 'tests/a.test.ts', count: 1 },
      { test: 'tests/b.test.ts', count: 1 },
    ]);
  });

  it('leaves the text and JSON unchanged when no passing rerun event exists', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-plain');
    await writeEvents(root, '001-plain', '1', [
      rerunEvent({ tests: ['tests/c.test.ts'], passed: false }),
    ]);
    const config = DEFAULT_CONFIG;

    const report = await getMetricsReport(root, config);
    assert.equal(report.flakyTests, undefined);
    const text = formatMetricsReport(report, config);
    assert.equal(text.includes('Flaky tests:'), false, text);
    const stable = toStableMetrics(report) as Record<string, unknown>;
    assert.equal('flakyTests' in stable, false);

    const raw = await reportCommand({ cwd: root, config, json: true, stdout: () => {} });
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assert.equal('flakyTests' in parsed, false);

    const empty = await getMetricsReport(await tempRoot(), config);
    assert.equal(empty.flakyTests, undefined);
  });
});
