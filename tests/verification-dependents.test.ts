import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { readNextStep } from '../src/core/status/next-step.js';
import { formatQueue, prepareQueuePlan, projectQueue } from '../src/core/status/queue.js';
import { deriveSpecState } from '../src/core/status/state.js';

const CONFIG: OsqConfig = DEFAULT_CONFIG;
const ARCHIVE = 'openspec/changes/archive';

function proposalMd(title: string, dependsOn: string[] = []): string {
  const lines = ['---', `title: ${title}`, 'verify: node verify.cjs'];
  if (dependsOn.length > 0) {
    lines.push(`depends_on: [${dependsOn.map((id) => `"${id}"`).join(', ')}]`);
  }
  lines.push('---', '## Goal', `${title} goal.`, '');
  return lines.join('\n');
}

function taskMd(): string {
  return [
    '---',
    'title: Task 1',
    'verify: node task.cjs',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] done',
    '',
  ].join('\n');
}

function queueContent(items: Array<{ slug: string; title: string; depends?: string }>): string {
  return items
    .map((item) =>
      [
        `## [${item.slug}] ${item.title}`,
        `Depends on: ${item.depends ?? 'nothing'}`,
        '',
        `Brief body for ${item.slug}.`,
        '',
      ].join('\n'),
    )
    .join('\n');
}

function sectionHash(content: string, slug: string): string {
  const marker = `## [${slug}] `;
  const start = content.indexOf(marker);
  assert.ok(start >= 0, `missing queue marker for ${slug}`);
  const next = content.indexOf('## [', start + marker.length);
  const raw = content.slice(start, next === -1 ? content.length : next);
  return `sha256:${createHash('sha256').update(raw, 'utf8').digest('hex')}`;
}

function briefMd(slug: string, hash: string): string {
  return [
    '---',
    `queue_item: ${slug}`,
    `queue_hash: ${hash}`,
    '---',
    `Brief for ${slug}.`,
    '',
  ].join('\n');
}

async function writeAt(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

interface ActiveOptions {
  title: string;
  dependsOn?: string[];
}

async function createActive(
  root: string,
  folderName: string,
  options: ActiveOptions,
): Promise<string> {
  const dir = path.join(root, 'openspec', 'changes', folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'proposal.md'),
    proposalMd(options.title, options.dependsOn),
    'utf8',
  );
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), taskMd(), 'utf8');
  await writeAt(dir, '.run/approved', 'sha256:fixture\n');
  return dir;
}

interface ArchivedOptions {
  title: string;
  verification?: { afterLanding: boolean; check: string | null } | null;
  events?: Array<Record<string, unknown>>;
}

async function createArchived(
  root: string,
  folderName: string,
  options: ArchivedOptions,
): Promise<string> {
  const dir = path.join(root, ARCHIVE, folderName);
  await fs.mkdir(path.join(dir, '.run', 'events'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(options.title), 'utf8');
  const data = options.verification
    ? { archivePath: dir, verification: options.verification }
    : { archivePath: dir };
  const events = [
    { type: 'archived', timestamp: '2026-01-01T00:00:00.000Z', data },
    ...(options.events ?? []),
  ];
  await fs.writeFile(
    path.join(dir, '.run', 'events', 'change.jsonl'),
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
    'utf8',
  );
  return dir;
}

async function appendEvent(folderPath: string, event: Record<string, unknown>): Promise<void> {
  const target = path.join(folderPath, '.run', 'events', 'change.jsonl');
  await fs.appendFile(target, `${JSON.stringify(event)}\n`, 'utf8');
}

function passedEvent(): Record<string, unknown> {
  return {
    type: 'verification_recorded',
    timestamp: '2026-01-02T00:00:00.000Z',
    data: { outcome: 'passed', note: null },
  };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-verification-dependents-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('verification pending dependency', () => {
  it('blocks a dependent of a pending archived change, then frees it on passed', async () => {
    const dependency = await createArchived(tmpDir, '012-pending', {
      title: 'Pending',
      verification: { afterLanding: true, check: null },
    });
    const dependent = await createActive(tmpDir, '013-dependent', {
      title: 'Dependent',
      dependsOn: ['012'],
    });

    const blocked = await deriveSpecState(tmpDir, dependent);
    assert.equal(blocked.status, 'blocked');

    const step = await readNextStep(tmpDir, dependent, CONFIG);
    assert.deepEqual(step, {
      state: 'blocked',
      command: 'osq show 012',
      detail: 'waiting for 012',
    });

    await appendEvent(dependency, passedEvent());
    const freed = await deriveSpecState(tmpDir, dependent);
    assert.equal(freed.status, 'pending');
  });

  it('keeps the dependent blocked while the archived outcome is failed', async () => {
    await createArchived(tmpDir, '014-failed', {
      title: 'Failed',
      verification: { afterLanding: false, check: null },
      events: [
        {
          type: 'verification_recorded',
          timestamp: '2026-01-02T00:00:00.000Z',
          data: { outcome: 'failed', note: 'nope' },
        },
      ],
    });
    const dependent = await createActive(tmpDir, '015-dependent', {
      title: 'Dependent',
      dependsOn: ['014'],
    });

    const state = await deriveSpecState(tmpDir, dependent);
    assert.equal(state.status, 'blocked');
    assert.equal((await readNextStep(tmpDir, dependent, CONFIG)).state, 'blocked');
  });

  it('treats an archived dependency without a verification requirement as met', async () => {
    await createArchived(tmpDir, '016-plain', { title: 'Plain' });
    const dependent = await createActive(tmpDir, '017-dependent', {
      title: 'Dependent',
      dependsOn: ['016'],
    });

    const state = await deriveSpecState(tmpDir, dependent);
    assert.equal(state.status, 'pending');
    assert.notEqual(state.status, 'blocked');
  });
});

describe('verification pending queue dependency', () => {
  it('derives the archived association as verification-pending and holds its dependent', async () => {
    const content = queueContent([
      { slug: 'alpha', title: 'Alpha' },
      { slug: 'beta', title: 'Beta', depends: 'alpha' },
    ]);
    await writeAt(tmpDir, 'openspec/queue.md', content);
    const alpha = await createArchived(tmpDir, '020-alpha', {
      title: 'Alpha',
      verification: { afterLanding: true, check: null },
    });
    await writeAt(
      tmpDir,
      `${ARCHIVE}/020-alpha/brief.md`,
      briefMd('alpha', sectionHash(content, 'alpha')),
    );

    const projection = await projectQueue(tmpDir, CONFIG);
    const alphaRow = projection.items.find((item) => item.slug === 'alpha');
    const betaRow = projection.items.find((item) => item.slug === 'beta');
    assert.equal(alphaRow?.state, 'verification-pending');
    assert.equal(alphaRow?.changeId, '020');
    assert.deepEqual(betaRow?.unmetDependencies, ['alpha']);
    assert.equal(projection.landedCount, 0);

    const text = formatQueue(projection);
    assert.ok(text.includes('alpha: Alpha [verification-pending]'), text);

    const waiting = await prepareQueuePlan(tmpDir, CONFIG);
    assert.equal(waiting.kind, 'refused');
    if (waiting.kind === 'refused') {
      assert.match(waiting.message, /beta: unplanned \(waiting on alpha\)/);
    }

    await appendEvent(alpha, passedEvent());
    const after = await projectQueue(tmpDir, CONFIG);
    assert.deepEqual(after.items.find((item) => item.slug === 'beta')?.unmetDependencies, []);
    const ready = await prepareQueuePlan(tmpDir, CONFIG);
    assert.equal(ready.kind, 'ready');
    if (ready.kind === 'ready') assert.equal(ready.selection.item.slug, 'beta');
  });
});
