import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import {
  type ArchivedChangeRecord,
  listArchivedChanges,
  readArchivedChange,
} from '../src/core/report/archive-record.js';
import { listChanges } from '../src/core/status/change-locations.js';

const ARCHIVE_DIR = path.join('openspec', 'changes', 'archive');

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-archive-record-'));
  roots.push(root);
  return root;
}

async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function readOne(root: string, folder: string): Promise<ArchivedChangeRecord> {
  const changes = await listChanges(root, DEFAULT_CONFIG, ['archived']);
  const change = changes.find((entry) => entry.folderName === folder);
  assert.ok(change, `archive ${folder} should be listed`);
  return readArchivedChange(change);
}

const COMPLETE_PROPOSAL = `---
title: Complete archive title
---
## Goal

Ship the complete thing.

## Decisions

- ADR 007: follow it.
- ADR 12: and this one.
`;

const COMPLETE_DELTA = `# Spec Delta: cli-foundation

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

async function writeCompleteArchive(root: string, folder: string): Promise<void> {
  const base = path.join(ARCHIVE_DIR, folder);
  await writeFile(root, path.join(base, 'proposal.md'), COMPLETE_PROPOSAL);
  await writeFile(root, path.join(base, 'specs', 'cli-foundation', 'spec.md'), COMPLETE_DELTA);
  await writeFile(root, path.join(base, 'tasks', '1.md'), '# Task 1\n');
  await writeFile(root, path.join(base, 'tasks', '2.md'), '# Task 2\n');
  await writeFile(root, path.join(base, '.run', 'approved'), '');
  await writeFile(
    root,
    path.join(base, '.run', 'manifest.json'),
    JSON.stringify({
      planner: 'planner-x',
      createdAt: '2026-10-01T07:00:00.000Z',
      approvedAt: '2026-10-01T08:00:00.000Z',
    }),
  );
  await writeFile(
    root,
    path.join(base, '.run', 'events', 'change.jsonl'),
    `${JSON.stringify({
      type: 'archived',
      timestamp: '2026-10-01T09:00:00.000Z',
      data: {},
    })}\n`,
  );
  await writeFile(
    root,
    path.join(base, '.run', 'events', '1.jsonl'),
    [
      { type: 'started', data: { model: 'm1' } },
      { type: 'tokens', data: { cost: 0.5 } },
      { type: 'dead', data: { reason: 'scope_violation' } },
      { type: 'retry', data: { automatic: true } },
      { type: 'started', data: { model: 'm1' } },
      { type: 'tokens', data: { cost: 0.25 } },
      { type: 'done' },
    ]
      .map((event) => JSON.stringify(event))
      .join('\n')
      .concat('\n'),
  );
  await writeFile(
    root,
    path.join(base, '.run', 'events', '2.jsonl'),
    [
      { type: 'started', data: { model: 'm2' } },
      { type: 'tokens', data: { cost: 1.25 } },
      { type: 'retry', data: {} },
      { type: 'started', data: { model: 'm2' } },
      { type: 'tokens', data: { cost: 0.5 } },
      { type: 'done' },
    ]
      .map((event) => JSON.stringify(event))
      .join('\n')
      .concat('\n'),
  );
}

describe('archived change record', () => {
  it('reads every field of a complete archive', async () => {
    const root = await makeRoot();
    await writeCompleteArchive(root, '010-complete');

    const record = await readOne(root, '010-complete');

    assert.equal(record.id, '010');
    assert.equal(record.folder, '010-complete');
    assert.equal(record.title, 'Complete archive title');
    assert.equal(record.archivedAt, '2026-10-01T09:00:00.000Z');
    assert.equal(record.archivedOn, '2026-10-01');
    assert.equal(record.goal, 'Ship the complete thing.');
    assert.deepEqual(record.decisions, ['007', '012']);
    assert.equal(record.tasks.count, 2);
    assert.equal(record.tasks.attempts, 4);
    assert.deepEqual(record.tasks.dead, [{ task: '1', reason: 'scope_violation' }]);
    assert.equal(record.tasks.halts, 1);
    assert.equal(record.elapsedMs, 3_600_000);
    assert.equal(record.cost, 2.5);
    assert.deepEqual(record.executorModels, ['m1', 'm2']);
    assert.equal(record.planner, 'planner-x');
    assert.equal(JSON.stringify(record).includes(root), false);
  });

  it('lists archived changes in folder order', async () => {
    const root = await makeRoot();
    await writeCompleteArchive(root, '010-complete');
    await writeFile(
      root,
      path.join(ARCHIVE_DIR, '005-older', 'proposal.md'),
      '---\ntitle: Older title\n---\n## Goal\n\nOld goal.\n',
    );

    const records = await listArchivedChanges(root, DEFAULT_CONFIG);

    assert.deepEqual(
      records.map((record) => record.folder),
      ['005-older', '010-complete'],
    );
  });

  it('reads an older archive as nulls and empty lists without failing', async () => {
    const root = await makeRoot();
    await writeFile(
      root,
      path.join(ARCHIVE_DIR, '005-older', 'proposal.md'),
      '---\ntitle: Older archive title\n---\n## Goal\n\nDo the old thing.\n',
    );
    await writeFile(root, path.join(ARCHIVE_DIR, '005-older', 'tasks', '1.md'), '# Task 1\n');

    const record = await readOne(root, '005-older');

    assert.equal(record.title, 'Older archive title');
    assert.equal(record.goal, 'Do the old thing.');
    assert.equal(record.archivedAt, null);
    assert.equal(record.archivedOn, null);
    assert.equal(record.decisions, null);
    assert.equal(record.tasks.count, 1);
    assert.equal(record.tasks.attempts, null);
    assert.equal(record.tasks.dead, null);
    assert.equal(record.tasks.halts, null);
    assert.equal(record.elapsedMs, null);
    assert.equal(record.cost, null);
    assert.deepEqual(record.executorModels, []);
    assert.equal(record.planner, null);
  });

  it('reads a malformed proposal without failing', async () => {
    const root = await makeRoot();
    await writeFile(
      root,
      path.join(ARCHIVE_DIR, '030-malformed', 'proposal.md'),
      '---\ntitle: [unterminated\n---\nnot frontmatter\n',
    );

    const record = await readOne(root, '030-malformed');

    assert.equal(record.folder, '030-malformed');
    assert.equal(record.id, '030');
  });

  it('keeps each kind of delta requirement under its own name', async () => {
    const root = await makeRoot();
    const base = path.join(ARCHIVE_DIR, '020-renamed');
    await writeFile(
      root,
      path.join(base, 'proposal.md'),
      '---\ntitle: Renamed archive\n---\n## Goal\n\nRename it.\n## Decisions\n\n- ADR 004: no change.\n',
    );
    await writeFile(root, path.join(base, 'specs', 'cli-foundation', 'spec.md'), COMPLETE_DELTA);

    const record = await readOne(root, '020-renamed');

    assert.deepEqual(record.capabilities, [
      {
        name: 'cli-foundation',
        added: ['Added thing'],
        modified: ['Modified thing'],
        removed: ['Removed thing'],
        renamed: [{ from: 'Old name', to: 'New name' }],
      },
    ]);
  });
});
