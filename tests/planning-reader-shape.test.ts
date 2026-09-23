import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import type { ObservedPlanningSession } from '../src/core/report/planning-observed.js';
import { parseClaudeSession } from '../src/harness/claude/claude-usage.js';
import { parseCodexObservation } from '../src/harness/codex/codex-observe-usage.js';
import { readOpencodePlanningSessions } from '../src/harness/opencode/opencode-observe-usage.js';

const REMOVED_FIELDS = ['usage', 'edits', 'startedAt', 'endedAt'] as const;

function assertSessionShape(session: ObservedPlanningSession | null): void {
  assert.ok(session, 'reader returned a session');
  assert.ok(session.turns.length > 0, 'session has at least one turn');
  for (const field of REMOVED_FIELDS) {
    assert.equal(Object.hasOwn(session, field), false, `session has no ${field} key`);
  }
}

const FAKE_DB = `#!${process.execPath}
import fs from 'node:fs';
process.stdout.write(fs.readFileSync(process.env.OSQ_OPENCODE_DB_ROWS_FILE, 'utf8'));
`;

describe('planning reader session shape', () => {
  it('returns turns and no legacy fields for Claude, Codex, and OpenCode', async () => {
    const claude = parseClaudeSession(
      JSON.stringify({
        type: 'assistant',
        sessionId: 'shape-claude',
        cwd: '/project/001-x',
        timestamp: '2026-01-01T00:00:10.000Z',
        message: {
          role: 'assistant',
          model: 'claude-x',
          content: [
            { type: 'tool_use', id: 'tu-1', name: 'Write', input: { file_path: 'tasks/1.md' } },
          ],
        },
      }),
    );
    assertSessionShape(claude);

    const codex = parseCodexObservation(
      [
        JSON.stringify({
          type: 'session_meta',
          timestamp: '2026-01-01T00:00:00.000Z',
          payload: { id: 'shape-codex', cwd: '/project/001-x' },
        }),
        JSON.stringify({
          type: 'response_item',
          timestamp: '2026-01-01T00:00:05.000Z',
          payload: {
            type: 'custom_tool_call',
            name: 'apply_patch',
            status: 'completed',
            input: '*** Add File: tasks/1.md',
          },
        }),
      ].join('\n'),
    );
    assertSessionShape(codex);

    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-reader-shape-'));
    const savedRowsFile = process.env.OSQ_OPENCODE_DB_ROWS_FILE;
    try {
      const rowsFile = path.join(root, 'rows.json');
      const fakeBin = path.join(root, 'fake-db.mjs');
      await fs.writeFile(fakeBin, FAKE_DB, { mode: 0o755 });
      await fs.writeFile(
        rowsFile,
        JSON.stringify({
          rows: [
            {
              session_id: 'shape-opencode',
              directory: '/project/001-x',
              version: '1.18.31',
              message_id: 'shape-opencode-msg',
              message_time: 1758000000000,
              model: 'oc-model',
              edit_path: 'tasks/1.md',
              edit_time: 1758000000000,
            },
          ],
        }),
        'utf8',
      );
      process.env.OSQ_OPENCODE_DB_ROWS_FILE = rowsFile;

      const sessions = await readOpencodePlanningSessions(fakeBin);
      assert.equal(sessions.length, 1);
      assertSessionShape(sessions[0]);
    } finally {
      if (savedRowsFile === undefined)
        Reflect.deleteProperty(process.env, 'OSQ_OPENCODE_DB_ROWS_FILE');
      else process.env.OSQ_OPENCODE_DB_ROWS_FILE = savedRowsFile;
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
