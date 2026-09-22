import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createProgram } from '../src/cli/index.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { formatQueue, parseQueue, projectQueue, readQueue } from '../src/core/status/queue.js';

const OPENSPEC = 'openspec';
const QUEUE_PATH = 'openspec/queue.md';

function proposalMd(title: string): string {
  return ['---', `title: ${title}`, 'depends_on: []', '---', '## Goal', `${title} goal.`, ''].join(
    '\n',
  );
}

function taskMd(): string {
  return [
    '---',
    'title: Task 1',
    'verify: node -e "process.exit(0)"',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] done',
    '',
  ].join('\n');
}

function briefMd(slug: string, hash: string | null): string {
  const lines = ['---', `queue_item: ${slug}`];
  if (hash !== null) lines.push(`queue_hash: ${hash}`);
  lines.push('---', `Brief body for ${slug}.`, '');
  return lines.join('\n');
}

interface ItemSpec {
  slug: string;
  title: string;
  depends?: string;
  body?: string;
}

function queueContent(items: ItemSpec[]): string {
  return items
    .map((item) =>
      [
        `## [${item.slug}] ${item.title}`,
        `Depends on: ${item.depends ?? 'nothing'}`,
        '',
        item.body ?? `Brief body for ${item.slug}.`,
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

async function writeQueue(root: string, content: string): Promise<string> {
  const queuePath = path.join(root, OPENSPEC, 'queue.md');
  await fs.mkdir(path.dirname(queuePath), { recursive: true });
  await fs.writeFile(queuePath, content, 'utf8');
  return queuePath;
}

async function writeAt(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

type Location = 'active' | 'archive' | 'rejected';
type Marker = 'dead' | 'regressed' | 'running' | 'done';

async function createQueuedChange(
  root: string,
  location: Location,
  folderName: string,
  options: { slug: string; hash?: string | null; approved?: boolean; marker?: Marker },
): Promise<string> {
  const base =
    location === 'active'
      ? path.join(root, OPENSPEC, 'changes', folderName)
      : path.join(root, OPENSPEC, 'changes', location, folderName);
  await fs.mkdir(path.join(base, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(base, 'proposal.md'), proposalMd(folderName), 'utf8');
  await fs.writeFile(path.join(base, 'tasks', '1.md'), taskMd(), 'utf8');
  await fs.writeFile(
    path.join(base, 'brief.md'),
    briefMd(options.slug, options.hash ?? null),
    'utf8',
  );
  if (options.approved) await writeAt(base, '.run/approved', 'sha256:fixture\n');
  if (options.marker === 'dead') {
    await writeAt(base, '.run/dead/1.md', '---\nreason: verify_red\n---\nfailed\n');
  }
  if (options.marker === 'regressed') {
    await writeAt(base, '.run/regressed/1.md', '---\nreason: verify_red\n---\nfailed\n');
  }
  if (options.marker === 'running') {
    await writeAt(
      base,
      '.run/running/1.pid',
      JSON.stringify({ pid: process.pid, startedAt: Date.now() }),
    );
  }
  if (options.marker === 'done') await writeAt(base, '.run/done/1', '');
  return base;
}

function bySlug(projection: Awaited<ReturnType<typeof projectQueue>>) {
  return new Map(projection.items.map((row) => [row.slug, row]));
}

async function runQueueCli(cwd: string): Promise<string> {
  const originalCwd = process.cwd();
  const originalLog = console.log;
  let captured = '';
  console.log = (...args: unknown[]) => {
    captured += `${args.map((arg) => String(arg)).join(' ')}\n`;
  };
  try {
    process.chdir(cwd);
    const program = createProgram();
    await program.parseAsync(['node', 'osq', 'queue']);
  } finally {
    process.chdir(originalCwd);
    console.log = originalLog;
  }
  return captured.trimEnd();
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-queue-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('queue parser', () => {
  it('parses ordered items with earlier dependencies, bodies, and raw-section hashes', () => {
    const content = queueContent([
      { slug: 'first-item', title: 'First Item' },
      { slug: 'second-item', title: 'Second Item', depends: 'first-item' },
    ]);
    const items = parseQueue(content, QUEUE_PATH);

    assert.deepEqual(
      items.map((item) => item.slug),
      ['first-item', 'second-item'],
    );
    assert.deepEqual(
      items.map((item) => item.title),
      ['First Item', 'Second Item'],
    );
    assert.deepEqual(items[0].dependsOn, []);
    assert.deepEqual(items[1].dependsOn, ['first-item']);
    assert.equal(items[0].body, 'Brief body for first-item.');
    assert.equal(items[1].body, 'Brief body for second-item.');
    assert.match(items[0].hash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(items[0].hash, sectionHash(content, 'first-item'));
    assert.equal(items[1].hash, sectionHash(content, 'second-item'));
    // Identical input yields an identical digest.
    assert.equal(parseQueue(content)[0].hash, items[0].hash);
  });

  it('accepts nothing and comma-separated earlier slugs with surrounding whitespace', () => {
    const content = queueContent([
      { slug: 'one', title: 'One' },
      { slug: 'two', title: 'Two' },
      { slug: 'three', title: 'Three', depends: ' one , two ' },
    ]);
    const items = parseQueue(content);
    assert.deepEqual(items[2].dependsOn, ['one', 'two']);
  });

  it('permits ordinary deeper headings inside a brief body', () => {
    const content = [
      '## [alpha] Alpha',
      'Depends on: nothing',
      '',
      '### Details',
      'Nested prose.',
      '',
    ].join('\n');
    const items = parseQueue(content);
    assert.equal(items.length, 1);
    assert.match(items[0].body, /### Details/);
  });

  function expectParseError(content: string, pattern: RegExp): void {
    assert.throws(
      () => parseQueue(content, QUEUE_PATH),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, pattern);
        assert.match(error.message, /openspec\/queue\.md/);
        return true;
      },
    );
  }

  it('rejects malformed headings, invalid slugs, empty titles, and duplicate slugs', () => {
    expectParseError('## [broken Title\nDepends on: nothing\n\nBody\n', /heading/);
    expectParseError('## [Bad_Slug] Title\nDepends on: nothing\n\nBody\n', /invalid/);
    expectParseError('## [item] \nDepends on: nothing\n\nBody\n', /malformed|heading/);
    expectParseError(
      '## [item] Title\nDepends on: nothing\n\nA\n\n## [item] Other\nDepends on: nothing\n\nB\n',
      /duplicate/,
    );
  });

  it('rejects missing, malformed, empty, and duplicate dependency lines', () => {
    expectParseError('## [item] Title\n', /missing its Depends on/);
    expectParseError('## [item] Title\n\nBody\n', /malformed dependency line/);
    expectParseError('## [item] Title\nDepends: nothing\n\nBody\n', /dependency line/);
    expectParseError('## [item] Title\nDepends on:\n\nBody\n', /empty dependency/);
    expectParseError(
      '## [a] A\nDepends on: nothing\n\nA\n\n## [b] B\nDepends on: a, a\n\nB\n',
      /repeats dependency/,
    );
  });

  it('rejects empty bodies', () => {
    expectParseError('## [item] Title\nDepends on: nothing\n', /empty brief body/);
    expectParseError('## [item] Title\nDepends on: nothing\n\n   \n', /empty brief body/);
  });

  it('rejects self, forward, and unknown dependencies with item context', () => {
    expectParseError('## [a] A\nDepends on: a\n\nA\n', /earlier item/);
    expectParseError(
      '## [a] A\nDepends on: b\n\nA\n\n## [b] B\nDepends on: nothing\n\nB\n',
      /earlier item/,
    );
    expectParseError('## [a] A\nDepends on: missing\n\nA\n', /earlier item/);
  });

  it('fails for a missing queue file with the queue path', async () => {
    await assert.rejects(() => readQueue(tmpDir, DEFAULT_CONFIG), /queue\.md/);
  });
});

describe('queue projection', () => {
  it('derives state precedence, selected change ids, and rejection counts', async () => {
    const content = queueContent([
      { slug: 'alpha', title: 'Alpha' },
      { slug: 'beta', title: 'Beta' },
      { slug: 'gamma', title: 'Gamma' },
      { slug: 'delta', title: 'Delta' },
      { slug: 'epsilon', title: 'Epsilon' },
      { slug: 'zeta', title: 'Zeta' },
      { slug: 'eta', title: 'Eta' },
    ]);
    await writeQueue(tmpDir, content);

    await createQueuedChange(tmpDir, 'archive', '010-alpha', {
      slug: 'alpha',
      hash: sectionHash(content, 'alpha'),
    });
    await createQueuedChange(tmpDir, 'active', '011-beta', {
      slug: 'beta',
      hash: sectionHash(content, 'beta'),
      approved: true,
      marker: 'dead',
    });
    await createQueuedChange(tmpDir, 'active', '012-gamma', {
      slug: 'gamma',
      hash: sectionHash(content, 'gamma'),
      approved: true,
      marker: 'running',
    });
    await createQueuedChange(tmpDir, 'active', '013-delta', {
      slug: 'delta',
      hash: sectionHash(content, 'delta'),
      approved: true,
    });
    await createQueuedChange(tmpDir, 'active', '014-epsilon', {
      slug: 'epsilon',
      hash: sectionHash(content, 'epsilon'),
    });
    await createQueuedChange(tmpDir, 'rejected', '015-zeta', {
      slug: 'zeta',
      hash: sectionHash(content, 'zeta'),
    });
    await createQueuedChange(tmpDir, 'rejected', '016-zeta-second', {
      slug: 'zeta',
      hash: sectionHash(content, 'zeta'),
    });

    const projection = await projectQueue(tmpDir, DEFAULT_CONFIG);
    const rows = bySlug(projection);

    assert.equal(projection.totalCount, 7);
    assert.equal(projection.landedCount, 1);
    assert.equal(rows.get('alpha')?.state, 'landed');
    assert.equal(rows.get('alpha')?.changeId, '010');
    assert.equal(rows.get('beta')?.state, 'dead');
    assert.equal(rows.get('beta')?.changeId, '011');
    assert.equal(rows.get('gamma')?.state, 'running');
    assert.equal(rows.get('gamma')?.changeId, '012');
    assert.equal(rows.get('delta')?.state, 'approved');
    assert.equal(rows.get('delta')?.changeId, '013');
    assert.equal(rows.get('epsilon')?.state, 'planned');
    assert.equal(rows.get('epsilon')?.changeId, '014');
    assert.equal(rows.get('zeta')?.state, 'rejected');
    assert.equal(rows.get('zeta')?.changeId, '016');
    assert.equal(rows.get('zeta')?.rejectionCount, 2);
    assert.equal(rows.get('eta')?.state, 'unplanned');
    assert.equal(rows.get('eta')?.changeId, null);
    assert.equal(rows.get('eta')?.rejectionCount, 0);
  });

  it('retains rejected counts on a replanned active item and never lands done-but-unarchived', async () => {
    const content = queueContent([
      { slug: 'alpha', title: 'Alpha' },
      { slug: 'beta', title: 'Beta' },
    ]);
    await writeQueue(tmpDir, content);
    await createQueuedChange(tmpDir, 'rejected', '020-alpha', {
      slug: 'alpha',
      hash: sectionHash(content, 'alpha'),
    });
    await createQueuedChange(tmpDir, 'rejected', '021-alpha-second', {
      slug: 'alpha',
      hash: sectionHash(content, 'alpha'),
    });
    await createQueuedChange(tmpDir, 'active', '022-alpha', {
      slug: 'alpha',
      hash: sectionHash(content, 'alpha'),
    });
    await createQueuedChange(tmpDir, 'active', '023-beta', {
      slug: 'beta',
      hash: sectionHash(content, 'beta'),
      approved: true,
      marker: 'done',
    });

    const projection = await projectQueue(tmpDir, DEFAULT_CONFIG);
    const rows = bySlug(projection);

    assert.equal(rows.get('alpha')?.state, 'planned');
    assert.equal(rows.get('alpha')?.changeId, '022');
    assert.equal(rows.get('alpha')?.rejectionCount, 2);
    assert.equal(rows.get('beta')?.state, 'approved');
    assert.equal(rows.get('beta')?.changeId, '023');
    assert.equal(projection.landedCount, 0);
  });

  it('derives unmet queue dependencies from landed associations only', async () => {
    const content = queueContent([
      { slug: 'alpha', title: 'Alpha' },
      { slug: 'beta', title: 'Beta', depends: 'alpha' },
      { slug: 'gamma', title: 'Gamma', depends: 'beta' },
      { slug: 'delta', title: 'Delta', depends: 'alpha' },
    ]);
    await writeQueue(tmpDir, content);
    await createQueuedChange(tmpDir, 'archive', '030-alpha', {
      slug: 'alpha',
      hash: sectionHash(content, 'alpha'),
    });
    await createQueuedChange(tmpDir, 'active', '031-beta', {
      slug: 'beta',
      hash: sectionHash(content, 'beta'),
      approved: true,
      marker: 'done',
    });
    await createQueuedChange(tmpDir, 'rejected', '032-delta', {
      slug: 'delta',
      hash: sectionHash(content, 'delta'),
    });

    const projection = await projectQueue(tmpDir, DEFAULT_CONFIG);
    const rows = bySlug(projection);

    assert.deepEqual(rows.get('alpha')?.unmetDependencies, []);
    assert.deepEqual(rows.get('beta')?.unmetDependencies, []);
    assert.deepEqual(rows.get('gamma')?.unmetDependencies, ['beta']);
    assert.deepEqual(rows.get('delta')?.unmetDependencies, []);
  });

  it('does not let a rejected dependency land an item', async () => {
    const content = queueContent([
      { slug: 'one', title: 'One' },
      { slug: 'two', title: 'Two', depends: 'one' },
    ]);
    await writeQueue(tmpDir, content);
    await createQueuedChange(tmpDir, 'rejected', '040-one', {
      slug: 'one',
      hash: sectionHash(content, 'one'),
    });

    const projection = await projectQueue(tmpDir, DEFAULT_CONFIG);
    const rows = bySlug(projection);
    assert.equal(rows.get('one')?.state, 'rejected');
    assert.deepEqual(rows.get('two')?.unmetDependencies, ['one']);
  });

  it('annotates changed since planned from the selected association hash', async () => {
    const content = queueContent([
      { slug: 'alpha', title: 'Alpha' },
      { slug: 'beta', title: 'Beta' },
      { slug: 'gamma', title: 'Gamma' },
    ]);
    await writeQueue(tmpDir, content);
    await createQueuedChange(tmpDir, 'active', '050-alpha', {
      slug: 'alpha',
      hash: sectionHash(content, 'alpha'),
    });
    await createQueuedChange(tmpDir, 'active', '051-beta', {
      slug: 'beta',
      hash: 'sha256:deadbeef',
    });
    await createQueuedChange(tmpDir, 'active', '052-gamma', { slug: 'gamma', hash: null });

    const projection = await projectQueue(tmpDir, DEFAULT_CONFIG);
    const rows = bySlug(projection);

    assert.equal(rows.get('alpha')?.changedSincePlanned, false);
    assert.equal(rows.get('beta')?.changedSincePlanned, true);
    assert.equal(rows.get('gamma')?.changedSincePlanned, true);
  });

  it('associates only through brief queue_item metadata, not folder names', async () => {
    const content = queueContent([{ slug: 'ghost', title: 'Ghost' }]);
    await writeQueue(tmpDir, content);
    await writeAt(tmpDir, 'openspec/changes/060-ghost/proposal.md', proposalMd('Ghost'));
    await writeAt(tmpDir, 'openspec/changes/061-garbage/readme.txt', 'nothing');
    await createQueuedChange(tmpDir, 'active', '062-other', { slug: 'other', hash: null });

    const projection = await projectQueue(tmpDir, DEFAULT_CONFIG);
    assert.equal(projection.items.length, 1);
    assert.equal(projection.items[0].state, 'unplanned');
    assert.equal(projection.items[0].changeId, null);
  });

  it('ignores malformed unrelated folders without hiding valid queue items', async () => {
    const content = queueContent([{ slug: 'alpha', title: 'Alpha' }]);
    await writeQueue(tmpDir, content);
    // Malformed frontmatter in an unrelated change folder must not abort the scan.
    await writeAt(
      tmpDir,
      'openspec/changes/200-broken/brief.md',
      '---\nqueue_item: [unterminated\n---\nbody\n',
    );
    // A loose non-directory entry where a change folder is expected is skipped.
    await writeAt(tmpDir, 'openspec/changes/201-loose.txt', 'not a change folder');
    await createQueuedChange(tmpDir, 'active', '202-alpha', {
      slug: 'alpha',
      hash: sectionHash(content, 'alpha'),
    });

    const projection = await projectQueue(tmpDir, DEFAULT_CONFIG);
    assert.equal(projection.items.length, 1);
    assert.equal(projection.items[0].slug, 'alpha');
    assert.equal(projection.items[0].state, 'planned');
    assert.equal(projection.items[0].changeId, '202');
  });

  it('reports ambiguous multiple active associations instead of choosing silently', async () => {
    const content = queueContent([{ slug: 'dup', title: 'Dup' }]);
    await writeQueue(tmpDir, content);
    await createQueuedChange(tmpDir, 'active', '070-dup-a', { slug: 'dup', hash: null });
    await createQueuedChange(tmpDir, 'active', '071-dup-b', { slug: 'dup', hash: null });

    await assert.rejects(() => projectQueue(tmpDir, DEFAULT_CONFIG), /[Aa]mbiguous/);
  });

  it('reports ambiguous multiple archived associations', async () => {
    const content = queueContent([{ slug: 'dup', title: 'Dup' }]);
    await writeQueue(tmpDir, content);
    await createQueuedChange(tmpDir, 'archive', '080-dup-a', { slug: 'dup', hash: null });
    await createQueuedChange(tmpDir, 'archive', '081-dup-b', { slug: 'dup', hash: null });

    await assert.rejects(() => projectQueue(tmpDir, DEFAULT_CONFIG), /[Aa]mbiguous/);
  });

  it('prefers an archived association over active and rejected ones', async () => {
    const content = queueContent([{ slug: 'alpha', title: 'Alpha' }]);
    await writeQueue(tmpDir, content);
    await createQueuedChange(tmpDir, 'rejected', '090-alpha', { slug: 'alpha', hash: null });
    await createQueuedChange(tmpDir, 'active', '091-alpha', { slug: 'alpha', hash: null });
    await createQueuedChange(tmpDir, 'archive', '092-alpha', { slug: 'alpha', hash: null });

    const projection = await projectQueue(tmpDir, DEFAULT_CONFIG);
    assert.equal(projection.items[0].state, 'landed');
    assert.equal(projection.items[0].changeId, '092');
    assert.equal(projection.items[0].rejectionCount, 1);
  });

  it('derives state afresh on every call with no cache between projections', async () => {
    const content = queueContent([{ slug: 'alpha', title: 'Alpha' }]);
    await writeQueue(tmpDir, content);
    await createQueuedChange(tmpDir, 'active', '100-alpha', {
      slug: 'alpha',
      hash: sectionHash(content, 'alpha'),
    });

    const first = await projectQueue(tmpDir, DEFAULT_CONFIG);
    assert.equal(first.items[0].state, 'planned');

    await writeAt(tmpDir, 'openspec/changes/100-alpha/.run/approved', 'sha256:fixture\n');
    const second = await projectQueue(tmpDir, DEFAULT_CONFIG);
    assert.equal(second.items[0].state, 'approved');
  });

  it('formats every projected row deterministically', async () => {
    const projection = {
      items: [
        {
          slug: 'alpha',
          title: 'Alpha',
          state: 'planned' as const,
          changeId: '010',
          rejectionCount: 1,
          changedSincePlanned: true,
          unmetDependencies: ['dep'],
        },
      ],
      landedCount: 0,
      totalCount: 1,
    };
    assert.equal(
      formatQueue(projection),
      'Queue:\n  alpha: Alpha [planned] change: 010 rejections: 1 unmet: dep changed since planned',
    );
    assert.equal(formatQueue(projection), formatQueue(projection));
  });
});

describe('osq queue CLI', () => {
  it('registers the queue command in the commander program', () => {
    const program = createProgram();
    const queueCmd = program.commands.find((cmd) => cmd.name() === 'queue');
    assert.ok(queueCmd, 'queue command should be registered');
    assert.ok(queueCmd.description().length > 0);
  });

  it('prints the projection through createProgram without changing queue bytes or metadata', async () => {
    const content = queueContent([
      { slug: 'alpha', title: 'Alpha' },
      { slug: 'beta', title: 'Beta', depends: 'alpha' },
      { slug: 'gamma', title: 'Gamma', depends: 'beta' },
    ]);
    const queuePath = await writeQueue(tmpDir, content);
    await createQueuedChange(tmpDir, 'archive', '110-alpha', {
      slug: 'alpha',
      hash: sectionHash(content, 'alpha'),
    });
    await createQueuedChange(tmpDir, 'rejected', '111-beta', {
      slug: 'beta',
      hash: 'sha256:different',
    });
    await createQueuedChange(tmpDir, 'rejected', '112-beta-second', {
      slug: 'beta',
      hash: 'sha256:different',
    });

    const beforeBytes = await fs.readFile(queuePath);
    const beforeStat = await fs.stat(queuePath);

    const output = await runQueueCli(tmpDir);

    assert.match(output, /^Queue:/);
    assert.match(output, /alpha: Alpha \[landed\] change: 110 rejections: 0/);
    assert.match(output, /beta: Beta \[rejected\] change: 112 rejections: 2 changed since planned/);
    assert.match(output, /gamma: Gamma \[unplanned\] rejections: 0 unmet: beta/);

    const afterBytes = await fs.readFile(queuePath);
    const afterStat = await fs.stat(queuePath);
    assert.deepEqual(afterBytes, beforeBytes);
    assert.equal(afterStat.size, beforeStat.size);
    assert.equal(afterStat.mtimeMs, beforeStat.mtimeMs);
  });

  it('prints identical output on repeated invocations', async () => {
    const content = queueContent([{ slug: 'alpha', title: 'Alpha' }]);
    await writeQueue(tmpDir, content);

    const first = await runQueueCli(tmpDir);
    const second = await runQueueCli(tmpDir);
    assert.equal(first, second);
  });
});
