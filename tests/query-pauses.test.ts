import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { queryCommand } from '../src/cli/query.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';

const ARCHIVE_DIR = path.join('openspec', 'changes', 'archive');
const PRICING = '007-pricing';
const PLAIN = '008-plain';

const TASK_OUTCOMES =
  'task_outcomes(change, task, capability, scope_globs, scope_files, verify_kind, tests_modify, verify_starts, shares_scope, position, attempts, first_attempt, dead_reason, files_touched)';
const PAUSES = 'pauses(change, task, paused_at, until, source)';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** A fresh temporary project root, removed after the test. */
async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-query-pauses-'));
  roots.push(root);
  return root;
}

/** Writes one file under the root, creating parent folders. */
async function write(root: string, rel: string, content: string): Promise<void> {
  const target = path.join(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** One jsonl event line. */
function event(type: string, data: Record<string, unknown>, timestamp?: string): string {
  return JSON.stringify(timestamp === undefined ? { type, data } : { type, data, timestamp });
}

/** A proposal so the folder reads as an archived change. */
async function writeProposal(root: string, base: string, title: string): Promise<void> {
  await write(
    root,
    path.join(base, 'proposal.md'),
    `---\ntitle: ${title}\n---\n## Goal\n\n${title}.\n`,
  );
}

/** Change 007 whose task 2 stream holds two `paused` events, as the scenario says. */
async function writePricing(root: string): Promise<void> {
  const base = path.join(ARCHIVE_DIR, PRICING);
  await writeProposal(root, base, 'Pricing');
  await write(
    root,
    path.join(base, '.run', 'events', '2.jsonl'),
    [
      event('started', {}),
      event(
        'paused',
        { task: '2', until: '2026-10-14T15:00:00.000Z', source: 'harness' },
        '2026-10-14T12:00:00.000Z',
      ),
      event(
        'paused',
        { task: '2', until: '2026-10-14T15:31:00.000Z', source: 'wait' },
        '2026-10-14T15:01:00.000Z',
      ),
    ]
      .join('\n')
      .concat('\n'),
  );
}

/** Change 008 with a proposal and nothing else: no `paused` event anywhere. */
async function writePlain(root: string): Promise<void> {
  await writeProposal(root, path.join(ARCHIVE_DIR, PLAIN), 'Plain');
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

describe('pause query table', () => {
  it('holds one row per paused event of one archived change', async () => {
    const root = await makeRoot();
    await writePricing(root);

    const { text, error } = await capture(root, {
      select: 'select change, task, paused_at, until, source from pauses order by paused_at',
      json: true,
    });

    assert.equal(error, '');
    assert.deepEqual(JSON.parse(text), [
      {
        change: PRICING,
        task: '2',
        paused_at: '2026-10-14T12:00:00.000Z',
        until: '2026-10-14T15:00:00.000Z',
        source: 'harness',
      },
      {
        change: PRICING,
        task: '2',
        paused_at: '2026-10-14T15:01:00.000Z',
        until: '2026-10-14T15:31:00.000Z',
        source: 'wait',
      },
    ]);
  });

  it('counts zero when no archived change holds a paused event', async () => {
    const root = await makeRoot();
    await writePlain(root);

    const { text, error } = await capture(root, {
      select: 'select count(*) as n from pauses',
    });

    assert.equal(error, '');
    assert.deepEqual(text.trimEnd().split('\n'), ['n', '0']);
  });

  it('lists pauses directly after task_outcomes, no longer last, and exits zero', async () => {
    const root = await makeRoot();
    await writePricing(root);

    const { text, error } = await capture(root);

    assert.equal(error, '');
    const lines = text.trimEnd().split('\n');
    assert.equal(lines[lines.indexOf(TASK_OUTCOMES) + 1], PAUSES);
    assert.notEqual(lines.at(-1), PAUSES);
  });

  it('prints task_outcomes directly after link_findings', async () => {
    const root = await makeRoot();
    await writePricing(root);

    const { text, error } = await capture(root);

    assert.equal(error, '');
    const lines = text.trimEnd().split('\n');
    const linkIndex = lines.indexOf('link_findings(id, change, severity, file, message, label)');
    assert.ok(linkIndex >= 0);
    assert.equal(lines[linkIndex + 1], TASK_OUTCOMES);
  });
});
