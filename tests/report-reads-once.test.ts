import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, mock } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { getMetricsReport } from '../src/core/report/report.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const FIXTURE_REPORT_ROOT = path.join(ROOT, 'fixture', 'report');
const REPORT_SRC_DIR = path.join(ROOT, 'src', 'core', 'report');

/** Readers allowed to call `parseEventLines` directly: the parser and the scope. */
const PARSE_EVENT_LINES_ALLOWED = new Set([
  'report-events.ts',
  'stream-reads.ts',
  'archive-record-run.ts',
]);

const tmpDirs: string[] = [];

afterEach(async () => {
  mock.restoreAll();
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** Copy the report fixture beside a fresh, empty home into a temporary tree. */
async function copyFixture(): Promise<{ root: string; home: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-reads-once-'));
  tmpDirs.push(dir);
  const root = path.join(dir, 'report');
  const home = path.join(dir, 'home');
  // Other report tests build the read index inside fixture/report/.osq, whose -shm and -wal files come and go while this copy runs.
  const fixtureIndex = path.join(FIXTURE_REPORT_ROOT, '.osq');
  await fs.cp(FIXTURE_REPORT_ROOT, root, {
    recursive: true,
    filter: (source) => source !== fixtureIndex,
  });
  await fs.mkdir(home, { recursive: true });
  return { root, home };
}

/** Every `.jsonl` file under `dir`, as absolute paths, sorted. */
async function listJsonl(dir: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) found.push(fullPath);
    }
  };
  await walk(dir);
  return found.sort();
}

/** Count `.jsonl` reads through the default `node:fs/promises` export. */
function countJsonlReads(): Map<string, number> {
  const reads = new Map<string, number>();
  const original = fs.readFile.bind(fs);
  mock.method(fs, 'readFile', (...args: unknown[]) => {
    const filePath = String(args[0]);
    if (filePath.endsWith('.jsonl')) reads.set(filePath, (reads.get(filePath) ?? 0) + 1);
    return (original as (...rest: unknown[]) => Promise<unknown>)(...args);
  });
  return reads;
}

describe('report reads each event file once', () => {
  it('never reads a jsonl file twice and covers every archived stream once', async () => {
    const { root, home } = await copyFixture();
    const reads = countJsonlReads();

    await getMetricsReport(root, DEFAULT_CONFIG, { home });

    const repeated = [...reads].filter(([, count]) => count > 1);
    assert.deepEqual(repeated, [], `jsonl files read more than once: ${JSON.stringify(repeated)}`);

    for (const file of await listJsonl(path.join(root, 'specs', 'archive'))) {
      assert.equal(reads.get(file), 1, `${file} should be read exactly once`);
    }

    // Rejected changes contribute only their change-level stream to the report.
    const rejectedChanges = (await listJsonl(path.join(root, 'specs', 'rejected'))).filter(
      (file) => path.basename(file) === 'change.jsonl',
    );
    for (const file of rejectedChanges) {
      assert.equal(reads.get(file), 1, `${file} should be read exactly once`);
    }
  });

  it('reads fresh on a second call and counts a line added between the calls', async () => {
    const { root, home } = await copyFixture();
    const first = await getMetricsReport(root, DEFAULT_CONFIG, { home });

    const streamPath = path.join(
      root,
      'specs',
      'archive',
      '008-opencode-harness-adapter',
      '.run',
      'events',
      '1.jsonl',
    );
    const appended = `${JSON.stringify({
      type: 'tokens',
      timestamp: '2026-10-01T00:00:00.000Z',
      data: { input: 100, output: 50 },
    })}\n`;
    await fs.appendFile(streamPath, appended, 'utf8');

    const second = await getMetricsReport(root, DEFAULT_CONFIG, { home });
    assert.equal(second.tokens.total, first.tokens.total + 150);
  });

  it('parses event lines only in the shared reader', async () => {
    const violations: string[] = [];
    for (const entry of await fs.readdir(REPORT_SRC_DIR, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
      if (PARSE_EVENT_LINES_ALLOWED.has(entry.name)) continue;
      const content = await fs.readFile(path.join(REPORT_SRC_DIR, entry.name), 'utf8');
      if (content.includes('parseEventLines')) {
        violations.push(`${entry.name} calls parseEventLines`);
      }
    }
    assert.deepEqual(
      violations,
      [],
      `report modules parse events by themselves:\n${violations.join('\n')}`,
    );
  });
});
