import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseClaudeSession } from '../src/harness/claude/claude-usage.js';

describe('Claude session observation', () => {
  it('parses successful edits and the final cost-state without content', () => {
    const content = [
      JSON.stringify({
        type: 'assistant',
        sessionId: 'claude-1',
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
      JSON.stringify({
        type: 'user',
        sessionId: 'claude-1',
        timestamp: '2026-01-01T00:00:11.000Z',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu-2', is_error: true }],
        },
      }),
      JSON.stringify({
        type: 'assistant',
        sessionId: 'claude-1',
        cwd: '/project/001-x',
        timestamp: '2026-01-01T00:00:12.000Z',
        message: {
          role: 'assistant',
          model: 'claude-x',
          content: [
            { type: 'tool_use', id: 'tu-2', name: 'Edit', input: { file_path: 'tasks/2.md' } },
            {
              type: 'tool_use',
              id: 'tu-3',
              name: 'NotebookEdit',
              input: { notebook_path: 'tasks/3.ipynb' },
            },
          ],
        },
      }),
      JSON.stringify({
        type: 'cost-state',
        sessionId: 'claude-1',
        startTime: 1767225600000,
        totalDuration: 12000,
        totalCostUSD: 0.5,
        modelUsage: {
          'claude-x': {
            input_tokens: 100,
            output_tokens: 50,
            thinking_tokens: 10,
            cache_read_input_tokens: 20,
            cache_creation_input_tokens: 5,
          },
        },
      }),
    ].join('\n');

    const observation = parseClaudeSession(content);
    assert.ok(observation);
    assert.equal(observation.harness, 'claude');
    assert.equal(observation.nativeSessionId, 'claude-1');
    assert.equal(observation.sessionDir, '/project/001-x');
    assert.equal(observation.model, 'claude-x');
    assert.deepEqual(
      observation.turns.flatMap((turn) => turn.edits),
      ['tasks/1.md', 'tasks/3.ipynb'],
    );
    // Cost-state counters no longer supply token usage; only its cost survives.
    assert.equal(observation.sessionCost, 0.5);
    assert.equal(observation.harnessVersion, null);
    assert.equal(JSON.stringify(observation).includes('tool_result'), false);
  });

  it('returns null when no edit is present and leaves missing values null', () => {
    const observation = parseClaudeSession(
      JSON.stringify({
        type: 'assistant',
        sessionId: 'claude-2',
        cwd: '/project/001-x',
        timestamp: '2026-01-01T00:00:10.000Z',
        message: {
          role: 'assistant',
          model: 'claude-y',
          content: [{ type: 'text', text: 'no edit here' }],
        },
      }),
    );
    assert.equal(observation, null);
  });
});
