import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CommandError } from '../src/cli/command-error.js';
import { createProgram } from '../src/cli/index.js';
import { labelCommand, queryCommand } from '../src/cli/query.js';
import { forwardProgram } from '../src/cli/remote-client.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';

const ARCHIVE_DIR = path.join('openspec', 'changes', 'archive');
const TRIALS = '007-pricing';
const VALIDATOR_REL = 'openspec/trials/validator.json';
const TRACEABILITY_REL = 'openspec/trials/traceability.json';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** A fresh temporary project root, removed after the test. */
async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-query-labels-'));
  roots.push(root);
  return root;
}

/** Writes one file under the root, creating parent folders. */
async function write(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** Reads one file under the root, or null when it is missing. */
async function read(root: string, rel: string): Promise<string | null> {
  return fs.readFile(path.join(root, rel), 'utf8').catch(() => null);
}

/** One jsonl event line. */
function event(type: string, data: Record<string, unknown>, timestamp?: string): string {
  return JSON.stringify(timestamp === undefined ? { type, data } : { type, data, timestamp });
}

/**
 * Change 007 with two validator runs and findings, a mutation pick with one
 * survivor, and a last plan_ready record holding one warning, as task 3's
 * fixture does.
 */
async function writeTrials(root: string): Promise<void> {
  const base = path.join(ARCHIVE_DIR, TRIALS);
  await write(
    root,
    path.join(base, 'proposal.md'),
    '---\ntitle: Pricing\n---\n## Goal\n\nPricing.\n',
  );
  await write(
    root,
    path.join(base, '.run', 'events', 'change.jsonl'),
    [
      event('validator_ran', { outcome: 'failed', output: 'boom' }, '2026-10-03T09:00:00.000Z'),
      event(
        'validator_ran',
        {
          outcome: 'validated',
          findings: [
            {
              kind: 'scenario',
              capability: 'widgets',
              requirement: 'Count',
              scenario: 'Counts',
              problem: 'no_code',
              detail: 'No code counts.',
            },
            {
              kind: 'scenario',
              capability: 'widgets',
              requirement: 'Count',
              scenario: 'Counts up',
              problem: 'no_test',
              detail: 'No test counts up.',
            },
          ],
        },
        '2026-10-03T09:01:00.000Z',
      ),
    ]
      .join('\n')
      .concat('\n'),
  );
  await write(
    root,
    path.join(base, '.run', 'events', '2.jsonl'),
    [
      event('mutation_ran', {
        file: 'src/count.ts',
        function: 'count',
        outcome: 'measured',
        killed: 3,
        survived: 1,
        invalid: 0,
        duration: 2,
        exitCode: 0,
        scenarios: ['widgets: Count'],
        survivors: [
          {
            file: 'src/count.ts',
            line: 4,
            column: 9,
            mutator: 'ConditionalExpression',
            replacement: 'false',
          },
        ],
      }),
    ]
      .join('\n')
      .concat('\n'),
  );
  await write(
    root,
    path.join(base, '.run', 'plan.jsonl'),
    `${event(
      'plan_ready',
      {
        hash: 'hash-1',
        notices: [],
        traceability: [
          {
            severity: 'warning',
            file: 'openspec/changes/007-pricing/specs/widgets/spec.md',
            message: 'widgets: no test names scenario "Count"',
          },
        ],
      },
      '2026-10-03T08:59:00.000Z',
    )}\n`,
  );
}

/** Runs `osq label` in-process with captured stdout, or rejects with its error. */
async function runLabel(root: string, id: string, value: string): Promise<string> {
  let out = '';
  await labelCommand({
    cwd: root,
    config: DEFAULT_CONFIG,
    id,
    value,
    stdout: (chunk) => {
      out += chunk;
    },
  });
  return out;
}

/** Runs one query as JSON and returns the parsed rows. */
async function queryRows(root: string, select: string): Promise<Record<string, unknown>[]> {
  let out = '';
  await queryCommand({
    cwd: root,
    config: DEFAULT_CONFIG,
    select,
    json: true,
    stdout: (chunk) => {
      out += chunk;
    },
  });
  return JSON.parse(out) as Record<string, unknown>[];
}

/** The lines of the one fenced block after a `**Title**` label. */
function fencedBlock(readme: string, label: string): string[] {
  const lines = readme.split('\n');
  const start = lines.findIndex((line) => line === `**${label}**`);
  assert.notEqual(start, -1, `README has no ${label} block`);
  const fenceStart = lines.findIndex((line, position) => position > start && line.trim() === '```');
  assert.notEqual(fenceStart, -1, `${label} has no fenced block`);
  const fenceEnd = lines.findIndex(
    (line, position) => position > fenceStart && line.trim() === '```',
  );
  assert.notEqual(fenceEnd, -1, `${label} fenced block is not closed`);
  return lines.slice(fenceStart + 1, fenceEnd);
}

/** The command first tokens of the root help's one group section. */
function groupTokens(help: string, heading: string): string[] {
  const lines = help.split('\n');
  const start = lines.findIndex((line) => line === heading);
  assert.notEqual(start, -1, `missing heading: ${heading}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.endsWith(' commands:') || line === 'Options:');
  const block = end === -1 ? rest : rest.slice(0, end);
  return block
    .filter((line) => /^ {2}\S/.test(line))
    .map((line) => line.trimStart().match(/^\S+/)?.[0] ?? '')
    .filter((token) => token.length > 0);
}

describe('trial labels', () => {
  it('labels items and writes the trial file in order', async () => {
    const root = await makeRoot();
    await writeTrials(root);

    assert.equal(await runLabel(root, '007.v2.1', 'true'), `007.v2.1: true in ${VALIDATOR_REL}\n`);
    assert.equal(await read(root, VALIDATOR_REL), '{\n  "007.v2.1": true\n}\n');

    assert.equal(await runLabel(root, '007.l1', 'true'), `007.l1: true in ${TRACEABILITY_REL}\n`);
    assert.equal(await read(root, TRACEABILITY_REL), '{\n  "007.l1": true\n}\n');

    assert.equal(
      await runLabel(root, '007.2.m1.1', 'false'),
      `007.2.m1.1: false in ${TRACEABILITY_REL}\n`,
    );
    assert.equal(
      await read(root, TRACEABILITY_REL),
      '{\n  "007.2.m1.1": false,\n  "007.l1": true\n}\n',
    );

    assert.equal(await runLabel(root, '007.l1', 'false'), `007.l1: false in ${TRACEABILITY_REL}\n`);
    assert.equal(
      await read(root, TRACEABILITY_REL),
      '{\n  "007.2.m1.1": false,\n  "007.l1": false\n}\n',
    );

    const before = await read(root, TRACEABILITY_REL);
    await assert.rejects(
      () => runLabel(root, '007.v9.9', 'true'),
      (error: unknown) =>
        error instanceof CommandError &&
        error.message === 'no validator finding, mutation survivor or link finding has id 007.v9.9',
    );
    assert.equal(await read(root, TRACEABILITY_REL), before, 'a missing id changed the file');

    await assert.rejects(
      () => runLabel(root, '007.v2.1', 'maybe'),
      (error: unknown) =>
        error instanceof CommandError && error.message === 'label must be true or false',
    );
    assert.equal(await read(root, VALIDATOR_REL), '{\n  "007.v2.1": true\n}\n');
  });

  it('shows the labels in the three tables', async () => {
    const root = await makeRoot();
    await writeTrials(root);
    await write(root, VALIDATOR_REL, '{"007.v2.1": true, "999.v1.1": false}');
    await write(root, TRACEABILITY_REL, '{"007.2.m1.1": false}');

    assert.deepEqual(
      await queryRows(root, 'SELECT id, label FROM validator_findings ORDER BY id'),
      [
        { id: '007.v2.1', label: 1 },
        { id: '007.v2.2', label: null },
      ],
    );
    assert.deepEqual(
      await queryRows(root, 'SELECT id, label FROM mutation_survivors ORDER BY id'),
      [{ id: '007.2.m1.1', label: 0 }],
    );
    assert.deepEqual(await queryRows(root, 'SELECT id, label FROM link_findings ORDER BY id'), [
      { id: '007.l1', label: null },
    ]);
  });

  it('fails a query on a malformed label file with the delta message', async () => {
    const root = await makeRoot();
    await write(root, VALIDATOR_REL, '{"007.v2.1": "yes"}');

    await assert.rejects(
      () =>
        queryCommand({
          cwd: root,
          config: DEFAULT_CONFIG,
          select: 'SELECT id FROM validator_findings',
          stdout: () => {},
        }),
      (error: unknown) =>
        error instanceof CommandError &&
        error.message ===
          'openspec/trials/validator.json must be a JSON object of true or false labels',
    );
  });

  it('lists label in the Inspection group right after query and in README', async () => {
    const help = createProgram('0.0.0').helpInformation();
    const tokens = groupTokens(help, 'Inspection commands:');
    const query = tokens.indexOf('query');
    assert.ok(query >= 0, 'query is missing from the Inspection group');
    assert.equal(tokens[query + 1], 'label', 'label must come right after query');

    const readme = await fs.readFile(
      path.join(path.resolve(fileURLToPath(new URL('..', import.meta.url))), 'README.md'),
      'utf8',
    );
    assert.ok(
      fencedBlock(readme, 'Inspection').some((line) =>
        line.startsWith('osq label <id> <true|false>'),
      ),
      'README Inspection block has no osq label line',
    );
  });

  it('refuses label before contacting a server', async () => {
    const program = createProgram('0.0.0');
    forwardProgram(program, {
      base: 'http://127.0.0.1:1/p/osq/',
      host: '127.0.0.1:1',
      project: 'osq',
    });

    await assert.rejects(
      () => program.parseAsync(['label', '007.v2.1', 'true'], { from: 'user' }),
      (error: unknown) =>
        error instanceof CommandError &&
        error.message ===
          'osq label runs only locally; unset OSQ_SERVER to run it here, or run it on the server',
    );
  });
});
