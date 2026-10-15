import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { queryCommand } from '../src/cli/query.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';

const MANUAL_DIR = path.join('openspec', 'manual');
const RECERTIFICATIONS =
  'recertifications(change, task, recertified_at, outcome, automatic, path, credited_to, source)';
const MANUAL_EDITS = 'manual_edits(kept_at, record, comment, paths, capabilities)';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** A fresh temporary project root, removed after the test. */
async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-query-manual-'));
  roots.push(root);
  return root;
}

/** Writes one file under the root, creating parent folders. */
async function write(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** One record file's text: `kept_at`, `paths`, `capabilities`, then the comment. */
function record(
  keptAt: string,
  paths: readonly string[],
  capabilities: readonly string[],
  comment: string,
): string {
  const lines = ['---', `kept_at: ${keptAt}`, 'paths:'];
  for (const entry of paths) lines.push(`  - ${entry}`);
  if (capabilities.length === 0) {
    lines.push('capabilities: []');
  } else {
    lines.push('capabilities:');
    for (const entry of capabilities) lines.push(`  - ${entry}`);
  }
  lines.push('---', comment, '');
  return lines.join('\n');
}

/** The stdout text a command wrote through captured writers. */
async function capture(
  root: string,
  options: { select?: string; json?: boolean } = {},
): Promise<{ text: string; error: string }> {
  let text = '';
  let error = '';
  await queryCommand({
    cwd: root,
    config: DEFAULT_CONFIG,
    stdout: (chunk) => {
      text += chunk;
    },
    stderr: (chunk) => {
      error += chunk;
    },
    ...options,
  });
  return { text, error };
}

describe('manual edits query table', () => {
  it('Manual edits of a project', async () => {
    const root = await makeRoot();
    await write(
      root,
      path.join(MANUAL_DIR, '2026-10-14T08-00-00-000Z.md'),
      record('2026-10-14T08:00:00.000Z', ['notes/todo.txt'], [], 'typo'),
    );
    await write(
      root,
      path.join(MANUAL_DIR, '2026-10-15T20-01-02-123Z.md'),
      record(
        '2026-10-15T20:01:02.123Z',
        ['osq.config.ts', 'src/a.ts'],
        ['cli-foundation'],
        'raise the verify timeout',
      ),
    );

    const { text, error } = await capture(root, {
      select:
        'select kept_at, record, comment, paths, capabilities from manual_edits order by kept_at',
      json: true,
    });

    assert.equal(error, '');
    assert.deepEqual(JSON.parse(text), [
      {
        kept_at: '2026-10-14T08:00:00.000Z',
        record: '2026-10-14T08-00-00-000Z.md',
        comment: 'typo',
        paths: 'notes/todo.txt',
        capabilities: '',
      },
      {
        kept_at: '2026-10-15T20:01:02.123Z',
        record: '2026-10-15T20-01-02-123Z.md',
        comment: 'raise the verify timeout',
        paths: 'osq.config.ts, src/a.ts',
        capabilities: 'cli-foundation',
      },
    ]);
  });

  it('No manual edits', async () => {
    const root = await makeRoot();

    const { text, error } = await capture(root, {
      select: 'select count(*) as n from manual_edits',
    });

    assert.equal(error, '');
    assert.deepEqual(text.trimEnd().split('\n'), ['n', '0']);
  });

  it('Manual edits listed', async () => {
    const root = await makeRoot();

    const { text, error } = await capture(root);

    assert.equal(error, '');
    const lines = text.trimEnd().split('\n');
    assert.equal(lines.at(-1), MANUAL_EDITS);
    assert.equal(lines[lines.indexOf(RECERTIFICATIONS) + 1], MANUAL_EDITS);
  });
});
