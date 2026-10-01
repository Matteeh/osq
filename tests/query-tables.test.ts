import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { HISTORY_TABLES, buildHistoryTables } from '../src/core/report/query-tables.js';

const ARCHIVE_DIR = path.join('openspec', 'changes', 'archive');

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** A fresh temporary project root, removed after the test. */
async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-query-tables-'));
  roots.push(root);
  return root;
}

/** Writes one file under the root, creating parent folders. */
async function write(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** One jsonl event line, with an optional timestamp. */
function event(type: string, data: Record<string, unknown> = {}, timestamp?: string): string {
  return JSON.stringify(timestamp === undefined ? { type, data } : { type, data, timestamp });
}

const ALPHA_PROPOSAL = `---
title: Alpha change
---
## Goal

Do the alpha thing.
`;

const ALPHA_DELTA = `# Spec Delta: cli-foundation

## ADDED Requirements

### Requirement: Added thing

Text.

## MODIFIED Requirements

### Requirement: Modified thing

Text.

## REMOVED Requirements

- \`### Requirement: Removed thing\`

## RENAMED Requirements

- FROM: \`### Requirement: Old name\`
- TO: \`### Requirement: New name\`
`;

const BETA_PROPOSAL = `---
title: Beta change
---
## Goal

Do the beta thing.
`;

/** Change 010 with two tasks: task 1 has a stream and a done marker, task 2 none. */
async function writeAlpha(root: string): Promise<void> {
  const base = path.join(ARCHIVE_DIR, '010-alpha');
  await write(root, path.join(base, 'proposal.md'), ALPHA_PROPOSAL);
  await write(root, path.join(base, 'specs', 'cli-foundation', 'spec.md'), ALPHA_DELTA);
  await write(
    root,
    path.join(base, 'tasks', '1.md'),
    '---\ntitle: First alpha task\n---\n# First\n',
  );
  await write(
    root,
    path.join(base, 'tasks', '2.md'),
    '---\ntitle: Second alpha task\n---\n# Second\n',
  );
  await write(root, path.join(base, '.run', 'approved'), '');
  await write(
    root,
    path.join(base, '.run', 'manifest.json'),
    JSON.stringify({ planner: 'planner-alpha', approvedAt: '2026-10-01T08:00:00.000Z' }),
  );
  await write(
    root,
    path.join(base, '.run', 'events', 'change.jsonl'),
    `${event('archived', {}, '2026-10-01T09:00:00.000Z')}\n`,
  );
  await write(
    root,
    path.join(base, '.run', 'events', '1.jsonl'),
    [
      event('started'),
      event('dead', { reason: 'scope_violation' }),
      event('started'),
      event('tokens', { cost: 0.5 }),
      event('done'),
    ]
      .join('\n')
      .concat('\n'),
  );
  await write(root, path.join(base, '.run', 'done', '1'), '');
  await write(
    root,
    path.join(base, '.run', 'results', '1.md'),
    [
      '## Changed',
      'Something.',
      '',
      '## Deviated',
      'We deviated here.',
      '',
      '## Missing context',
      'Some context was missing.',
      '',
      '## Outside scope',
      'A bug outside scope.',
    ].join('\n'),
  );
}

/** Change 020 with one task and no run metadata. */
async function writeBeta(root: string): Promise<void> {
  const base = path.join(ARCHIVE_DIR, '020-beta');
  await write(root, path.join(base, 'proposal.md'), BETA_PROPOSAL);
  await write(root, path.join(base, 'tasks', '1.md'), '---\ntitle: Only beta task\n---\n# Only\n');
  await write(
    root,
    path.join(base, '.run', 'events', 'change.jsonl'),
    `${event('archived', {}, '2026-10-02T10:00:00.000Z')}\n`,
  );
}

/** All rows of one statement as plain objects. */
function rows(db: DatabaseSync, sql: string): Record<string, unknown>[] {
  return db
    .prepare(sql)
    .all()
    .map((row) => ({ ...row }));
}

describe('HISTORY_TABLES', () => {
  it('lists the five tables with their columns in order', () => {
    assert.deepEqual(
      HISTORY_TABLES.map((table) => ({ name: table.name, columns: [...table.columns] })),
      [
        {
          name: 'changes',
          columns: [
            'id',
            'folder',
            'title',
            'archived_on',
            'goal',
            'tasks',
            'attempts',
            'halts',
            'elapsed_seconds',
            'cost',
            'planner',
          ],
        },
        {
          name: 'requirements',
          columns: ['change', 'capability', 'kind', 'requirement', 'renamed_from'],
        },
        { name: 'tasks', columns: ['change', 'task', 'title', 'attempts', 'done'] },
        { name: 'dead_attempts', columns: ['change', 'task', 'reason'] },
        { name: 'disclosures', columns: ['change', 'task', 'section', 'text'] },
      ],
    );
  });
});

describe('buildHistoryTables', () => {
  it('gives every table exactly the documented columns', async () => {
    const root = await makeRoot();
    await writeAlpha(root);
    await writeBeta(root);
    const db = await buildHistoryTables(root, DEFAULT_CONFIG);
    try {
      for (const table of HISTORY_TABLES) {
        const columns = rows(db, `PRAGMA table_info(${table.name})`).map((row) => row.name);
        assert.deepEqual(columns, [...table.columns], table.name);
      }
    } finally {
      db.close();
    }
  });

  it('builds one row per archived change with its run fields', async () => {
    const root = await makeRoot();
    await writeAlpha(root);
    await writeBeta(root);
    const db = await buildHistoryTables(root, DEFAULT_CONFIG);
    try {
      assert.deepEqual(
        rows(
          db,
          'SELECT id, folder, title, archived_on, goal, tasks, attempts, halts, ' +
            'elapsed_seconds, cost, planner FROM changes ORDER BY folder',
        ),
        [
          {
            id: '010',
            folder: '010-alpha',
            title: 'Alpha change',
            archived_on: '2026-10-01',
            goal: 'Do the alpha thing.',
            tasks: 2,
            attempts: 2,
            halts: 0,
            elapsed_seconds: 3600,
            cost: 0.5,
            planner: 'planner-alpha',
          },
          {
            id: '020',
            folder: '020-beta',
            title: 'Beta change',
            archived_on: '2026-10-02',
            goal: 'Do the beta thing.',
            tasks: 1,
            attempts: 0,
            halts: 0,
            elapsed_seconds: null,
            cost: null,
            planner: null,
          },
        ],
      );
    } finally {
      db.close();
    }
  });

  it('keys every requirement kind, and a rename by its new name', async () => {
    const root = await makeRoot();
    await writeAlpha(root);
    const db = await buildHistoryTables(root, DEFAULT_CONFIG);
    try {
      assert.deepEqual(
        rows(
          db,
          'SELECT change, capability, kind, requirement, renamed_from FROM requirements ' +
            'ORDER BY rowid',
        ),
        [
          {
            change: '010-alpha',
            capability: 'cli-foundation',
            kind: 'added',
            requirement: 'Added thing',
            renamed_from: null,
          },
          {
            change: '010-alpha',
            capability: 'cli-foundation',
            kind: 'modified',
            requirement: 'Modified thing',
            renamed_from: null,
          },
          {
            change: '010-alpha',
            capability: 'cli-foundation',
            kind: 'removed',
            requirement: 'Removed thing',
            renamed_from: null,
          },
          {
            change: '010-alpha',
            capability: 'cli-foundation',
            kind: 'renamed',
            requirement: 'New name',
            renamed_from: 'Old name',
          },
        ],
      );
    } finally {
      db.close();
    }
  });

  it('builds one task row per task file, without a stream as zero attempts', async () => {
    const root = await makeRoot();
    await writeAlpha(root);
    await writeBeta(root);
    const db = await buildHistoryTables(root, DEFAULT_CONFIG);
    try {
      assert.deepEqual(
        rows(db, 'SELECT change, task, title, attempts, done FROM tasks ORDER BY change, task'),
        [
          { change: '010-alpha', task: '1', title: 'First alpha task', attempts: 2, done: 1 },
          { change: '010-alpha', task: '2', title: 'Second alpha task', attempts: 0, done: 0 },
          { change: '020-beta', task: '1', title: 'Only beta task', attempts: 0, done: 0 },
        ],
      );
    } finally {
      db.close();
    }
  });

  it('reads dead attempts and each disclosure section', async () => {
    const root = await makeRoot();
    await writeAlpha(root);
    const db = await buildHistoryTables(root, DEFAULT_CONFIG);
    try {
      assert.deepEqual(
        rows(db, 'SELECT change, task, reason FROM dead_attempts ORDER BY change, task'),
        [{ change: '010-alpha', task: '1', reason: 'scope_violation' }],
      );
      assert.deepEqual(
        rows(
          db,
          'SELECT change, task, section, text FROM disclosures ORDER BY change, task, rowid',
        ),
        [
          {
            change: '010-alpha',
            task: '1',
            section: 'deviated',
            text: 'We deviated here.',
          },
          {
            change: '010-alpha',
            task: '1',
            section: 'missing_context',
            text: 'Some context was missing.',
          },
          {
            change: '010-alpha',
            task: '1',
            section: 'outside_scope',
            text: 'A bug outside scope.',
          },
        ],
      );
    } finally {
      db.close();
    }
  });
});
