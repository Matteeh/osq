import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createProgram } from '../src/cli/index.js';
import { buildOpeningPrompt, formatBriefContent, planCommand } from '../src/cli/plan.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { createNewSpec, getNextSpecNumber } from '../src/core/new.js';
import { parseFrontmatter } from '../src/core/parser.js';
import { findActiveQueueFailures, prepareQueuePlan, projectQueue } from '../src/core/queue.js';
import { MockAdapter } from '../src/harness/mock.js';

const OPENSPEC = 'openspec';
const QUEUE_PATH = 'openspec/queue.md';

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

function proposalMd(title: string, dependsOn: string[] = []): string {
  const deps = dependsOn.length > 0 ? `[${dependsOn.map((d) => `"${d}"`).join(', ')}]` : '[]';
  return [
    '---',
    `title: ${title}`,
    `depends_on: ${deps}`,
    'verify: node -e "process.exit(0)"',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    `${title} goal.`,
    '',
  ].join('\n');
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

async function writeAt(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function writeQueue(root: string, content: string): Promise<void> {
  await writeAt(root, QUEUE_PATH, content);
}

type Location = 'active' | 'archive' | 'rejected';
type Marker = 'dead' | 'regressed' | 'change-regressed' | 'done';

async function createQueuedChange(
  root: string,
  location: Location,
  folderName: string,
  options: {
    slug: string;
    hash?: string | null;
    approved?: boolean;
    marker?: Marker;
    reason?: string;
  },
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
  const reason = options.reason ?? 'verify_red';
  if (options.marker === 'dead') {
    await writeAt(base, '.run/dead/1.md', `---\nreason: ${reason}\n---\nfailed\n`);
  }
  if (options.marker === 'regressed') {
    await writeAt(base, '.run/regressed/1.md', `---\nreason: ${reason}\n---\nfailed\n`);
  }
  if (options.marker === 'change-regressed') {
    await writeAt(base, '.run/regressed/change.md', `---\nreason: ${reason}\n---\nfailed\n`);
  }
  if (options.marker === 'done') await writeAt(base, '.run/done/1', '');
  return base;
}

function activeRoot(root: string): string {
  return path.join(root, OPENSPEC, 'changes');
}

async function activeFolders(root: string): Promise<string[]> {
  const entries = await fs.readdir(activeRoot(root), { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== 'archive' && entry.name !== 'rejected')
    .map((entry) => entry.name)
    .sort();
}

async function snapshot(root: string): Promise<string[]> {
  const walk = async (dir: string, prefix: string): Promise<string[]> => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const out: string[] = [];
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) out.push(...(await walk(path.join(dir, entry.name), rel)));
      else out.push(rel);
    }
    return out;
  };
  return (await walk(root, '')).sort();
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-queue-plan-'));
  process.exitCode = undefined;
});

afterEach(async () => {
  process.exitCode = undefined;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('queue brief and prompt seeding', () => {
  it('writes only the item body plus planner, date, and queue metadata', () => {
    const output = formatBriefContent('The item body.', 'mock-model', '2026-01-02', {
      queue_item: 'alpha',
      queue_hash: 'sha256:deadbeef',
    });
    const { data, body } = parseFrontmatter(output);
    assert.equal(data.queue_item, 'alpha');
    assert.equal(data.queue_hash, 'sha256:deadbeef');
    assert.equal(data.planner, 'mock-model');
    assert.equal(data.date, '2026-01-02');
    assert.equal(body.trim(), 'The item body.');
  });

  it('identifies landed dependency archive paths in the change context only when supplied', async () => {
    await writeAt(tmpDir, 'PLANNER.md', '# Planner\n');
    const base = {
      projectRoot: tmpDir,
      folderPath: path.join(tmpDir, 'openspec', 'changes', '005-beta'),
      specId: '005',
      specTitle: 'Beta',
      briefContent: 'Brief.',
      openspecRoot: OPENSPEC,
    };
    const withDeps = await buildOpeningPrompt({
      ...base,
      dependencyPaths: ['openspec/changes/archive/004-alpha'],
    });
    assert.match(withDeps, /Landed dependencies:\n- openspec\/changes\/archive\/004-alpha/);
    assert.ok(!withDeps.includes('queue.md'), 'prompt must not embed the queue file');

    const withoutDeps = await buildOpeningPrompt(base);
    assert.ok(!withoutDeps.includes('Landed dependencies'));
  });
});

describe('createNewSpec queue seeding', () => {
  it('uses an explicit slug, title, and numeric dependency ids while keeping the body', async () => {
    const result = await createNewSpec(tmpDir, 'Queue Item Title', {
      slug: 'queue-item',
      dependsOn: ['001', '002'],
    });
    assert.equal(result.folderName, '001-queue-item');
    const proposal = await fs.readFile(path.join(result.folderPath, 'proposal.md'), 'utf8');
    assert.match(proposal, /^title: Queue Item Title$/m);
    assert.match(proposal, /^depends_on: \["001", "002"\]$/m);
    assert.match(proposal, /^## Goal$/m);
    assert.match(proposal, /^## Contract$/m);
  });

  it('numbers across active, archived, and rejected folders', async () => {
    const changesDir = activeRoot(tmpDir);
    await fs.mkdir(path.join(changesDir, '005-active'), { recursive: true });
    await fs.mkdir(path.join(changesDir, 'archive', '007-archived'), { recursive: true });
    await fs.mkdir(path.join(changesDir, 'rejected', '009-rejected'), { recursive: true });
    assert.equal(await getNextSpecNumber(changesDir), '010');
  });
});

describe('queue next-item preparation', () => {
  it('selects the first unplanned item with landed dependencies and records archive paths', async () => {
    const content = queueContent([
      { slug: 'alpha', title: 'Alpha' },
      { slug: 'beta', title: 'Beta', depends: 'alpha' },
      { slug: 'gamma', title: 'Gamma', depends: 'beta' },
    ]);
    await writeQueue(tmpDir, content);
    await createQueuedChange(tmpDir, 'archive', '020-alpha', {
      slug: 'alpha',
      hash: sectionHash(content, 'alpha'),
    });

    const preparation = await prepareQueuePlan(tmpDir, DEFAULT_CONFIG);
    assert.equal(preparation.kind, 'ready');
    if (preparation.kind !== 'ready') return;
    assert.equal(preparation.selection.item.slug, 'beta');
    assert.equal(preparation.selection.row.state, 'unplanned');
    assert.equal(preparation.selection.replan, false);
    assert.deepEqual(preparation.selection.landedDependencies, [
      { slug: 'alpha', changeId: '020', archivePath: 'openspec/changes/archive/020-alpha' },
    ]);
  });

  it('skips active items and waits until a dependency lands', async () => {
    const content = queueContent([
      { slug: 'alpha', title: 'Alpha' },
      { slug: 'beta', title: 'Beta', depends: 'alpha' },
      { slug: 'gamma', title: 'Gamma', depends: 'beta' },
    ]);
    await writeQueue(tmpDir, content);
    await createQueuedChange(tmpDir, 'archive', '021-alpha', {
      slug: 'alpha',
      hash: sectionHash(content, 'alpha'),
    });
    await createQueuedChange(tmpDir, 'active', '022-beta', {
      slug: 'beta',
      hash: sectionHash(content, 'beta'),
    });

    const waiting = await prepareQueuePlan(tmpDir, DEFAULT_CONFIG);
    assert.equal(waiting.kind, 'refused');
    if (waiting.kind === 'refused') {
      assert.match(waiting.message, /No queue item is eligible to plan/);
      assert.match(waiting.message, /gamma: unplanned \(waiting on beta\)/);
    }

    await createQueuedChange(tmpDir, 'archive', '023-beta', {
      slug: 'beta',
      hash: sectionHash(content, 'beta'),
    });
    const ready = await prepareQueuePlan(tmpDir, DEFAULT_CONFIG);
    assert.equal(ready.kind, 'ready');
    if (ready.kind === 'ready') assert.equal(ready.selection.item.slug, 'gamma');
  });

  it('refuses when every item is landed or active', async () => {
    const content = queueContent([
      { slug: 'alpha', title: 'Alpha' },
      { slug: 'beta', title: 'Beta' },
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

    const preparation = await prepareQueuePlan(tmpDir, DEFAULT_CONFIG);
    assert.equal(preparation.kind, 'refused');
    if (preparation.kind === 'refused') {
      assert.match(preparation.message, /alpha: landed/);
      assert.match(preparation.message, /beta: approved/);
    }
  });
});

describe('queue active failure gate', () => {
  it('halts before mutation on every dead, regressed, and change-level target', async () => {
    const content = queueContent([
      { slug: 'alpha', title: 'Alpha' },
      { slug: 'beta', title: 'Beta' },
      { slug: 'gamma', title: 'Gamma' },
    ]);
    await writeQueue(tmpDir, content);
    await createQueuedChange(tmpDir, 'active', '040-beta', {
      slug: 'beta',
      hash: sectionHash(content, 'beta'),
      approved: true,
      marker: 'dead',
      reason: 'verify_red',
    });
    await createQueuedChange(tmpDir, 'active', '041-gamma', {
      slug: 'gamma',
      hash: sectionHash(content, 'gamma'),
      approved: true,
      marker: 'change-regressed',
    });

    const before = await snapshot(tmpDir);
    const preparation = await prepareQueuePlan(tmpDir, DEFAULT_CONFIG);
    const after = await snapshot(tmpDir);

    assert.equal(preparation.kind, 'refused');
    if (preparation.kind === 'refused') {
      assert.match(preparation.message, /osq retry 040 1/);
      assert.match(preparation.message, /osq retry 041 change/);
      assert.ok(
        preparation.message.indexOf('040') < preparation.message.indexOf('041'),
        'failures sort by numeric change id',
      );
    }
    assert.deepEqual(after, before, 'preparation must not write any file');
  });

  it('treats attempt-suffixed history as inactive', async () => {
    const content = queueContent([{ slug: 'alpha', title: 'Alpha' }]);
    await writeQueue(tmpDir, content);
    const base = await createQueuedChange(tmpDir, 'active', '050-alpha', {
      slug: 'alpha',
      hash: sectionHash(content, 'alpha'),
      approved: true,
      marker: 'done',
    });
    await writeAt(base, '.run/dead/1.1.md', '---\nreason: verify_red\n---\nfailed\n');

    const failures = await findActiveQueueFailures(tmpDir, DEFAULT_CONFIG);
    assert.deepEqual(failures, []);
  });
});

describe('queue rejection gate', () => {
  it('refuses a rejected first eligible item without replan and preserves history', async () => {
    const content = queueContent([
      { slug: 'alpha', title: 'Alpha' },
      { slug: 'beta', title: 'Beta', depends: 'alpha' },
    ]);
    await writeQueue(tmpDir, content);
    const rejected = await createQueuedChange(tmpDir, 'rejected', '060-alpha', {
      slug: 'alpha',
      hash: sectionHash(content, 'alpha'),
    });
    const markerBefore = await fs.readFile(path.join(rejected, 'brief.md'), 'utf8');

    const refused = await prepareQueuePlan(tmpDir, DEFAULT_CONFIG);
    assert.equal(refused.kind, 'refused');
    if (refused.kind === 'refused') {
      assert.match(refused.message, /--replan/);
      assert.match(refused.message, /1 rejected attempt/);
    }

    const replanned = await prepareQueuePlan(tmpDir, DEFAULT_CONFIG, { replan: true });
    assert.equal(replanned.kind, 'ready');
    if (replanned.kind === 'ready') {
      assert.equal(replanned.selection.item.slug, 'alpha');
      assert.equal(replanned.selection.replan, true);
      assert.deepEqual(replanned.selection.landedDependencies, []);
    }
    assert.equal(await fs.readFile(path.join(rejected, 'brief.md'), 'utf8'), markerBefore);
  });

  it('replans through the real command into one active attempt without touching rejected history', async () => {
    const content = queueContent([{ slug: 'alpha', title: 'Alpha' }]);
    await writeQueue(tmpDir, content);
    const rejected = await createQueuedChange(tmpDir, 'rejected', '060-alpha', {
      slug: 'alpha',
      hash: sectionHash(content, 'alpha'),
    });
    const rejectedBefore = await snapshot(rejected);

    // Without --replan the real command refuses and creates nothing.
    let stderr = '';
    const originalError = console.error;
    console.error = ((chunk: unknown) => {
      stderr += String(chunk);
      return true;
    }) as typeof console.error;
    try {
      await planCommand(undefined, { next: true, print: true, cwd: tmpDir });
    } finally {
      console.error = originalError;
    }
    assert.equal(process.exitCode, 1);
    assert.match(stderr, /--replan/);
    assert.deepEqual(await activeFolders(tmpDir), []);
    assert.deepEqual(await snapshot(rejected), rejectedBefore);

    // With --replan one new numbered active attempt appears and history survives.
    process.exitCode = undefined;
    let stdout = '';
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Buffer) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;
    try {
      await planCommand(undefined, { next: true, print: true, replan: true, cwd: tmpDir });
    } finally {
      process.stdout.write = originalWrite;
    }

    const active = await activeFolders(tmpDir);
    assert.deepEqual(active, ['061-alpha']);
    const folder = path.join(activeRoot(tmpDir), '061-alpha');
    const brief = parseFrontmatter(await fs.readFile(path.join(folder, 'brief.md'), 'utf8'));
    assert.equal(brief.data.queue_item, 'alpha');
    assert.equal(brief.data.queue_hash, sectionHash(content, 'alpha'));
    assert.match(stdout, /# Change: 061 - Alpha/);
    assert.deepEqual(await snapshot(rejected), rejectedBefore);

    const projection = await projectQueue(tmpDir, DEFAULT_CONFIG);
    const row = projection.items.find((item) => item.slug === 'alpha');
    assert.equal(row?.state, 'planned');
    assert.equal(row?.rejectionCount, 1);
  });
});

describe('plan command modes', () => {
  it('registers the plan command with --next and --replan', () => {
    const program = createProgram();
    const planCmd = program.commands.find((command) => command.name() === 'plan');
    assert.ok(planCmd, 'plan command should be registered');
    assert.equal(planCmd.registeredArguments[0].name(), 'name');
    assert.ok(planCmd.options.find((option) => option.long === '--next'));
    assert.ok(planCmd.options.find((option) => option.long === '--replan'));
  });

  it('rejects missing and conflicting modes before any file is written', async () => {
    await assert.rejects(() => planCommand('alpha', { next: true }), /cannot be combined/);
    await assert.rejects(() => planCommand(undefined, {}), /change name or use/);
    await assert.rejects(() => planCommand('alpha', { replan: true }), /--replan/);
    await assert.rejects(
      () => planCommand(undefined, { next: true, brief: 'brief.md' }),
      /--brief/,
    );
  });

  it('plan --next --print creates the change and prints its prompt without spawning', async () => {
    const content = queueContent([{ slug: 'alpha', title: 'Queue Alpha' }]);
    await writeQueue(tmpDir, content);
    const spawnedBefore = MockAdapter.recordedInteractiveSpawns.length;
    let stdout = '';
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Buffer) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    try {
      await planCommand(undefined, { next: true, print: true, cwd: tmpDir });
    } finally {
      process.stdout.write = originalWrite;
    }

    assert.equal(MockAdapter.recordedInteractiveSpawns.length, spawnedBefore);
    const folder = path.join(activeRoot(tmpDir), '001-alpha');
    const proposal = await fs.readFile(path.join(folder, 'proposal.md'), 'utf8');
    assert.match(proposal, /^title: Queue Alpha$/m);
    const brief = await fs.readFile(path.join(folder, 'brief.md'), 'utf8');
    const parsed = parseFrontmatter(brief);
    assert.equal(parsed.data.queue_item, 'alpha');
    assert.equal(parsed.data.queue_hash, sectionHash(content, 'alpha'));
    assert.match(stdout, /# Change: 001 - Queue Alpha/);
    assert.ok(!stdout.includes('queue.md'), 'prompt must not embed the queue file');
  });
});
