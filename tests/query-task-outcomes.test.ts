import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, it } from 'node:test';
import { queryCommand } from '../src/cli/query.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { buildHistoryTables } from '../src/core/report/query-tables.js';
import { verifyKind } from '../src/core/report/task-outcomes.js';

const ARCHIVE_DIR = path.join('openspec', 'changes', 'archive');
const WIDGETS = '030-widgets';

const TASK_OUTCOMES =
  'task_outcomes(change, task, capability, scope_globs, scope_files, verify_kind, tests_modify, verify_starts, shares_scope, position, attempts, first_attempt, dead_reason, files_touched)';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** A fresh temporary project root, removed after the test. */
async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-query-outcomes-'));
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
function event(type: string, data: Record<string, unknown> = {}): string {
  return JSON.stringify({ type, data });
}

/** A living capability spec whose Code ownership covers one source glob. */
function livingSpec(capability: string, source: string): string {
  return `# ${capability} Specification

## Purpose

The ${capability} capability exists for this test with plenty of words to pass.

## Requirements

### Requirement: Code ownership
<!-- source: ${source} -->
The ${capability} capability SHALL own its files.
`;
}

/**
 * The archive of `030-widgets`, whose proposal verify is `pnpm verify`, with
 * living specs `widgets` owning `src/**` and `gadgets` owning `tests/**`, and
 * three tasks as the "Task outcomes of one archived change" scenario writes.
 */
async function writeWidgets(root: string): Promise<void> {
  await write(
    root,
    path.join('openspec', 'specs', 'widgets', 'spec.md'),
    livingSpec('widgets', 'src/**'),
  );
  await write(
    root,
    path.join('openspec', 'specs', 'gadgets', 'spec.md'),
    livingSpec('gadgets', 'tests/**'),
  );

  const base = path.join(ARCHIVE_DIR, WIDGETS);
  await write(
    root,
    path.join(base, 'proposal.md'),
    '---\ntitle: Widgets\nverify: pnpm verify\n---\n## Goal\n\nDo the widgets thing.\n',
  );
  await write(
    root,
    path.join(base, 'tasks', '1.md'),
    [
      '---',
      'title: First widget task',
      'scope:',
      '  - src/a.ts',
      '  - tests/a.test.ts',
      'verify: node --test tests/a.test.ts',
      '---',
      '## Acceptance',
      '- [ ] first',
      '',
    ].join('\n'),
  );
  await write(
    root,
    path.join(base, 'tasks', '2.md'),
    [
      '---',
      'title: Second widget task',
      'scope:',
      '  - src/a.ts',
      '  - tests/b.test.ts',
      '  - tests/c.test.ts',
      'tests:',
      '  modify: true',
      'verify_starts: green',
      'verify: node --test tests/b.test.ts tests/c.test.ts',
      '---',
      '## Acceptance',
      '- [ ] second',
      '',
    ].join('\n'),
  );
  await write(
    root,
    path.join(base, 'tasks', '3.md'),
    [
      '---',
      'title: Third widget task',
      'scope:',
      '  - scripts/x.mjs',
      'verify: pnpm verify',
      '---',
      '## Acceptance',
      '- [ ] third',
      '',
    ].join('\n'),
  );

  const hashes = (files: readonly string[]): Record<string, unknown> =>
    Object.fromEntries(files.map((file) => [file, { before: null, after: 'sha' }]));

  await write(
    root,
    path.join(base, '.run', 'events', '1.jsonl'),
    [
      event('started'),
      event('measures', { phase: 'start', scopeFiles: 2 }),
      event('measures', {
        phase: 'end',
        scopeHashes: hashes(['src/a.ts', 'src/b.ts', 'tests/a.test.ts']),
        changedFiles: 3,
      }),
      event('done'),
    ]
      .join('\n')
      .concat('\n'),
  );
  await write(
    root,
    path.join(base, '.run', 'events', '2.jsonl'),
    [
      event('started'),
      event('measures', { phase: 'start', scopeFiles: 3 }),
      event('dead', { reason: 'verify_red' }),
      event('started'),
      event('measures', {
        phase: 'end',
        scopeHashes: hashes(['src/a.ts', 'tests/b.test.ts', 'tests/c.test.ts']),
        changedFiles: 2,
      }),
      event('done'),
    ]
      .join('\n')
      .concat('\n'),
  );
}

/** All rows of one statement as plain objects. */
function rows(db: DatabaseSync, sql: string): Record<string, unknown>[] {
  return db
    .prepare(sql)
    .all()
    .map((row) => ({ ...row }));
}

/** The stdout and stderr text a command wrote through captured writers. */
async function capture(
  root: string,
  options: { select?: string } = {},
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

describe('task outcomes of one archived change', () => {
  it('holds the shape and outcome of every task', async () => {
    const root = await makeRoot();
    await writeWidgets(root);
    const db = await buildHistoryTables(root, DEFAULT_CONFIG);
    try {
      assert.deepEqual(
        rows(
          db,
          'SELECT task, capability, scope_globs, scope_files, verify_kind, tests_modify, ' +
            'verify_starts, shares_scope, position, attempts, first_attempt, dead_reason, ' +
            'files_touched FROM task_outcomes ORDER BY position',
        ),
        [
          {
            task: '1',
            capability: 'widgets',
            scope_globs: 2,
            scope_files: 3,
            verify_kind: 'one',
            tests_modify: 0,
            verify_starts: 'red',
            shares_scope: 0,
            position: 1,
            attempts: 1,
            first_attempt: 1,
            dead_reason: null,
            files_touched: 3,
          },
          {
            task: '2',
            capability: 'gadgets',
            scope_globs: 3,
            scope_files: 3,
            verify_kind: 'several',
            tests_modify: 1,
            verify_starts: 'green',
            shares_scope: 1,
            position: 2,
            attempts: 2,
            first_attempt: 0,
            dead_reason: 'verify_red',
            files_touched: 2,
          },
          {
            task: '3',
            capability: null,
            scope_globs: 1,
            scope_files: null,
            verify_kind: 'suite',
            tests_modify: 0,
            verify_starts: 'red',
            shares_scope: 0,
            position: 3,
            attempts: 0,
            first_attempt: 0,
            dead_reason: null,
            files_touched: null,
          },
        ],
      );
      assert.deepEqual(rows(db, 'SELECT DISTINCT change FROM task_outcomes'), [
        { change: WIDGETS },
      ]);
    } finally {
      db.close();
    }
  });
});

describe('verifyKind', () => {
  const CASES: readonly (readonly [string, string])[] = [
    ['node --import tsx --import ./tests/git-test-env.ts --test tests/a.test.ts', 'one'],
    ['pnpm test tests/a.test.ts tests/a.test.ts', 'one'],
    ['node --test tests/a.test.ts tests/b.spec.ts', 'several'],
    ["node --test 'tests/*.test.ts'", 'several'],
    ['pnpm verify', 'suite'],
    ['node scripts/check.mjs', 'other'],
  ];

  for (const [verify, kind] of CASES) {
    it(`reads ${kind} for ${verify}`, () => {
      assert.equal(verifyKind(verify, 'pnpm verify'), kind);
    });
  }
});

describe('task outcomes listed', () => {
  it('prints task_outcomes last, after link_findings, and exits zero', async () => {
    const root = await makeRoot();
    await writeWidgets(root);

    const { text, error } = await capture(root);

    assert.equal(error, '');
    const lines = text.trimEnd().split('\n');
    assert.equal(lines.at(-1), TASK_OUTCOMES);
    const linkIndex = lines.indexOf('link_findings(id, change, severity, file, message, label)');
    assert.ok(linkIndex >= 0 && linkIndex < lines.length - 1);
  });
});
