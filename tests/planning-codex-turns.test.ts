import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { readCodexPlanningSessions } from '../src/harness/codex/codex-observe-usage.js';
import { TESTS_DIR, renderTree, restoreEnv } from './planning-observed-helpers.js';

const FIXTURE_DIR = path.join(TESTS_DIR, 'fixtures', 'planning-codex');

describe('Codex per-response turns', () => {
  let root = '';

  beforeEach(() => restoreEnv());
  afterEach(async () => {
    restoreEnv();
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  it('turns each token_count response into one turn with cache-adjusted input', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-codex-turns-'));
    const home = path.join(root, 'codex-home');
    const sessions = path.join(home, 'sessions');
    await fs.mkdir(sessions, { recursive: true });
    const insidePath = path.join(root, '001-change', 'tasks', '1.md');
    await renderTree(FIXTURE_DIR, sessions, { CWD: root, INSIDE_PATH: insidePath });
    const source = JSON.parse(await fs.readFile(path.join(FIXTURE_DIR, 'source.json'), 'utf8')) as {
      harness: string;
      version: string;
    };

    process.env.CODEX_HOME = home;
    const found = await readCodexPlanningSessions();
    assert.equal(found.length, 1);
    const session = found[0];
    assert.equal(session.nativeSessionId, 'codex-turns-session');
    assert.equal(session.harnessVersion, source.version);
    assert.equal(session.sessionCost, null);
    assert.equal(session.model, 'gpt-5.5');

    const turns = session.turns ?? [];
    // Two responses: the `token_usage_record` duplicate and the repeated
    // `token_count` with the same total add no further turn.
    assert.equal(turns.length, 2);

    const first = turns[0];
    assert.equal(first.timestamp, '2026-09-22T20:21:56.948Z');
    assert.equal(first.inputTokens, 16664 - 11136);
    assert.equal(first.cacheReadTokens, 11136);
    assert.equal(first.cacheWriteTokens, 0);
    assert.equal(first.outputTokens, 130);
    assert.equal(first.reasoningTokens, 33);
    assert.equal(first.cost, null);
    assert.deepEqual(first.edits, []);

    const second = turns[1];
    assert.equal(second.timestamp, '2026-09-22T20:28:10.000Z');
    assert.equal(second.inputTokens, 3336 - 864);
    assert.equal(second.cacheReadTokens, 864);
    assert.equal(second.cacheWriteTokens, 0);
    assert.equal(second.outputTokens, 70);
    assert.equal(second.reasoningTokens, 7);
    assert.equal(second.cost, null);
    // The successful `patch_apply_end` edit attaches to the turn after it.
    assert.deepEqual(second.edits, [insidePath]);

    // The `exec` custom tool call is not an apply_patch and adds no edit.
    assert.deepEqual(
      turns.flatMap((turn) => turn.edits),
      [insidePath],
    );
  });
});
