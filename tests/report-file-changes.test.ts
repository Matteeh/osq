import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { type MetricsReport, getMetricsReport } from '../src/core/report.js';

const fixtureReportRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixture',
  'report',
);

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createArchivedSpec(projectRoot: string, folderName: string): Promise<string> {
  const folderPath = path.join(projectRoot, 'specs', 'archive', folderName);
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(folderPath, 'spec.md'),
    '---\ntitle: Spec\nfeatures:\n  reads: []\n  writes: []\n---\n## Goal\nx\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(folderPath, 'tasks', '1.md'),
    '---\ntitle: Task\nverify: node -e "process.exit(0)"\nscope: []\nentry: []\nskills: []\n---\n## Acceptance\n- [ ] x\n',
    'utf8',
  );
  return folderPath;
}

async function writeEvents(folderPath: string, events: unknown[]): Promise<void> {
  const eventsDir = path.join(folderPath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  await fs.writeFile(
    path.join(eventsDir, '1.jsonl'),
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
    'utf8',
  );
}

async function reportWith(eventsBySpec: Record<string, unknown[]>): Promise<MetricsReport> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-file-changes-'));
  tmpDirs.push(tmpDir);

  for (const [folderName, events] of Object.entries(eventsBySpec)) {
    const folderPath = await createArchivedSpec(tmpDir, folderName);
    await writeEvents(folderPath, events);
  }

  return getMetricsReport(tmpDir, DEFAULT_CONFIG);
}

function toolEvent(
  tool: string,
  data: Record<string, unknown>,
  timestamp = '2026-09-17T00:00:00.000Z',
): Record<string, unknown> {
  return { type: 'tool', timestamp, data: { tool, ...data } };
}

describe('report file change metrics', () => {
  describe('fixture/report', () => {
    it('counts edit and write tool events and deduplicates their paths', async () => {
      const report = await getMetricsReport(fixtureReportRoot, DEFAULT_CONFIG);

      assert.equal(report.fileChanges.totalChanges, 3);
      assert.equal(report.fileChanges.uniqueCount, 2);
      assert.deepEqual(report.fileChanges.uniqueFiles, [
        'src/harness/opencode.ts',
        'tests/opencode-tool-events.test.ts',
      ]);
    });

    it('stores edit and write tool events with duplicate paths in the 009 event stream', async () => {
      const eventsPath = path.join(
        fixtureReportRoot,
        'specs',
        'archive',
        '009-watcher-observability',
        '.run',
        'events',
        '5.jsonl',
      );
      const events = (await fs.readFile(eventsPath, 'utf8'))
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));

      const fileToolEvents = events.filter(
        (event) =>
          event.type === 'tool' &&
          typeof event.data?.tool === 'string' &&
          ['edit', 'write'].includes(event.data.tool.toLowerCase()),
      );

      assert.equal(fileToolEvents.length, 3);
      assert.equal(
        fileToolEvents.filter((event) => event.data.summary === 'src/harness/opencode.ts').length,
        2,
        'the duplicate edit path should appear twice',
      );
      assert.ok(
        events.some((event) => event.type === 'tool' && event.data?.tool === 'read'),
        'a read tool event should be present and ignored for file changes',
      );
    });
  });

  describe('path extraction and normalization', () => {
    it('extracts paths from summary, path, filePath, and file and normalizes them', async () => {
      const report = await reportWith({
        '001-extract': [
          toolEvent('edit', { summary: '  ./src/a.ts  ' }),
          toolEvent('write', { path: './src/b.ts' }),
          toolEvent('edit', { filePath: 'src/c.ts' }),
          toolEvent('write', { file: ' ./src/d.ts' }),
        ],
      });

      assert.equal(report.fileChanges.totalChanges, 4);
      assert.equal(report.fileChanges.uniqueCount, 4);
      assert.deepEqual(report.fileChanges.uniqueFiles, [
        'src/a.ts',
        'src/b.ts',
        'src/c.ts',
        'src/d.ts',
      ]);
    });

    it('is case-insensitive on the tool name and ignores non edit/write tools', async () => {
      const report = await reportWith({
        '001-ignore': [
          toolEvent('EDIT', { summary: 'src/upper.ts' }),
          toolEvent('Write', { summary: 'src/mixed.ts' }),
          toolEvent('read', { summary: 'src/read.ts' }),
          toolEvent('bash', { summary: 'ls -la' }),
          toolEvent('glob', { summary: 'src/**/*.ts' }),
        ],
      });

      assert.equal(report.fileChanges.totalChanges, 2);
      assert.deepEqual(report.fileChanges.uniqueFiles, ['src/mixed.ts', 'src/upper.ts']);
    });

    it('counts edit and write events without a usable path in the change total only', async () => {
      const report = await reportWith({
        '001-no-path': [
          toolEvent('edit', {}),
          toolEvent('write', { summary: '   ' }),
          toolEvent('edit', { summary: './' }),
        ],
      });

      assert.equal(report.fileChanges.totalChanges, 3);
      assert.equal(report.fileChanges.uniqueCount, 0);
      assert.deepEqual(report.fileChanges.uniqueFiles, []);
    });

    it('deduplicates the same normalized path across all specs', async () => {
      const report = await reportWith({
        '001-first': [toolEvent('edit', { summary: 'src/shared.ts' })],
        '002-second': [
          toolEvent('write', { summary: './src/shared.ts' }),
          toolEvent('edit', { file: 'src/other.ts' }),
        ],
      });

      assert.equal(report.fileChanges.totalChanges, 3);
      assert.equal(report.fileChanges.uniqueCount, 2);
      assert.deepEqual(report.fileChanges.uniqueFiles, ['src/other.ts', 'src/shared.ts']);
    });

    it('retains legacy file_changed events and normalizes their paths', async () => {
      const report = await reportWith({
        '001-legacy': [
          {
            type: 'file_changed',
            timestamp: '2026-09-17T00:00:00.000Z',
            data: { file: './src/legacy.ts' },
          },
          toolEvent('edit', { summary: 'src/tool.ts' }),
        ],
      });

      assert.equal(report.fileChanges.totalChanges, 2);
      assert.equal(report.fileChanges.uniqueCount, 2);
      assert.deepEqual(report.fileChanges.uniqueFiles, ['src/legacy.ts', 'src/tool.ts']);
    });
  });
});
