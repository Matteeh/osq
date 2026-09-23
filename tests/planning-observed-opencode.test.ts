import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { readOpencodePlanningSessions } from '../src/harness/opencode/opencode-observe-usage.js';
import { buildOpencodeObservationQuery } from '../src/harness/opencode/opencode-usage.js';

describe('OpenCode observation', () => {
  it('builds an edit-only join projected through json_extract', () => {
    const query = buildOpencodeObservationQuery();
    assert.match(query, /FROM message/);
    assert.match(query, /JOIN session ON session\.id = message\.session_id/);
    assert.match(query, /LEFT JOIN part ON part\.message_id = message\.id/);
    assert.match(query, /state\.input\.filePath/);
    assert.match(query, /\('write', 'edit'\)/);
    assert.match(query, /'completed'/);
    assert.doesNotMatch(query, /part\.sessionID/);
  });

  it('groups completed edit parts by session and message', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-opencode-observe-'));
    try {
      const rowsFile = path.join(root, 'rows.json');
      const fakeBin = path.join(root, 'fake-db.mjs');
      await fs.writeFile(
        fakeBin,
        `#!${process.execPath}\nimport fs from 'node:fs';\nprocess.stdout.write(fs.readFileSync(process.env.OSQ_OPENCODE_DB_ROWS_FILE, 'utf8'));\n`,
        { mode: 0o755 },
      );
      const now = Date.now();
      await fs.writeFile(
        rowsFile,
        JSON.stringify({
          rows: [
            {
              session_id: 'oc-1',
              directory: '/project/001-x',
              version: '1.18.31',
              message_id: 'oc-msg-1',
              message_time: now - 60000,
              model: 'oc-model',
              tokens_input: 11,
              tokens_output: 22,
              tokens_reasoning: 3,
              tokens_cache_read: 4,
              tokens_cache_write: 5,
              cost: 0.7,
              edit_path: 'tasks/1.md',
              edit_time: now - 30000,
            },
          ],
        }),
        'utf8',
      );
      process.env.OSQ_OPENCODE_DB_ROWS_FILE = rowsFile;

      const found = await readOpencodePlanningSessions(fakeBin);
      assert.equal(found.length, 1);
      assert.equal(found[0].nativeSessionId, 'oc-1');
      assert.equal(found[0].sessionDir, '/project/001-x');
      assert.equal(found[0].model, 'oc-model');
      assert.equal(found[0].harnessVersion, '1.18.31');
      assert.equal(found[0].sessionCost, null);
      assert.equal(found[0].usage.inputTokens, null);
      assert.equal(found[0].usage.cost, null);
      assert.equal(found[0].edits.length, 1);
      assert.equal(found[0].edits[0].path, 'tasks/1.md');

      assert.deepEqual(await readOpencodePlanningSessions(path.join(root, 'missing-bin')), []);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('keeps a session model nullable', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-opencode-null-'));
    try {
      const rowsFile = path.join(root, 'rows.json');
      const fakeBin = path.join(root, 'fake-db.mjs');
      await fs.writeFile(
        fakeBin,
        `#!${process.execPath}\nimport fs from 'node:fs';\nprocess.stdout.write(fs.readFileSync(process.env.OSQ_OPENCODE_DB_ROWS_FILE, 'utf8'));\n`,
        { mode: 0o755 },
      );
      await fs.writeFile(
        rowsFile,
        JSON.stringify({
          rows: [
            {
              session_id: 'oc-null',
              directory: '/project/001-x',
              version: '1.18.31',
              message_id: 'oc-null-msg',
              message_time: 1758000000000,
              model: null,
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
      assert.equal(found[0].model, null);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
