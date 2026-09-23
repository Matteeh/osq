import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  parseCodexObservation,
  readCodexPlanningSessions,
} from '../src/harness/codex/codex-observe-usage.js';

describe('Codex rollout observation', () => {
  it('reads apply_patch headers and ignores shell text and failed calls', () => {
    const lines = [
      JSON.stringify({
        type: 'session_meta',
        timestamp: '2026-01-01T00:00:00.000Z',
        payload: { id: 'codex-1', timestamp: '2026-01-01T00:00:00.000Z', cwd: '/project/001-x' },
      }),
      JSON.stringify({
        type: 'turn_context',
        timestamp: '2026-01-01T00:00:00.000Z',
        payload: { model: 'gpt-5' },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-01-01T00:00:05.000Z',
        payload: {
          type: 'custom_tool_call',
          name: 'apply_patch',
          status: 'completed',
          input:
            '*** Begin Patch\n*** Update File: tasks/1.md\n*** Move to: tasks/2.md\n*** Delete File: tasks/old.md\n+line\n*** End Patch',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-01-01T00:00:05.000Z',
        payload: {
          type: 'custom_tool_call',
          name: 'exec_command',
          input: '*** Add File: tasks/evil.md',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: '2026-01-01T00:00:05.000Z',
        payload: {
          type: 'custom_tool_call',
          name: 'apply_patch',
          status: 'failed',
          input: '*** Add File: tasks/failed.md',
        },
      }),
      JSON.stringify({
        type: 'token_usage_record',
        timestamp: '2026-01-01T00:00:06.000Z',
        payload: {
          thread_token_usage: {
            input_tokens: 10,
            output_tokens: 5,
            cached_input_tokens: 2,
            reasoning_output_tokens: 1,
          },
        },
      }),
    ].join('\n');

    const observation = parseCodexObservation(lines);
    assert.ok(observation);
    assert.equal(observation.harness, 'codex');
    assert.equal(observation.nativeSessionId, 'codex-1');
    assert.equal(observation.sessionDir, '/project/001-x');
    assert.equal(observation.model, 'gpt-5');
    // `token_usage_record` adds no turn and no session usage.
    assert.equal(observation.harnessVersion, null);
    assert.equal(observation.sessionCost, null);
    // The edits after the last token_count form one final turn with null usage.
    assert.equal(observation.turns.length, 1);
    assert.equal(observation.turns[0].timestamp, '2026-01-01T00:00:05.000Z');
    assert.deepEqual(observation.turns[0].edits, ['tasks/1.md', 'tasks/2.md', 'tasks/old.md']);
  });

  it('adds no turn for a token_count without last_token_usage', () => {
    const observation = parseCodexObservation(
      [
        JSON.stringify({
          type: 'session_meta',
          timestamp: '2026-01-01T00:00:00.000Z',
          payload: { id: 'codex-2', cwd: '/project/001-x' },
        }),
        JSON.stringify({
          type: 'event_msg',
          timestamp: '2026-01-01T00:00:01.000Z',
          payload: {
            type: 'token_count',
            info: {
              total_token_usage: {
                input_tokens: 7,
                output_tokens: 3,
                cached_input_tokens: 1,
                reasoning_output_tokens: 2,
              },
            },
          },
        }),
      ].join('\n'),
    );
    assert.ok(observation);
    assert.deepEqual(observation.turns, []);
  });

  it('reads every rollout below the Codex data home and degrades a missing store', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-codex-observe-'));
    try {
      const home = path.join(root, 'codex-home');
      const sessions = path.join(home, 'sessions', '2026', '01');
      await fs.mkdir(sessions, { recursive: true });
      await fs.writeFile(
        path.join(sessions, 'rollout.jsonl'),
        [
          JSON.stringify({
            type: 'session_meta',
            timestamp: '2026-01-01T00:00:00.000Z',
            payload: { id: 'codex-home', cwd: '/project/001-x' },
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
        'utf8',
      );
      process.env.CODEX_HOME = home;
      const found = await readCodexPlanningSessions();
      assert.equal(found.length, 1);
      assert.equal(found[0].nativeSessionId, 'codex-home');

      process.env.CODEX_HOME = path.join(root, 'missing-home');
      assert.deepEqual(await readCodexPlanningSessions(), []);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
