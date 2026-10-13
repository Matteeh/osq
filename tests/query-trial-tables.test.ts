import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, it } from 'node:test';
import { queryCommand } from '../src/cli/query.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { buildHistoryTables } from '../src/core/report/query-tables.js';

const ARCHIVE_DIR = path.join('openspec', 'changes', 'archive');
const TRIALS = '007-pricing';
const PLAIN = '008-plain';

const TABLE_LIST = [
  'changes(id, folder, title, archived_on, goal, tasks, attempts, halts, elapsed_seconds, cost, planner)',
  'requirements(change, capability, kind, requirement, renamed_from)',
  'tasks(change, task, title, attempts, done)',
  'dead_attempts(change, task, reason)',
  'disclosures(change, task, section, text)',
  'notices(change, notice, severity, opened, outcome)',
  'validator_runs(change, run, outcome, harness, model, duration, exit_code, scenarios, findings, reason, output)',
  'validator_findings(id, change, run, finding, capability, requirement, scenario, problem, detail, label)',
  'focused_runs(change, task, run, outcome, exit_code, duration, timed_out, scenarios, files)',
  'mutation_picks(change, task, pick, file, function, outcome, reason, killed, survived, invalid, duration, scenarios)',
  'mutation_survivors(id, change, task, pick, file, function, line, column, mutator, replacement, label)',
  'link_findings(id, change, severity, file, message, label)',
  'task_outcomes(change, task, capability, scope_globs, scope_files, verify_kind, tests_modify, verify_starts, shares_scope, position, attempts, first_attempt, dead_reason, files_touched)',
].join('\n');

const TRIAL_TABLES = [
  'validator_runs',
  'validator_findings',
  'focused_runs',
  'mutation_picks',
  'mutation_survivors',
  'link_findings',
] as const;

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** A fresh temporary project root, removed after the test. */
async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-query-trial-'));
  roots.push(root);
  return root;
}

/** Writes one file under the root, creating parent folders. */
async function write(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** One jsonl event line. */
function event(type: string, data: Record<string, unknown>, timestamp?: string): string {
  return JSON.stringify(timestamp === undefined ? { type, data } : { type, data, timestamp });
}

/** A proposal so the folder reads as an archived change. */
async function writeProposal(root: string, base: string, title: string): Promise<void> {
  await write(
    root,
    path.join(base, 'proposal.md'),
    `---\ntitle: ${title}\n---\n## Goal\n\n${title}.\n`,
  );
}

/**
 * Change 007 with two validator runs and findings, a focused run, two mutation
 * picks with one survivor, and a last plan_ready record holding one warning.
 */
async function writeTrials(root: string): Promise<void> {
  const base = path.join(ARCHIVE_DIR, TRIALS);
  await writeProposal(root, base, 'Pricing');
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
      event('focused_ran', {
        outcome: 'passed',
        exitCode: 0,
        duration: 1.5,
        timedOut: false,
        scenarios: ['widgets: Count'],
        files: ['tests/count.test.ts'],
      }),
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
      event('mutation_ran', {
        file: 'src/count.ts',
        function: 'count',
        outcome: 'not_measured',
        reason: 'budget',
        scenarios: ['widgets: Count'],
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

/** Change 008 with a proposal and nothing else. */
async function writePlain(root: string): Promise<void> {
  await writeProposal(root, path.join(ARCHIVE_DIR, PLAIN), 'Plain');
}

/** All rows of one statement as plain objects. */
function rows(db: DatabaseSync, sql: string): Record<string, unknown>[] {
  return db
    .prepare(sql)
    .all()
    .map((row) => ({ ...row }));
}

/** The stdout text a command wrote through captured writers. */
async function capture(
  root: string,
  options: { select?: string },
): Promise<{ text: string; error: string }> {
  let text = '';
  let error = '';
  await queryCommand({
    cwd: root,
    config: DEFAULT_CONFIG,
    stdout: (chunk) => {
      text += chunk;
    },
    stderr: (chunk) => {
      error += chunk;
    },
    ...options,
  });
  return { text, error };
}

describe('trial query tables', () => {
  it('holds one row per validator run, finding, focused run, pick, survivor and link finding', async () => {
    const root = await makeRoot();
    await writeTrials(root);
    const db = await buildHistoryTables(root, DEFAULT_CONFIG);
    try {
      assert.deepEqual(
        rows(
          db,
          'SELECT change, run, outcome, harness, model, duration, exit_code, scenarios, ' +
            'findings, reason, output FROM validator_runs ORDER BY run',
        ),
        [
          {
            change: TRIALS,
            run: 1,
            outcome: 'failed',
            harness: null,
            model: null,
            duration: null,
            exit_code: null,
            scenarios: null,
            findings: 0,
            reason: null,
            output: 'boom',
          },
          {
            change: TRIALS,
            run: 2,
            outcome: 'validated',
            harness: null,
            model: null,
            duration: null,
            exit_code: null,
            scenarios: null,
            findings: 2,
            reason: null,
            output: null,
          },
        ],
      );
      assert.deepEqual(
        rows(
          db,
          'SELECT id, change, run, finding, capability, requirement, scenario, problem, ' +
            'detail, label FROM validator_findings ORDER BY id',
        ),
        [
          {
            id: '007.v2.1',
            change: TRIALS,
            run: 2,
            finding: 1,
            capability: 'widgets',
            requirement: 'Count',
            scenario: 'Counts',
            problem: 'no_code',
            detail: 'No code counts.',
            label: null,
          },
          {
            id: '007.v2.2',
            change: TRIALS,
            run: 2,
            finding: 2,
            capability: 'widgets',
            requirement: 'Count',
            scenario: 'Counts up',
            problem: 'no_test',
            detail: 'No test counts up.',
            label: null,
          },
        ],
      );
      assert.deepEqual(
        rows(
          db,
          'SELECT change, task, run, outcome, exit_code, duration, timed_out, scenarios, ' +
            'files FROM focused_runs ORDER BY change, task, run',
        ),
        [
          {
            change: TRIALS,
            task: '2',
            run: 1,
            outcome: 'passed',
            exit_code: 0,
            duration: 1.5,
            timed_out: 0,
            scenarios: 'widgets: Count',
            files: 'tests/count.test.ts',
          },
        ],
      );
      assert.deepEqual(
        rows(
          db,
          'SELECT change, task, pick, file, function, outcome, reason, killed, survived, ' +
            'invalid, duration, scenarios FROM mutation_picks ORDER BY change, task, pick',
        ),
        [
          {
            change: TRIALS,
            task: '2',
            pick: 1,
            file: 'src/count.ts',
            function: 'count',
            outcome: 'measured',
            reason: null,
            killed: 3,
            survived: 1,
            invalid: 0,
            duration: 2,
            scenarios: 'widgets: Count',
          },
          {
            change: TRIALS,
            task: '2',
            pick: 2,
            file: 'src/count.ts',
            function: 'count',
            outcome: 'not_measured',
            reason: 'budget',
            killed: null,
            survived: null,
            invalid: null,
            duration: null,
            scenarios: 'widgets: Count',
          },
        ],
      );
      assert.deepEqual(
        rows(
          db,
          'SELECT id, change, task, pick, file, function, line, column, mutator, ' +
            'replacement, label FROM mutation_survivors ORDER BY id',
        ),
        [
          {
            id: '007.2.m1.1',
            change: TRIALS,
            task: '2',
            pick: 1,
            file: 'src/count.ts',
            function: 'count',
            line: 4,
            column: 9,
            mutator: 'ConditionalExpression',
            replacement: 'false',
            label: null,
          },
        ],
      );
      assert.deepEqual(
        rows(db, 'SELECT id, change, severity, file, message, label FROM link_findings'),
        [
          {
            id: '007.l1',
            change: TRIALS,
            severity: 'warning',
            file: 'openspec/changes/007-pricing/specs/widgets/spec.md',
            message: 'widgets: no test names scenario "Count"',
            label: null,
          },
        ],
      );
    } finally {
      db.close();
    }
  });

  it('adds no trial row for an archived change with no trial data', async () => {
    const root = await makeRoot();
    await writePlain(root);
    const db = await buildHistoryTables(root, DEFAULT_CONFIG);
    try {
      for (const table of TRIAL_TABLES) {
        assert.deepEqual(rows(db, `SELECT * FROM ${table}`), [], table);
      }
    } finally {
      db.close();
    }
  });

  it('lists the twelve tables when osq query runs without a statement', async () => {
    const root = await makeRoot();
    await writeTrials(root);

    const { text, error } = await capture(root, {});

    assert.equal(error, '');
    assert.equal(text, `${TABLE_LIST}\n`);
  });
});
