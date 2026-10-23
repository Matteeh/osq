import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { CommandError } from '../src/cli/command-error.js';
import { planCommand } from '../src/cli/plan.js';
import { createForwardedRunner } from '../src/cli/remote-commands.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { parseFrontmatter } from '../src/core/spec/parser.js';
import { prepareQueuePlan, projectQueue } from '../src/core/status/queue.js';

const OPENSPEC = 'openspec';
const QUEUE_PATH = 'openspec/queue.md';

interface ItemSpec {
  slug: string;
  title: string;
  depends?: string;
}

function queueContent(items: ItemSpec[]): string {
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

function proposalMd(title: string): string {
  return [
    '---',
    `title: ${title}`,
    'depends_on: []',
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

async function writeAt(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function createQueuedChange(root: string, folderName: string, slug: string): Promise<string> {
  const base = path.join(root, OPENSPEC, 'changes', folderName);
  await fs.mkdir(path.join(base, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(base, 'proposal.md'), proposalMd(folderName), 'utf8');
  await fs.writeFile(path.join(base, 'tasks', '1.md'), taskMd(), 'utf8');
  await fs.writeFile(
    path.join(base, 'brief.md'),
    `---\nqueue_item: ${slug}\n---\nBrief body for ${slug}.\n`,
    'utf8',
  );
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

/** Run one test in its own temporary project and always remove it. */
async function withProject(test: (root: string) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-queue-plan-slug-'));
  process.exitCode = undefined;
  try {
    await test(root);
  } finally {
    process.exitCode = undefined;
    await fs.rm(root, { recursive: true, force: true });
  }
}

/** Run a plan with captured stdout and return the printed prompt. */
async function capturePlan(options: Parameters<typeof planCommand>[1]): Promise<string> {
  let stdout = '';
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Buffer) => {
    stdout += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    await planCommand(undefined, options);
  } finally {
    process.stdout.write = originalWrite;
  }
  return stdout;
}

/** Run a plan expected to refuse and return its CommandError. */
async function refusedPlan(
  root: string,
  slug: string,
  options: Parameters<typeof planCommand>[1] = {},
): Promise<CommandError> {
  let caught: unknown;
  try {
    await planCommand(undefined, { ...options, next: slug, print: true, cwd: root });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof CommandError, `expected a CommandError, got ${String(caught)}`);
  assert.equal(caught.exitCode, 1);
  return caught;
}

describe('named queue item planning', () => {
  it('plans the named item while an earlier eligible item stays unplanned', async () => {
    await withProject(async (root) => {
      const content = queueContent([
        { slug: 'first', title: 'First' },
        { slug: 'second', title: 'Second' },
      ]);
      await writeAt(root, QUEUE_PATH, content);

      const stdout = await capturePlan({ next: 'second', print: true, cwd: root });

      assert.deepEqual(await activeFolders(root), ['001-second']);
      const folder = path.join(activeRoot(root), '001-second');
      const brief = parseFrontmatter(await fs.readFile(path.join(folder, 'brief.md'), 'utf8'));
      assert.equal(brief.data.queue_item, 'second');
      assert.equal(brief.data.queue_hash, sectionHash(content, 'second'));
      assert.match(stdout, /# Change: 001 - Second/);
      assert.ok(stdout.includes('Brief body for second.'), 'prompt carries the named brief');
      assert.ok(!stdout.includes('Brief body for first.'), 'prompt omits the earlier brief');

      const projection = await projectQueue(root, DEFAULT_CONFIG);
      const first = projection.items.find((item) => item.slug === 'first');
      assert.equal(first?.state, 'unplanned');
    });
  });

  it('picks the named row through prepareQueuePlan and keeps the slugless pick first', async () => {
    await withProject(async (root) => {
      const content = queueContent([
        { slug: 'first', title: 'First' },
        { slug: 'second', title: 'Second' },
      ]);
      await writeAt(root, QUEUE_PATH, content);

      const named = await prepareQueuePlan(root, DEFAULT_CONFIG, { slug: 'second' });
      assert.equal(named.kind, 'ready');
      if (named.kind === 'ready') assert.equal(named.selection.item.slug, 'second');

      const first = await prepareQueuePlan(root, DEFAULT_CONFIG);
      assert.equal(first.kind, 'ready');
      if (first.kind === 'ready') assert.equal(first.selection.item.slug, 'first');
    });
  });
});

describe('named queue item refused', () => {
  it('refuses a slug that is not in the queue and creates no change folder', async () => {
    await withProject(async (root) => {
      await writeAt(root, QUEUE_PATH, queueContent([{ slug: 'first', title: 'First' }]));

      const error = await refusedPlan(root, 'missing');

      assert.equal(error.message, 'Queue item "missing" is not in the queue.');
      assert.deepEqual(await activeFolders(root), []);
    });
  });

  it('refuses an item that already has a planned change and creates no change folder', async () => {
    await withProject(async (root) => {
      await writeAt(root, QUEUE_PATH, queueContent([{ slug: 'first', title: 'First' }]));
      await createQueuedChange(root, '001-first', 'first');

      const error = await refusedPlan(root, 'first');

      assert.equal(error.message, 'Queue item "first" already has change 001 (planned).');
      assert.deepEqual(await activeFolders(root), ['001-first']);
    });
  });

  it('refuses an item waiting on an unlanded dependency and creates no change folder', async () => {
    await withProject(async (root) => {
      await writeAt(
        root,
        QUEUE_PATH,
        queueContent([
          { slug: 'first', title: 'First' },
          { slug: 'second', title: 'Second', depends: 'first' },
        ]),
      );

      const error = await refusedPlan(root, 'second');

      assert.equal(error.message, 'Queue item "second" is waiting on first.');
      assert.deepEqual(await activeFolders(root), []);
    });
  });
});

describe('named queue item guards', () => {
  it('refuses --run combined with --next whether the flag is bare or carries a slug', async () => {
    await withProject(async (root) => {
      await assert.rejects(
        () => planCommand(undefined, { next: true, run: true, cwd: root }),
        /`--run` cannot be combined with `--next`/,
      );
      await assert.rejects(
        () => planCommand(undefined, { next: 'second', run: true, cwd: root }),
        /`--run` cannot be combined with `--next`/,
      );
      assert.deepEqual(await activeFolders(root), []);
    });
  });

  it('treats a forwarded slug as next mode instead of demanding a briefed change', async () => {
    await withProject(async (root) => {
      await writeAt(
        root,
        QUEUE_PATH,
        queueContent([
          { slug: 'first', title: 'First' },
          { slug: 'second', title: 'Second' },
        ]),
      );
      const runner = createForwardedRunner(root);

      const end = await runner(
        { command: 'plan', args: [], options: { next: 'second', print: true } },
        () => {},
      );

      assert.deepEqual(end, { exitCode: 0, error: null, next: null });
      assert.deepEqual(await activeFolders(root), ['001-second']);
    });
  });
});
