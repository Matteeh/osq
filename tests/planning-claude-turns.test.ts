import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { approveSpec } from '../src/core/spec/approve.js';
import {
  parseClaudeSession,
  readClaudePlanningSessions,
} from '../src/harness/claude/claude-usage.js';
import {
  TESTS_DIR,
  createChange,
  createProject,
  renderTree,
  restoreEnv,
} from './planning-observed-helpers.js';

const FIXTURE_DIR = path.join(TESTS_DIR, 'fixtures', 'planning-claude');

describe('Claude per-message turns', () => {
  let root = '';

  beforeEach(() => restoreEnv());
  afterEach(async () => {
    restoreEnv();
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  it('counts one turn per message id across a transcript and its subagent file', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-claude-turns-'));
    const projectsDir = path.join(root, 'projects');
    await renderTree(FIXTURE_DIR, projectsDir, { CWD: root, INSIDE_PATH: 'tasks/1.md' });
    const source = JSON.parse(await fs.readFile(path.join(FIXTURE_DIR, 'source.json'), 'utf8')) as {
      harness: string;
      version: string;
    };

    const sessions = await readClaudePlanningSessions(projectsDir);
    assert.equal(sessions.length, 1);
    const session = sessions[0];
    assert.equal(session.nativeSessionId, 'claude-turns-session');
    assert.equal(session.harnessVersion, source.version);
    assert.equal(session.sessionCost, null);

    const turns = session.turns ?? [];
    assert.equal(turns.length, 3);

    const split = turns.find((turn) => turn.timestamp === '2026-09-22T21:31:13.179Z');
    assert.ok(split);
    // The usage of a three-record message is counted exactly once.
    assert.equal(split.inputTokens, 2);
    assert.equal(split.outputTokens, 537);
    assert.equal(split.cacheReadTokens, 51596);
    assert.equal(split.cacheWriteTokens, 3876);
    assert.equal(split.reasoningTokens, 17);
    assert.equal(split.cost, null);

    const edited = turns.find((turn) => turn.timestamp === '2026-09-22T21:32:13.179Z');
    assert.ok(edited);
    assert.deepEqual(edited.edits, ['tasks/1.md']);

    const withoutUsage = turns.find((turn) => turn.timestamp === '2026-09-22T21:33:13.179Z');
    assert.ok(withoutUsage);
    assert.equal(withoutUsage.inputTokens, null);
    assert.equal(withoutUsage.outputTokens, null);
    assert.equal(withoutUsage.cacheReadTokens, null);
    assert.equal(withoutUsage.cacheWriteTokens, null);
    assert.equal(withoutUsage.reasoningTokens, null);
  });

  it('gives an assistant record without a message id its own turn', () => {
    const content = [
      {
        type: 'assistant',
        sessionId: 'no-id-session',
        cwd: '/tmp/nowhere',
        timestamp: '2026-09-22T21:31:13.179Z',
        message: { role: 'assistant', model: 'claude-x', content: [{ type: 'text' }] },
      },
      {
        type: 'assistant',
        sessionId: 'no-id-session',
        cwd: '/tmp/nowhere',
        timestamp: '2026-09-22T21:31:14.179Z',
        message: {
          role: 'assistant',
          model: 'claude-x',
          content: [{ type: 'tool_use', id: 'tu', name: 'Write', input: { file_path: 'a.md' } }],
        },
      },
    ]
      .map((record) => JSON.stringify(record))
      .join('\n');
    const observation = parseClaudeSession(content);
    assert.ok(observation);
    assert.equal(observation.turns.length, 2);
    assert.deepEqual(
      observation.turns.flatMap((turn) => turn.edits),
      ['a.md'],
    );
  });

  it('yields null usage for malformed usage and still approves with that reader', async () => {
    root = await createProject();
    const change = await createChange(root, 'Malformed Claude Usage');
    const now = Date.now();
    await fs.mkdir(path.join(change.folderPath, '.run'), { recursive: true });
    await fs.writeFile(
      path.join(change.folderPath, '.run', 'manifest.json'),
      JSON.stringify({ createdAt: new Date(now - 120000).toISOString() }),
      'utf8',
    );

    const content = JSON.stringify({
      type: 'assistant',
      sessionId: 'malformed-claude-session',
      cwd: change.folderPath,
      version: '2.1.280',
      timestamp: new Date(now - 30000).toISOString(),
      message: {
        id: 'msg-malformed',
        role: 'assistant',
        model: 'claude-malformed',
        content: [
          { type: 'tool_use', id: 'tu-m', name: 'Edit', input: { file_path: 'tasks/1.md' } },
        ],
        usage: {
          input_tokens: 'not-a-number',
          output_tokens: null,
          cache_read_input_tokens: 'bad',
          cache_creation_input_tokens: -1,
          output_tokens_details: { thinking_tokens: 'bad' },
        },
      },
    });
    const observation = parseClaudeSession(content);
    assert.ok(observation);
    const turn = observation.turns?.[0];
    assert.ok(turn);
    assert.equal(turn.inputTokens, null);
    assert.equal(turn.outputTokens, null);
    assert.equal(turn.cacheReadTokens, null);
    assert.equal(turn.cacheWriteTokens, null);
    assert.equal(turn.reasoningTokens, null);

    const result = await approveSpec(root, change.specId, DEFAULT_CONFIG, {
      planningReaders: [() => Promise.resolve([observation])],
      now: new Date(now),
    });
    assert.equal(result.planningMatches, 1);
  });
});
