import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { readOpencodePlanningSessions } from '../src/harness/opencode/opencode-observe-usage.js';
import { buildOpencodeObservationQuery } from '../src/harness/opencode/opencode-usage.js';
import { TESTS_DIR, renderTree, restoreEnv } from './planning-observed-helpers.js';

const FIXTURE_DIR = path.join(TESTS_DIR, 'fixtures', 'planning-opencode');

const FAKE_DB = `#!${process.execPath}
import fs from 'node:fs';
process.stdout.write(fs.readFileSync(process.env.OSQ_OPENCODE_DB_ROWS_FILE, 'utf8'));
`;

describe('OpenCode per-message turns', () => {
  let root = '';

  beforeEach(() => restoreEnv());
  afterEach(async () => {
    restoreEnv();
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  it('turns each assistant message into one turn with its tokens, cost, and edits', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-opencode-turns-'));
    const insidePath = path.join(root, '001-change', 'tasks', '1.md');
    await renderTree(FIXTURE_DIR, root, { CWD: root, INSIDE_PATH: insidePath });
    const source = JSON.parse(await fs.readFile(path.join(FIXTURE_DIR, 'source.json'), 'utf8')) as {
      harness: string;
      version: string;
    };
    const fakeBin = path.join(root, 'fake-db.mjs');
    await fs.writeFile(fakeBin, FAKE_DB, { mode: 0o755 });
    process.env.OSQ_OPENCODE_DB_ROWS_FILE = path.join(root, 'rows.json');

    const found = await readOpencodePlanningSessions(fakeBin);
    assert.equal(found.length, 1);
    const session = found[0];
    assert.equal(session.nativeSessionId, 'oc-turns');
    assert.equal(session.sessionDir, root);
    assert.equal(session.harnessVersion, source.version);
    assert.equal(session.sessionCost, null);
    assert.equal(session.model, 'oc-turns-model');

    const turns = session.turns ?? [];
    assert.equal(turns.length, 2);

    const first = turns.find((turn) => turn.timestamp === new Date(1758000000000).toISOString());
    assert.ok(first);
    assert.equal(first.inputTokens, 100);
    assert.equal(first.outputTokens, 20);
    assert.equal(first.cacheReadTokens, 7);
    assert.equal(first.cacheWriteTokens, 3);
    assert.equal(first.reasoningTokens, 5);
    assert.equal(first.cost, 0.25);
    assert.equal(first.model, 'oc-turns-model');
    assert.deepEqual(first.edits, []);

    const second = turns.find((turn) => turn.timestamp === new Date(1758000060000).toISOString());
    assert.ok(second);
    assert.equal(second.inputTokens, 200);
    assert.equal(second.outputTokens, 40);
    assert.equal(second.cacheReadTokens, 11);
    assert.equal(second.cacheWriteTokens, 13);
    assert.equal(second.reasoningTokens, 9);
    assert.equal(second.cost, 0.5);
    assert.deepEqual(second.edits, [insidePath]);
  });

  it('joins message to session and part to message', () => {
    const query = buildOpencodeObservationQuery();
    assert.match(query, /JOIN session ON session\.id = message\.session_id/);
    assert.match(query, /LEFT JOIN part ON part\.message_id = message\.id/);
    assert.doesNotMatch(query, /part\.sessionID/);
  });

  it('yields null token usage for a row with malformed token fields', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-opencode-malformed-'));
    const fakeBin = path.join(root, 'fake-db.mjs');
    await fs.writeFile(fakeBin, FAKE_DB, { mode: 0o755 });
    const rowsFile = path.join(root, 'rows.json');
    await fs.writeFile(
      rowsFile,
      JSON.stringify({
        rows: [
          {
            session_id: 'oc-malformed',
            directory: root,
            version: '1.18.31',
            message_id: 'msg-m',
            message_time: 1758000000000,
            model: 'oc-turns-model',
            tokens_input: 'not-a-number',
            tokens_output: null,
            tokens_reasoning: 'bad',
            tokens_cache_read: -1,
            tokens_cache_write: 'bad',
            cost: 'bad',
            edit_path: 'tasks/1.md',
            edit_time: 1758000000000,
          },
        ],
      }),
      'utf8',
    );
    process.env.OSQ_OPENCODE_DB_ROWS_FILE = rowsFile;

    const found = await readOpencodePlanningSessions(fakeBin);
    assert.equal(found.length, 1);
    const turn = found[0].turns?.[0];
    assert.ok(turn);
    assert.equal(turn.inputTokens, null);
    assert.equal(turn.outputTokens, null);
    assert.equal(turn.cacheReadTokens, null);
    assert.equal(turn.cacheWriteTokens, null);
    assert.equal(turn.reasoningTokens, null);
    assert.equal(turn.cost, null);
    assert.deepEqual(turn.edits, ['tasks/1.md']);
  });
});
