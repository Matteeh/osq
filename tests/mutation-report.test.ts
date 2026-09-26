import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { reportCommand } from '../src/cli/report.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { formatMetricsReport, getMetricsReport } from '../src/core/report/report.js';
import { formatSpecDetails, getSpecDetailsFromFolder } from '../src/core/status/show.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** The default project config with a traceability block. */
function traceConfig(capabilities: 'all' | readonly string[]): OsqConfig {
  return {
    ...DEFAULT_CONFIG,
    limits: { ...DEFAULT_CONFIG.limits },
    traceability: { capabilities, mode: 'warn' },
  };
}

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-mutation-report-'));
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

interface MutationEventInput {
  readonly file?: string;
  readonly function?: string;
  readonly scenarios?: readonly string[];
  readonly outcome?: 'measured' | 'not_measured';
  readonly killed?: number;
  readonly survived?: number;
  readonly invalid?: number;
  readonly survivors?: readonly unknown[];
  readonly reason?: string;
  readonly timestamp?: string;
}

/** One hand-written `mutation_ran` event. */
function mutationEvent(input: MutationEventInput = {}): Record<string, unknown> {
  return {
    type: 'mutation_ran',
    timestamp: input.timestamp ?? '2026-09-18T00:00:00.000Z',
    data: {
      file: input.file ?? 'src/pricing/quote.ts',
      function: input.function ?? 'quote',
      ranges: ['src/pricing/quote.ts:20-24', 'src/pricing/quote.ts:33-39'],
      scenarios: input.scenarios ?? ['pricing: Volume discount tiers'],
      tests: ['tests/pricing-quote.test.ts'],
      outcome: input.outcome ?? 'measured',
      killed: input.killed ?? 0,
      survived: input.survived ?? 0,
      invalid: input.invalid ?? 0,
      survivors: input.survivors ?? [],
      duration: 2.7,
      exitCode: 0,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    },
  };
}

/** One survivor with the recorded replacement. */
function survivor(
  line = 36,
  column = 19,
  mutator = 'ConditionalExpression',
  replacement = 'false',
  file = 'src/pricing/quote.ts',
): Record<string, unknown> {
  return { file, line, column, mutator, replacement };
}

const MEASURES_START = {
  type: 'measures',
  timestamp: '2026-09-18T00:00:00.000Z',
  data: { phase: 'start', scopeResolver: 2, scopeFiles: 1 },
};

describe('report mutation scores', () => {
  it('takes the latest measurement per function and lists only its survivors', async () => {
    const root = await tempRoot();
    await writeChange(root, '083-traceability-mutation');
    await writeChange(root, '084-followup');
    await writeEvents(root, '083-traceability-mutation', '1', [
      mutationEvent({
        timestamp: '2026-09-18T00:00:01.000Z',
        killed: 17,
        survived: 2,
        survivors: [survivor(30), survivor(31)],
      }),
    ]);
    await writeEvents(root, '084-followup', '1', [
      mutationEvent({
        timestamp: '2026-09-19T00:00:00.000Z',
        killed: 18,
        survived: 1,
        survivors: [survivor()],
      }),
    ]);
    const config = traceConfig(['pricing']);

    const report = await getMetricsReport(root, config);
    assert.deepEqual(report.mutation, [
      {
        capability: 'pricing',
        killed: 18,
        survived: 1,
        score: 0.947,
        survivors: [
          {
            file: 'src/pricing/quote.ts',
            function: 'quote',
            line: 36,
            column: 19,
            mutator: 'ConditionalExpression',
            replacement: 'false',
          },
        ],
      },
    ]);

    const text = formatMetricsReport(report, config);
    assert.ok(text.includes('Mutation:'), text);
    assert.ok(
      text.includes('  pricing: 18 of 19 killed (94.7%), 1 survivors not yet reviewed'),
      text,
    );
    assert.ok(
      text.includes('    survived: src/pricing/quote.ts:36:19 ConditionalExpression -> false'),
      text,
    );

    const commandText = await reportCommand({ cwd: root, config, stdout: () => {} });
    assert.ok(
      commandText.includes('  pricing: 18 of 19 killed (94.7%), 1 survivors not yet reviewed'),
      commandText,
    );

    const raw = await reportCommand({ cwd: root, config, json: true, stdout: () => {} });
    const parsed = JSON.parse(raw) as { mutation: unknown };
    assert.deepEqual(parsed.mutation, [
      {
        capability: 'pricing',
        killed: 18,
        survived: 1,
        score: 0.947,
        survivors: [
          {
            column: 19,
            file: 'src/pricing/quote.ts',
            function: 'quote',
            line: 36,
            mutator: 'ConditionalExpression',
            replacement: 'false',
          },
        ],
      },
    ]);
  });

  it('groups a shared measurement by each named capability in name order', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-multi');
    await writeEvents(root, '001-multi', '1', [
      mutationEvent({
        scenarios: ['zeta: Z scenario', 'alpha: A scenario'],
        killed: 3,
        survived: 1,
        survivors: [survivor()],
      }),
    ]);

    const report = await getMetricsReport(root, traceConfig('all'));
    assert.deepEqual(
      report.mutation?.map((entry) => entry.capability),
      ['alpha', 'zeta'],
    );
    assert.deepEqual(report.mutation?.[0], {
      capability: 'alpha',
      killed: 3,
      survived: 1,
      score: 0.75,
      survivors: [
        {
          file: 'src/pricing/quote.ts',
          function: 'quote',
          line: 36,
          column: 19,
          mutator: 'ConditionalExpression',
          replacement: 'false',
        },
      ],
    });
    assert.equal(report.mutation?.[1]?.score, 0.75);
  });

  it('mentions only the opted-in capability a measurement names', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-filter');
    await writeEvents(root, '001-filter', '1', [
      mutationEvent({ scenarios: ['pricing: Volume discount tiers', 'billing: Invoices'] }),
    ]);

    const report = await getMetricsReport(root, traceConfig(['billing']));
    assert.deepEqual(
      report.mutation?.map((entry) => entry.capability),
      ['billing'],
    );
  });

  it('leaves the text and JSON unchanged when no stream holds a measured event', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-plain');
    await writeEvents(root, '001-plain', '1', [
      mutationEvent({
        timestamp: '2026-09-18T00:00:01.000Z',
        outcome: 'not_measured',
        reason: 'budget',
      }),
    ]);
    const config = traceConfig(['pricing']);

    const report = await getMetricsReport(root, config);
    assert.equal(report.mutation, undefined);
    assert.equal(formatMetricsReport(report, config).includes('Mutation:'), false);

    const raw = await reportCommand({ cwd: root, config, json: true, stdout: () => {} });
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assert.equal('mutation' in parsed, false);

    const text = await reportCommand({ cwd: root, config, stdout: () => {} });
    assert.equal(text.includes('Mutation:'), false, text);

    const empty = await getMetricsReport(await tempRoot(), config);
    assert.equal(empty.mutation, undefined);
  });

  it('leaves the report unchanged when no capability is opted in', async () => {
    const root = await tempRoot();
    await writeChange(root, '001-off');
    await writeEvents(root, '001-off', '1', [mutationEvent({ killed: 18, survived: 1 })]);
    const config = traceConfig([]);

    const report = await getMetricsReport(root, config);
    assert.equal(report.mutation, undefined);
    assert.equal(formatMetricsReport(report, config).includes('Mutation:'), false);

    const raw = await reportCommand({ cwd: root, config, json: true, stdout: () => {} });
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assert.equal('mutation' in parsed, false);
  });
});

describe('show mutation', () => {
  it('prints the mutation entry and each survivor after the focused runs', async () => {
    const root = await tempRoot();
    const changeDir = path.join(root, 'openspec', 'changes', '001-pricing');
    await writeChange(root, '001-pricing');
    await writeEvents(root, '001-pricing', '1', [
      MEASURES_START,
      {
        type: 'focused_ran',
        timestamp: '2026-09-18T00:00:01.000Z',
        data: {
          outcome: 'passed',
          duration: 0.13,
          command: 'node --test',
          files: [],
          scenarios: [],
        },
      },
      mutationEvent({
        timestamp: '2026-09-18T00:00:02.000Z',
        killed: 18,
        survived: 1,
        survivors: [survivor()],
      }),
    ]);

    const details = await getSpecDetailsFromFolder(
      root,
      changeDir,
      'active',
      traceConfig(['pricing']),
    );
    const lines = formatSpecDetails(details).split('\n');

    const focusedIndex = lines.findIndex((line) => line.startsWith('      Focused runs:'));
    const mutationIndex = lines.findIndex((line) => line.startsWith('      Mutation:'));
    assert.ok(focusedIndex >= 0, lines.join('\n'));
    assert.ok(mutationIndex > focusedIndex, lines.join('\n'));
    assert.equal(
      lines[mutationIndex],
      '      Mutation: src/pricing/quote.ts#quote 18 of 19 killed',
    );
    assert.equal(
      lines[mutationIndex + 1],
      '        Survived: src/pricing/quote.ts:36:19 ConditionalExpression -> false',
    );
  });

  it('prints a not-measured entry with its reason', async () => {
    const root = await tempRoot();
    const changeDir = path.join(root, 'openspec', 'changes', '002-broken');
    await writeChange(root, '002-broken');
    await writeEvents(root, '002-broken', '1', [
      MEASURES_START,
      mutationEvent({
        timestamp: '2026-09-18T00:00:02.000Z',
        outcome: 'not_measured',
        reason: 'report_invalid',
      }),
    ]);

    const details = await getSpecDetailsFromFolder(
      root,
      changeDir,
      'active',
      traceConfig(['pricing']),
    );
    assert.ok(
      formatSpecDetails(details).includes(
        '      Mutation: src/pricing/quote.ts#quote not measured (report_invalid)',
      ),
    );
  });

  it('shows only mutation events after the last measures start', async () => {
    const root = await tempRoot();
    const changeDir = path.join(root, 'openspec', 'changes', '003-retry');
    await writeChange(root, '003-retry');
    await writeEvents(root, '003-retry', '1', [
      MEASURES_START,
      mutationEvent({ timestamp: '2026-09-18T00:00:01.000Z', killed: 18, survived: 1 }),
      {
        type: 'measures',
        timestamp: '2026-09-18T00:00:02.000Z',
        data: { phase: 'start', scopeResolver: 2, scopeFiles: 1 },
      },
      mutationEvent({
        timestamp: '2026-09-18T00:00:03.000Z',
        outcome: 'not_measured',
        reason: 'command_failed',
      }),
    ]);

    const details = await getSpecDetailsFromFolder(
      root,
      changeDir,
      'active',
      traceConfig(['pricing']),
    );
    const text = formatSpecDetails(details);
    assert.ok(
      text.includes('      Mutation: src/pricing/quote.ts#quote not measured (command_failed)'),
      text,
    );
    assert.equal(text.includes('18 of 19 killed'), false, text);
  });

  it('prints no mutation line for a task with no mutation events', async () => {
    const root = await tempRoot();
    const changeDir = path.join(root, 'openspec', 'changes', '004-clean');
    await writeChange(root, '004-clean');
    await writeEvents(root, '004-clean', '1', [MEASURES_START]);

    const details = await getSpecDetailsFromFolder(
      root,
      changeDir,
      'active',
      traceConfig(['pricing']),
    );
    assert.equal(formatSpecDetails(details).includes('Mutation:'), false);
  });
});
