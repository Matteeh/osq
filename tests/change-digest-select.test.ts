import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import {
  type DigestRequest,
  DigestSelectionError,
  buildChangeDigest,
} from '../src/core/report/change-digest.js';

const ARCHIVE_DIR = path.join('openspec', 'changes', 'archive');
const APPROVED_AT = '2026-09-01T00:00:00.000Z';
const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-change-digest-'));
  roots.push(root);
  return root;
}

async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

const DELTA = `# Spec Delta: CAPABILITY

## ADDED Requirements

### Requirement: Added one

Text.

## MODIFIED Requirements

### Requirement: Modified one

Text.
`;

interface ArchiveOptions {
  readonly archivedAt?: string;
  readonly title?: string;
  readonly goal?: string;
  readonly decisions?: readonly string[];
  readonly capabilities?: readonly string[];
  readonly cost?: number;
  readonly model?: string;
  readonly halt?: boolean;
}

async function writeArchive(
  root: string,
  folder: string,
  options: ArchiveOptions = {},
): Promise<void> {
  const base = path.join(ARCHIVE_DIR, folder);
  const decisions = options.decisions ?? [];
  const proposal = [
    '---',
    `title: ${options.title ?? folder}`,
    '---',
    '## Goal',
    '',
    options.goal ?? 'Do the thing.',
    '',
    ...(options.decisions === undefined
      ? []
      : ['## Decisions', '', ...decisions.map((number) => `- ADR ${number}: follow it.`), '']),
  ].join('\n');
  await writeFile(root, path.join(base, 'proposal.md'), proposal);
  for (const capability of options.capabilities ?? []) {
    await writeFile(
      root,
      path.join(base, 'specs', capability, 'spec.md'),
      DELTA.replace('CAPABILITY', capability),
    );
  }
  await writeFile(root, path.join(base, 'tasks', '1.md'), '# Task 1\n');
  await writeFile(root, path.join(base, '.run', 'approved'), '');
  await writeFile(
    root,
    path.join(base, '.run', 'manifest.json'),
    JSON.stringify({ approvedAt: APPROVED_AT }),
  );
  const events = [
    { type: 'started', data: { model: options.model ?? 'model-a' } },
    { type: 'tokens', data: { cost: options.cost ?? 1 } },
    ...(options.halt ? [{ type: 'retry', data: {} }] : []),
    { type: 'done' },
  ];
  await writeFile(
    root,
    path.join(base, '.run', 'events', '1.jsonl'),
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
  );
  if (options.archivedAt !== undefined) {
    await writeFile(
      root,
      path.join(base, '.run', 'events', 'change.jsonl'),
      `${JSON.stringify({ type: 'archived', timestamp: options.archivedAt, data: {} })}\n`,
    );
  }
}

async function writeDecision(root: string, date: string): Promise<void> {
  const adr = [
    '---',
    'status: accepted',
    'applies_to: all',
    'rule: Follow the rule.',
    '---',
    '# 007. Digest rule',
    '',
    `Date: ${date}.`,
    '',
  ].join('\n');
  await writeFile(root, path.join('decisions', '007-digest-rule.md'), adr);
}

function request(overrides: Partial<DigestRequest> = {}): DigestRequest {
  return { ids: [], since: null, until: null, cost: true, ...overrides };
}

describe('change digest selection', () => {
  it('selects a range including both ends', async () => {
    const root = await makeRoot();
    await writeArchive(root, '001-a', { archivedAt: '2026-09-27T10:00:00.000Z' });
    await writeArchive(root, '002-b', { archivedAt: '2026-09-28T10:00:00.000Z' });
    await writeArchive(root, '003-c', { archivedAt: '2026-09-30T10:00:00.000Z' });
    await writeArchive(root, '004-d', { archivedAt: '2026-10-01T10:00:00.000Z' });

    const digest = await buildChangeDigest(
      root,
      DEFAULT_CONFIG,
      request({ since: '2026-09-28', until: '2026-09-30' }),
    );

    assert.deepEqual(
      digest.changes.map((change) => change.id),
      ['002', '003'],
    );
    assert.deepEqual(digest.selection, {
      kind: 'range',
      since: '2026-09-28',
      until: '2026-09-30',
    });
    assert.equal(digest.period?.changeCount, 2);
  });

  it('lists selected ids in archive date order', async () => {
    const root = await makeRoot();
    await writeArchive(root, '012-earlier', { archivedAt: '2026-09-05T00:00:00.000Z' });
    await writeArchive(root, '010-later', { archivedAt: '2026-09-10T00:00:00.000Z' });

    const digest = await buildChangeDigest(root, DEFAULT_CONFIG, request({ ids: ['12', '10'] }));

    assert.deepEqual(
      digest.changes.map((change) => change.id),
      ['012', '010'],
    );
    assert.equal(digest.period, null);
    assert.deepEqual(digest.selection, { kind: 'ids', ids: ['12', '10'] });
  });

  it('refuses an unknown id naming every unmatched id in order', async () => {
    const root = await makeRoot();
    await writeArchive(root, '010-a', { archivedAt: '2026-09-10T00:00:00.000Z' });

    await assert.rejects(
      buildChangeDigest(root, DEFAULT_CONFIG, request({ ids: ['10', '999', '888'] })),
      (error: unknown) => {
        assert.ok(error instanceof DigestSelectionError);
        assert.equal(error.message, 'No archived change matches: 999, 888');
        return true;
      },
    );
  });

  it('produces an empty document for a range with no changes', async () => {
    const root = await makeRoot();
    await writeArchive(root, '001-a', { archivedAt: '2026-09-01T10:00:00.000Z' });

    const digest = await buildChangeDigest(root, DEFAULT_CONFIG, request({ since: '2026-10-01' }));

    assert.deepEqual(digest.changes, []);
    assert.equal(digest.period?.changeCount, 0);
    assert.deepEqual(digest.period?.capabilities, []);
    assert.deepEqual(digest.period?.adrs, []);
  });

  it('computes period totals over two changes and a dated ADR', async () => {
    const root = await makeRoot();
    await writeArchive(root, '001-a', {
      archivedAt: '2026-09-28T10:00:00.000Z',
      capabilities: ['cli-foundation'],
      decisions: ['007'],
      cost: 1,
      model: 'model-a',
      halt: true,
    });
    await writeArchive(root, '002-b', {
      archivedAt: '2026-09-29T10:00:00.000Z',
      capabilities: ['cli-foundation', 'status-inspection'],
      cost: 3,
      model: 'model-b',
    });
    await writeDecision(root, '2026-09-28');

    const digest = await buildChangeDigest(
      root,
      DEFAULT_CONFIG,
      request({ since: '2026-09-28', until: '2026-09-30' }),
    );

    assert.deepEqual(digest.period?.requirements, {
      added: 3,
      modified: 3,
      removed: 0,
      renamed: 0,
    });
    assert.deepEqual(
      digest.period?.capabilities.map((capability) => [capability.name, capability.changes]),
      [
        ['cli-foundation', 2],
        ['status-inspection', 1],
      ],
    );
    assert.deepEqual(
      digest.period?.adrs.map((adr) => [adr.id, adr.title, adr.date]),
      [['ADR-007', 'Digest rule', '2026-09-28']],
    );
    assert.equal(digest.period?.halts, 1);
    assert.deepEqual(digest.period?.elapsedMs.recorded, 2);
    assert.deepEqual(digest.period?.cost, { total: 4, recorded: 2 });
    assert.equal(digest.changes[0]?.decisions[0]?.rule, 'Follow the rule.');
    assert.equal(
      digest.changes[0]?.capabilities[0]?.added[0]?.id,
      '001/cli-foundation/added/Added one',
    );
    assert.equal(digest.changes[0]?.decisions[0]?.id, 'ADR-007');
  });

  it('drops every cost and model key when cost is false', async () => {
    const root = await makeRoot();
    await writeArchive(root, '001-a', {
      archivedAt: '2026-09-28T10:00:00.000Z',
      capabilities: ['cli-foundation'],
      decisions: ['007'],
      cost: 2,
      model: 'model-a',
    });
    await writeDecision(root, '2026-09-28');

    const digest = await buildChangeDigest(
      root,
      DEFAULT_CONFIG,
      request({ since: '2026-09-28', cost: false }),
    );

    const change = digest.changes[0];
    assert.ok(change);
    assert.equal('cost' in change, false);
    assert.equal('executorModels' in change, false);
    assert.equal('planner' in change, false);
    assert.equal(digest.period !== null && 'cost' in digest.period, false);
    assert.equal(JSON.stringify(digest).includes('"cost"'), false);
  });
});

describe('change digest refusals', () => {
  const cases: ReadonlyArray<[string, DigestRequest, string]> = [
    [
      'ids and since',
      request({ ids: ['1'], since: '2026-09-01' }),
      'Give change ids or --since, not both',
    ],
    ['neither', request(), 'Give change ids or --since <date>'],
    ['until without since', request({ until: '2026-09-01' }), '--until needs --since'],
    ['bad since', request({ since: '2026-9-1' }), '--since is not a YYYY-MM-DD date: 2026-9-1'],
    [
      'bad until',
      request({ since: '2026-09-01', until: 'nope' }),
      '--until is not a YYYY-MM-DD date: nope',
    ],
    [
      'until before since',
      request({ since: '2026-09-30', until: '2026-09-01' }),
      '--until is before --since',
    ],
  ];

  for (const [name, digestRequest, message] of cases) {
    it(`refuses ${name}`, async () => {
      const root = await makeRoot();
      await assert.rejects(
        buildChangeDigest(root, DEFAULT_CONFIG, digestRequest),
        (error: unknown) => {
          assert.ok(error instanceof DigestSelectionError);
          assert.equal(error.message, message);
          return true;
        },
      );
    });
  }
});
