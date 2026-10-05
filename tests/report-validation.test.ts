import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { reportCommand } from '../src/cli/report.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { buildMetricsReport, formatMetricsReport } from '../src/core/report/report.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempRoot(): Promise<{ root: string; home: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-validation-'));
  tmpDirs.push(dir);
  const root = path.join(dir, 'project');
  const home = path.join(dir, 'home');
  await fs.mkdir(path.join(root, 'openspec', 'changes', 'archive'), { recursive: true });
  await fs.mkdir(home, { recursive: true });
  return { root, home };
}

async function writeFile(root: string, relative: string, content: string): Promise<void> {
  const full = path.join(root, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

/** One archived change with a task file, optionally carrying change events. */
async function writeArchivedChange(
  root: string,
  change: string,
  events?: readonly Record<string, unknown>[],
): Promise<void> {
  await writeFile(
    root,
    `openspec/changes/archive/${change}/proposal.md`,
    '---\ntitle: Change\nverify: node verify.cjs\n---\n## Goal\n\nChange.\n',
  );
  await writeFile(
    root,
    `openspec/changes/archive/${change}/tasks/1.md`,
    '---\ntitle: Task 1\nverify: node verify.cjs\nscope: []\nentry: []\nskills: []\n---\n## Acceptance\n- [ ] passes\n',
  );
  if (events === undefined) return;
  const lines = events.map((event) => JSON.stringify(event)).join('\n');
  await writeFile(
    root,
    `openspec/changes/archive/${change}/.run/events/change.jsonl`,
    `${lines}\n`,
  );
}

/** One `validator_ran` event, with findings defaulted per outcome. */
function validatorEvent(
  outcome: string,
  findings: readonly Record<string, unknown>[] = [],
  timestamp = '2026-10-01T00:00:00.000Z',
): Record<string, unknown> {
  return {
    type: 'validator_ran',
    timestamp,
    data: { outcome, findings },
  };
}

/** One finding object; only its presence matters to the report. */
function finding(): Record<string, unknown> {
  return {
    kind: 'scenario',
    capability: 'pricing',
    requirement: 'Quote',
    scenario: 'A quote',
    problem: 'no_test',
    detail: 'nothing checks it.',
  };
}

describe('report validation', () => {
  it('returns undefined and leaves the report unchanged when no change ran a validator', async () => {
    const { root, home } = await tempRoot();
    await writeArchivedChange(root, '040-a', [
      { type: 'archived', timestamp: '2026-10-01T00:00:00.000Z', data: {} },
    ]);

    const report = await buildMetricsReport(root, DEFAULT_CONFIG, { home });
    assert.equal(report.validation, undefined);

    const text = formatMetricsReport(report, DEFAULT_CONFIG);
    assert.ok(!text.includes('Validation:'), text);

    const json = await reportCommand({
      cwd: root,
      config: DEFAULT_CONFIG,
      home,
      json: true,
      stdout: () => {},
    });
    const parsed = JSON.parse(json) as Record<string, unknown>;
    assert.ok(!('validation' in parsed), json);
    assert.ok(!json.includes('Validation:'), json);
  });

  it('counts two validated changes and one failed in folder name order', async () => {
    const { root, home } = await tempRoot();
    await writeArchivedChange(root, '042-c', [validatorEvent('failed')]);
    await writeArchivedChange(root, '040-a', [validatorEvent('validated', [finding(), finding()])]);
    await writeArchivedChange(root, '041-b', [validatorEvent('validated')]);

    const report = await buildMetricsReport(root, DEFAULT_CONFIG, { home });
    assert.deepEqual(report.validation, {
      changes: 3,
      validated: 2,
      findings: 2,
      perChange: [
        { change: '040-a', outcome: 'validated', findings: 2 },
        { change: '041-b', outcome: 'validated', findings: 0 },
        { change: '042-c', outcome: 'failed', findings: 0 },
      ],
    });

    const text = formatMetricsReport(report, DEFAULT_CONFIG);
    for (const line of [
      'Validation:',
      '  2 of 3 changes validated, 2 findings',
      '  040-a: 2 findings',
      '  041-b: 0 findings',
      '  042-c: not validated (failed)',
    ]) {
      assert.ok(text.includes(line), `${line}\n${text}`);
    }

    const json = await reportCommand({
      cwd: root,
      config: DEFAULT_CONFIG,
      home,
      json: true,
      stdout: () => {},
    });
    const parsed = JSON.parse(json) as { validation: unknown };
    assert.deepEqual(parsed.validation, {
      changes: 3,
      validated: 2,
      findings: 2,
      perChange: [
        { change: '040-a', outcome: 'validated', findings: 2 },
        { change: '041-b', outcome: 'validated', findings: 0 },
        { change: '042-c', outcome: 'failed', findings: 0 },
      ],
    });
  });

  it('takes the latest event per change, regardless of order in the stream', async () => {
    const { root, home } = await tempRoot();
    await writeArchivedChange(root, '040-a', [
      validatorEvent('failed', [finding()], '2026-10-01T00:00:00.000Z'),
      validatorEvent('validated', [finding()], '2026-10-02T00:00:00.000Z'),
    ]);
    await writeArchivedChange(root, '041-b', [
      validatorEvent('validated', [], '2026-10-03T00:00:00.000Z'),
      validatorEvent('timed_out', [], '2026-10-04T00:00:00.000Z'),
    ]);

    const report = await buildMetricsReport(root, DEFAULT_CONFIG, { home });
    assert.deepEqual(report.validation, {
      changes: 2,
      validated: 1,
      findings: 1,
      perChange: [
        { change: '040-a', outcome: 'validated', findings: 1 },
        { change: '041-b', outcome: 'timed_out', findings: 0 },
      ],
    });

    const text = formatMetricsReport(report, DEFAULT_CONFIG);
    assert.ok(text.includes('  041-b: not validated (timed_out)'), text);
  });

  it('counts findings only for validated runs', async () => {
    const { root, home } = await tempRoot();
    await writeArchivedChange(root, '040-a', [validatorEvent('unreadable', [finding()])]);
    await writeArchivedChange(root, '041-b', [validatorEvent('validated', [finding()])]);

    const report = await buildMetricsReport(root, DEFAULT_CONFIG, { home });
    assert.equal(report.validation?.findings, 1);
    assert.deepEqual(report.validation?.perChange, [
      { change: '040-a', outcome: 'unreadable', findings: 0 },
      { change: '041-b', outcome: 'validated', findings: 1 },
    ]);
  });

  it('ignores malformed validator events and changes without a change stream', async () => {
    const { root, home } = await tempRoot();
    await writeArchivedChange(root, '040-a');
    await writeArchivedChange(root, '041-b', [
      { type: 'validator_ran', timestamp: '2026-10-01T00:00:00.000Z', data: {} },
      { type: 'validator_ran', timestamp: 'not-a-date', data: { outcome: 'validated' } },
      { type: 'other', timestamp: '2026-10-01T00:00:00.000Z', data: { outcome: 'validated' } },
    ]);

    const report = await buildMetricsReport(root, DEFAULT_CONFIG, { home });
    assert.equal(report.validation, undefined);
  });

  it('prints the Validation section after the Mutation section', async () => {
    const { root, home } = await tempRoot();
    await writeArchivedChange(root, '040-a', [validatorEvent('validated', [finding()])]);
    await writeFile(
      root,
      'openspec/changes/archive/040-a/.run/events/1.jsonl',
      `${JSON.stringify({
        type: 'mutation_ran',
        timestamp: '2026-10-01T00:00:00.000Z',
        data: {
          file: 'src/pricing/quote.ts',
          function: 'quote',
          scenarios: ['pricing: Volume discount tiers'],
          outcome: 'measured',
          killed: 1,
          survived: 0,
          survivors: [],
        },
      })}\n`,
    );
    const config: OsqConfig = {
      ...DEFAULT_CONFIG,
      limits: { ...DEFAULT_CONFIG.limits },
      traceability: { capabilities: ['pricing'], mode: 'warn' },
    };

    const report = await buildMetricsReport(root, config, { home });
    const text = formatMetricsReport(report, config);
    const mutationAt = text.indexOf('Mutation:');
    const validationAt = text.indexOf('Validation:');
    assert.ok(mutationAt >= 0, text);
    assert.ok(validationAt > mutationAt, text);
  });
});
