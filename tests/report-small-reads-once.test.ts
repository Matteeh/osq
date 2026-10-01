import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, mock } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { getMetricsReport } from '../src/core/report/report.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  mock.restoreAll();
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

/** One queue item line, dependency line and one-line body. */
function queueItem(slug: string, title: string, dependsOn: string): string {
  return `## [${slug}] ${title}\nDepends on: ${dependsOn}\nA one-line body.\n`;
}

/** Add one archived change with every small file the report reads. */
async function writeChange(root: string, slug: string, queueItemName: string): Promise<void> {
  const folder = path.join(root, 'openspec', 'changes', 'archive', slug);
  await writeFile(
    path.join(folder, 'proposal.md'),
    `---\ntitle: ${queueItemName}\ndepends_on: []\nverify: node verify.cjs\n---\n\n## Goal\n\nDo the thing.\n`,
  );
  await writeFile(
    path.join(folder, 'brief.md'),
    `---\nqueue_item: ${queueItemName}\nplanner: null\n---\n`,
  );
  await writeFile(path.join(folder, 'tasks.md'), '- [x] 1. Do the thing\n');
  await writeFile(
    path.join(folder, 'tasks', '1.md'),
    '---\ntitle: Task one\nverify: node verify.cjs\nscope: [a.ts]\n---\n\n## Acceptance\n\n- [ ] It works\n',
  );
  await writeFile(path.join(folder, '.run', 'approved'), 'sha256:abc\n');
  await writeFile(path.join(folder, '.run', 'done', '1'), '');
  await writeFile(
    path.join(folder, '.run', 'manifest.json'),
    `${JSON.stringify(
      {
        createdAt: '2026-01-01T00:00:00.000Z',
        createdAtSource: 'created',
        approvedAt: '2026-01-02T00:00:00.000Z',
        approvalFlags: { mode: 'shown', ids: [] },
      },
      null,
      2,
    )}\n`,
  );
  const events = [
    {
      type: 'measures',
      timestamp: '2026-01-02T01:00:00.000Z',
      data: { phase: 'start', scopeFiles: 1 },
    },
    { type: 'measures', timestamp: '2026-01-02T02:00:00.000Z', data: { phase: 'end' } },
    { type: 'done', timestamp: '2026-01-02T02:00:00.000Z', data: {} },
  ];
  await writeFile(
    path.join(folder, '.run', 'events', '1.jsonl'),
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
  );
}

/** Build three archived queue changes beside an empty home directory. */
async function buildProject(): Promise<{ root: string; home: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-small-reads-'));
  tmpDirs.push(dir);
  const root = path.join(dir, 'project');
  const home = path.join(dir, 'home');
  await fs.mkdir(home, { recursive: true });
  await writeFile(
    path.join(root, 'openspec', 'queue.md'),
    [
      queueItem('item-1', 'Item one', 'nothing'),
      queueItem('item-2', 'Item two', 'item-1'),
      queueItem('item-3', 'Item three', 'item-2'),
    ].join('\n'),
  );
  await writeChange(root, '001-item-1', 'item-1');
  await writeChange(root, '002-item-2', 'item-2');
  await writeChange(root, '003-item-3', 'item-3');
  return { root, home };
}

/** Every task file, brief, manifest and proposal under `root`, sorted. */
async function listTargets(root: string): Promise<string[]> {
  const targets: string[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const isTaskFile = path.basename(current) === 'tasks' && entry.name.endsWith('.md');
        const isManifest = path.basename(current) === '.run' && entry.name === 'manifest.json';
        if (entry.name === 'proposal.md' || entry.name === 'brief.md' || isTaskFile || isManifest) {
          targets.push(fullPath);
        }
      }
    }
  };
  await walk(root);
  return targets.sort();
}

/** Count reads per path through the default `node:fs/promises` export. */
function countReads(): Map<string, number> {
  const reads = new Map<string, number>();
  const original = fs.readFile.bind(fs);
  mock.method(fs, 'readFile', (...args: unknown[]) => {
    const filePath = String(args[0]);
    reads.set(filePath, (reads.get(filePath) ?? 0) + 1);
    return (original as (...rest: unknown[]) => Promise<unknown>)(...args);
  });
  return reads;
}

function reportCounts(reads: Map<string, number>, targets: readonly string[]): string {
  return targets.map((file) => `${file}: ${reads.get(file) ?? 0}`).join('\n');
}

describe('report reads each small change file once', () => {
  it('reads each task file, brief, manifest and proposal exactly once per run', async () => {
    const { root, home } = await buildProject();
    const reads = countReads();

    await getMetricsReport(root, DEFAULT_CONFIG, { home });

    const targets = await listTargets(root);
    const repeated = targets.filter((file) => (reads.get(file) ?? 0) > 1);
    assert.deepEqual(repeated, [], `files read more than once:\n${reportCounts(reads, repeated)}`);
    for (const file of targets) {
      assert.equal(
        reads.get(file),
        1,
        `${file} should be read exactly once, got ${reads.get(file) ?? 0}\n${reportCounts(reads, targets)}`,
      );
    }
  });

  it('reads each of those files again on a second report run', async () => {
    const { root, home } = await buildProject();
    const reads = countReads();

    await getMetricsReport(root, DEFAULT_CONFIG, { home });
    await getMetricsReport(root, DEFAULT_CONFIG, { home });

    const targets = await listTargets(root);
    for (const file of targets) {
      assert.equal(
        reads.get(file),
        2,
        `${file} should be read twice, got ${reads.get(file) ?? 0}\n${reportCounts(reads, targets)}`,
      );
    }
  });
});
