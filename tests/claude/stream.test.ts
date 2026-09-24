import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  type ClaudeStreamContext,
  type ClaudeStreamState,
  createClaudeStreamState,
  processClaudeStdoutLine,
} from '../../src/harness/claude/claude-stream.js';

const GOLDEN_RUN = fileURLToPath(new URL('../fixtures/claude/run.jsonl', import.meta.url));
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url));

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

async function readEvents(specFolder: string, taskNumber: string): Promise<ParsedEvent[]> {
  const file = path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`);
  const raw = await fs.readFile(file, 'utf8').catch(() => '');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

function context(specFolder: string, taskNumber: string): ClaudeStreamContext {
  return { specFolderPath: specFolder, taskNumber, projectRoot: '/project' };
}

async function replayLines(
  specFolder: string,
  taskNumber: string,
  content: string,
  state: ClaudeStreamState = createClaudeStreamState(),
): Promise<void> {
  const ctx = context(specFolder, taskNumber);
  for (const line of content.split('\n')) {
    await processClaudeStdoutLine(line, ctx, state);
  }
}

function reportedCost(content: string): number {
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    const record = JSON.parse(line) as { type?: string; total_cost_usd?: number };
    if (record.type === 'result') return record.total_cost_usd ?? 0;
  }
  return 0;
}

describe('Claude stream translation', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-claude-stream-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('replays the captured fixture into tool, text, file_changed, and tokens events', async () => {
    const content = await fs.readFile(GOLDEN_RUN, 'utf8');
    await replayLines(tmpDir, '1', content);

    const events = await readEvents(tmpDir, '1');
    const tools = events.filter((event) => event.type === 'tool');
    assert.equal(tools.length, 7);
    assert.deepEqual(
      tools.map((event) => event.data?.tool),
      ['Read', 'Write', 'Edit', 'Bash', 'Bash', 'Grep', 'Glob'],
    );
    assert.deepEqual(
      tools.map((event) => event.data?.summary),
      ['notes.txt', 'hello.txt', 'hello.txt', 'cat hello.txt', 'git status', 'hello', '*.txt'],
    );
    assert.equal(tools.filter((event) => event.data?.summary === 'notes.txt').length, 1);
    assert.equal(tools.filter((event) => event.data?.summary === 'git status').length, 1);

    const texts = events.filter((event) => event.type === 'text');
    assert.equal(texts.length, 2);
    assert.ok(texts.every((event) => typeof event.data?.text === 'string'));

    const changes = events.filter((event) => event.type === 'file_changed');
    assert.deepEqual(
      changes.map((event) => event.data?.path),
      ['hello.txt', 'hello.txt'],
    );

    const tokens = events.filter((event) => event.type === 'tokens');
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0]?.data?.cost, reportedCost(content));
    assert.equal(tokens[0]?.data?.model, 'claude-haiku-4-5-20251001');
    assert.equal(tokens[0]?.data?.promptTokens, 91306);
    assert.equal(tokens[0]?.data?.candidateTokens, 1115);
    assert.equal(tokens[0]?.data?.totalTokens, 92421);
    assert.equal(tokens[0]?.data?.cachedTokens, 87441);
    assert.equal(tokens[0]?.data?.reasoningTokens, 410);
  });

  it('writes one tokens event per modelUsage entry summing to the reported cost', async () => {
    const fixture = path.join(FIXTURES_DIR, 'stream-multi-usage.jsonl');
    const content = await fs.readFile(fixture, 'utf8');
    await replayLines(tmpDir, '2', content);

    const events = await readEvents(tmpDir, '2');
    const tokens = events.filter((event) => event.type === 'tokens');
    assert.equal(tokens.length, 2);
    const sum = tokens.reduce((total, event) => total + Number(event.data?.cost ?? 0), 0);
    assert.equal(Number(sum.toFixed(6)), 0.03);
    assert.deepEqual(
      tokens.map((event) => event.data?.model),
      ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929'],
    );
    assert.equal(tokens[0]?.data?.promptTokens, 13);
    assert.equal(tokens[0]?.data?.totalTokens, 18);
    assert.equal(tokens[0]?.data?.reasoningTokens, 3);
    assert.equal(tokens[1]?.data?.promptTokens, 145);
  });

  it('skips blank, malformed, and unknown records and tolerates a trailing carriage return', async () => {
    const fixture = path.join(FIXTURES_DIR, 'stream-skipped.jsonl');
    const content = await fs.readFile(fixture, 'utf8');
    const state = createClaudeStreamState();
    await replayLines(tmpDir, '3', content, state);
    await processClaudeStdoutLine(
      `${JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'carriage' }] },
      })}\r`,
      context(tmpDir, '3'),
      state,
    );

    const events = await readEvents(tmpDir, '3');
    assert.deepEqual(
      events.map((event) => event.type),
      ['text', 'text'],
    );
    assert.deepEqual(
      events.map((event) => event.data?.text),
      ['kept', 'carriage'],
    );
  });

  it('writes no file_changed for a tool_result whose is_error is true', async () => {
    const fixture = path.join(FIXTURES_DIR, 'stream-errored-write.jsonl');
    const content = await fs.readFile(fixture, 'utf8');
    await replayLines(tmpDir, '4', content);

    const events = await readEvents(tmpDir, '4');
    assert.deepEqual(
      events.map((event) => event.type),
      ['tool', 'file_changed', 'tool'],
    );
    const changes = events.filter((event) => event.type === 'file_changed');
    assert.deepEqual(
      changes.map((event) => event.data?.path),
      ['hello.txt'],
    );
  });

  it('records the result subtype, is_error, and result text on the state', async () => {
    const state = createClaudeStreamState();
    await processClaudeStdoutLine(
      JSON.stringify({
        type: 'result',
        subtype: 'error_max_turns',
        is_error: true,
        result: 'boom',
      }),
      context(tmpDir, '5'),
      state,
    );
    assert.equal(state.subtype, 'error_max_turns');
    assert.equal(state.isError, true);
    assert.equal(state.result, 'boom');
  });
});
