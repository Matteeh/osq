import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { runMutationPick } from '../src/core/run/mutation-run.js';
import type { MutationPick } from '../src/core/trace/mutation-pick.js';

const roots: string[] = [];
const COMMAND = 'node fake-mutate.cjs {mutate} {tests} {report}';
const QUOTE = 'src/pricing/quote.ts';
const RANGES = [`${QUOTE}:20-24`, `${QUOTE}:33-39`];
const TESTS = ['tests/pricing-quote.test.ts'];

/** A fake mutation command that records its arguments and environment. */
const FAKE_COMMAND = [
  "const fs = require('node:fs');",
  'fs.writeFileSync(process.env.OSQ_FAKE_RECORD, JSON.stringify({',
  '  argv: process.argv.slice(2),',
  '  mutate: process.env.OSQ_MUTATE ?? null,',
  '  tests: process.env.OSQ_MUTATION_TESTS ?? null,',
  '  report: process.env.OSQ_MUTATION_REPORT ?? null,',
  '  change: process.env.OSQ_CHANGE ?? null,',
  '}));',
  'const mode = process.env.OSQ_FAKE_MODE;',
  "if (mode === 'fail') process.exit(2);",
  "if (mode === 'timeout') { setInterval(() => {}, 1000); }",
  "else if (mode !== 'no-report') {",
  '  fs.writeFileSync(process.env.OSQ_MUTATION_REPORT, process.env.OSQ_FAKE_REPORT ?? "{}");',
  '}',
].join('\n');

afterEach(async () => {
  while (roots.length > 0) {
    await fs.rm(roots.pop() ?? '', { recursive: true, force: true });
  }
  Reflect.deleteProperty(process.env, 'OSQ_FAKE_RECORD');
  Reflect.deleteProperty(process.env, 'OSQ_FAKE_MODE');
  Reflect.deleteProperty(process.env, 'OSQ_FAKE_REPORT');
});

async function makeProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-mutation-run-'));
  roots.push(root);
  await fs.writeFile(path.join(root, 'fake-mutate.cjs'), FAKE_COMMAND, 'utf8');
  return root;
}

function pick(overrides: Partial<MutationPick> = {}): MutationPick {
  return {
    file: QUOTE,
    function: 'quote',
    line: 33,
    ranges: RANGES,
    scenarios: ['pricing: Volume discount tiers'],
    tests: TESTS,
    ...overrides,
  };
}

function mutant(
  status: string,
  line: number,
  column = 19,
  replacement = 'false',
): Record<string, unknown> {
  return {
    status,
    mutatorName: 'ConditionalExpression',
    replacement,
    location: { start: { line, column } },
  };
}

function reportWith(mutants: readonly unknown[], file = QUOTE): string {
  return JSON.stringify({ files: { [file]: { mutants } } });
}

interface FakeOptions {
  readonly mode?: 'ok' | 'fail' | 'timeout' | 'no-report';
  readonly report?: string;
  readonly timeoutSeconds?: number;
}

/** Run one pick with the fake command, returning its result and recorded run. */
async function execute(
  root: string,
  mutationPick: MutationPick,
  options: FakeOptions = {},
): Promise<{
  result: Awaited<ReturnType<typeof runMutationPick>>;
  record: Record<string, unknown> | null;
}> {
  const recordPath = path.join(root, 'record.json');
  process.env.OSQ_FAKE_RECORD = recordPath;
  process.env.OSQ_FAKE_MODE = options.mode ?? 'ok';
  process.env.OSQ_FAKE_REPORT = options.report ?? '{"files":{}}';
  try {
    const result = await runMutationPick(
      mutationPick,
      root,
      path.join(root, 'openspec', 'changes', '001-mut'),
      COMMAND,
      options.timeoutSeconds ?? 30,
    );
    const raw = await fs.readFile(recordPath, 'utf8').catch(() => '');
    return { result, record: raw === '' ? null : (JSON.parse(raw) as Record<string, unknown>) };
  } finally {
    Reflect.deleteProperty(process.env, 'OSQ_FAKE_RECORD');
    Reflect.deleteProperty(process.env, 'OSQ_FAKE_MODE');
    Reflect.deleteProperty(process.env, 'OSQ_FAKE_REPORT');
  }
}

describe('mutation command', () => {
  it('passes the ranges, tests, and report path to the placeholders and environment', async () => {
    const root = await makeProject();
    const changeFolder = path.join(root, 'openspec', 'changes', '001-mut');
    const mutants = [
      ...Array.from({ length: 18 }, (_, index) => mutant('Killed', 36 + index)),
      mutant('Survived', 36, 19, 'false'),
    ];

    const { result, record } = await execute(root, pick(), { report: reportWith(mutants) });

    assert.equal(result.outcome, 'measured');
    assert.equal(
      Array.isArray(record?.argv) ? (record?.argv as string[])[0] : null,
      RANGES.join(','),
    );
    assert.equal((record?.argv as string[])[1], TESTS[0]);
    assert.equal((record?.argv as string[])[2], record?.report);
    assert.equal(record?.mutate, JSON.stringify(RANGES));
    assert.equal(record?.tests, JSON.stringify(TESTS));
    assert.equal(record?.change, changeFolder);
    assert.ok(path.isAbsolute(record?.report as string));
  });

  it('records killed and surviving mutants with the replaced value', async () => {
    const root = await makeProject();
    const mutants = [
      ...Array.from({ length: 18 }, (_, index) => mutant('Killed', 34 + (index % 3), index + 1)),
      mutant('Survived', 36, 19, 'false'),
    ];

    const { result } = await execute(root, pick(), { report: reportWith(mutants) });

    assert.equal(result.killed, 18);
    assert.equal(result.survived, 1);
    assert.equal(result.invalid, 0);
    assert.deepEqual(result.survivors, [
      { file: QUOTE, line: 36, column: 19, mutator: 'ConditionalExpression', replacement: 'false' },
    ]);
    assert.equal(result.exitCode, 0);
  });

  it('maps every status and counts an unknown one invalid', async () => {
    const root = await makeProject();
    const mutants = [
      mutant('Killed', 36),
      mutant('Timeout', 37),
      mutant('Survived', 38),
      mutant('NoCoverage', 39),
      mutant('Weird', 36),
    ];

    const { result } = await execute(root, pick(), { report: reportWith(mutants) });

    assert.equal(result.killed, 2);
    assert.equal(result.survived, 2);
    assert.equal(result.invalid, 1);
    assert.deepEqual(
      result.survivors.map((survivor) => survivor.line),
      [38, 39],
    );
  });

  it('counts a mutant with a missing or mistyped field invalid', async () => {
    const root = await makeProject();
    const mutants = [
      { status: 'Killed', mutatorName: 'X', replacement: 'y' },
      { ...mutant('Killed', 36), location: { start: { line: '36', column: 1 } } },
      { ...mutant('Killed', 36), status: 42 },
    ];

    const { result } = await execute(root, pick(), { report: reportWith(mutants) });

    assert.equal(result.killed, 0);
    assert.equal(result.invalid, 3);
  });

  it('leaves a well-formed mutant outside the ranges uncounted', async () => {
    const root = await makeProject();
    const mutants = [mutant('Survived', 5), mutant('Killed', 36)];

    const { result } = await execute(root, pick(), { report: reportWith(mutants) });

    assert.equal(result.killed, 1);
    assert.equal(result.survived, 0);
    assert.equal(result.invalid, 0);
  });

  it('cuts a survivor replacement to 200 characters', async () => {
    const root = await makeProject();
    const long = 'x'.repeat(300);

    const { result } = await execute(root, pick(), {
      report: reportWith([mutant('Survived', 36, 19, long)]),
    });

    assert.equal(result.survivors[0]?.replacement.length, 200);
  });

  it('records a missing report as report_invalid', async () => {
    const root = await makeProject();

    const { result } = await execute(root, pick(), { mode: 'no-report' });

    assert.equal(result.outcome, 'not_measured');
    assert.equal(result.reason, 'report_invalid');
  });

  it('records a non-JSON report as report_invalid', async () => {
    const root = await makeProject();

    const { result } = await execute(root, pick(), { report: 'not json' });

    assert.equal(result.reason, 'report_invalid');
  });

  it('records a report without a files object as report_invalid', async () => {
    const root = await makeProject();

    const empty = await execute(root, pick(), { report: '{}' });
    const nullFiles = await execute(root, pick(), { report: '{"files":null}' });

    assert.equal(empty.result.reason, 'report_invalid');
    assert.equal(nullFiles.result.reason, 'report_invalid');
  });

  it('records a nonzero exit as command_failed and keeps the tail of the output', async () => {
    const root = await makeProject();

    const { result } = await execute(root, pick(), { mode: 'fail' });

    assert.equal(result.outcome, 'not_measured');
    assert.equal(result.reason, 'command_failed');
    assert.equal(result.exitCode, 2);
  });

  it('records a slow command as timed_out', async () => {
    const root = await makeProject();

    const { result } = await execute(root, pick(), { mode: 'timeout', timeoutSeconds: 0.5 });

    assert.equal(result.outcome, 'not_measured');
    assert.equal(result.reason, 'timed_out');
    assert.equal(result.output.length <= 2000, true);
  });

  it('does not run a pick whose ranges are unknown', async () => {
    const root = await makeProject();

    const { result, record } = await execute(root, pick({ ranges: null }));

    assert.equal(result.outcome, 'not_measured');
    assert.equal(result.reason, 'range_unknown');
    assert.equal(record, null);
  });

  it('removes the temporary report folder after reading it', async () => {
    const root = await makeProject();
    const mutants = [mutant('Killed', 36)];

    const { record } = await execute(root, pick(), { report: reportWith(mutants) });
    const reportPath = record?.report as string;

    await assert.rejects(fs.access(path.dirname(reportPath)));
  });
});
