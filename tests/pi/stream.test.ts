import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  PiEventStreamParser,
  createPiStreamState,
  processPiStdoutLine,
} from '../../src/harness/pi/pi-stream.js';
import { GOLDEN_RUN, RETRY_RUN, THREE_RESPONSES } from './support.js';

interface ParsedEvent {
  type: string;
  data?: Record<string, unknown>;
}

async function readEvents(specFolder: string, taskNumber: string): Promise<ParsedEvent[]> {
  const raw = await fs
    .readFile(path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`), 'utf8')
    .catch(() => '');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

async function feedFile(specFolder: string, taskNumber: string, file: string): Promise<void> {
  const content = await fs.readFile(file, 'utf8');
  const parser = new PiEventStreamParser(
    { specFolderPath: specFolder, taskNumber, projectRoot: specFolder },
    createPiStreamState(),
  );
  parser.feed(content.slice(0, 97));
  parser.feed(content.slice(97, 411));
  parser.feed(content.slice(411));
  await parser.flush();
}

describe('Pi stream translation', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-pi-stream-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('replays the captured fixture with one tool and one tokens event per record', async () => {
    const fixture = await fs.readFile(GOLDEN_RUN, 'utf8');
    const records = fixture
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { type: string; message?: { role?: string } });
    const toolStarts = records.filter((record) => record.type === 'tool_execution_start').length;
    const assistantEnds = records.filter(
      (record) => record.type === 'message_end' && record.message?.role === 'assistant',
    ).length;

    await feedFile(tmpDir, '1', GOLDEN_RUN);
    const events = await readEvents(tmpDir, '1');
    assert.equal(events.filter((event) => event.type === 'tool').length, toolStarts);
    assert.equal(events.filter((event) => event.type === 'tokens').length, assistantEnds);
    assert.equal(events.filter((event) => event.type === 'file_changed').length, 1);
    assert.equal(events.filter((event) => event.type === 'text').length, 1);
    assert.ok(!events.some((event) => ['started', 'exited', 'done', 'dead'].includes(event.type)));
  });

  it('writes three tokens events whose sums match for three responses', async () => {
    await feedFile(tmpDir, '2', THREE_RESPONSES);
    const tokens = (await readEvents(tmpDir, '2')).filter((event) => event.type === 'tokens');
    assert.equal(tokens.length, 3);

    const sum = (key: string): number =>
      tokens.reduce((total, event) => total + Number(event.data?.[key] ?? 0), 0);
    assert.equal(sum('promptTokens'), 60);
    assert.equal(sum('candidateTokens'), 6);
    assert.equal(sum('cachedTokens'), 12);
    assert.equal(sum('reasoningTokens'), 18);
    assert.equal(Number(sum('cost').toFixed(4)), 0.06);
    assert.equal(tokens[0]?.data?.provider, 'deepseek');
    assert.equal(tokens[0]?.data?.model, 'deepseek-flash');
  });

  it('translates tools, file changes, and only non-empty assistant text', async () => {
    const lines = [
      JSON.stringify({
        type: 'tool_execution_start',
        toolCallId: 'a',
        toolName: 'bash',
        args: { command: 'pnpm test' },
      }),
      JSON.stringify({
        type: 'tool_execution_start',
        toolCallId: 'b',
        toolName: 'write',
        args: { path: 'src/b.ts' },
      }),
      JSON.stringify({
        type: 'tool_execution_end',
        toolCallId: 'b',
        toolName: 'write',
        isError: false,
      }),
      JSON.stringify({
        type: 'tool_execution_start',
        toolCallId: 'c',
        toolName: 'edit',
        args: { path: 'src/c.ts' },
      }),
      JSON.stringify({
        type: 'tool_execution_end',
        toolCallId: 'c',
        toolName: 'edit',
        isError: true,
      }),
      JSON.stringify({
        type: 'message_end',
        message: { role: 'user', content: [{ type: 'text', text: 'ignored' }] },
      }),
      JSON.stringify({
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: '' },
            { type: 'text', text: 'kept' },
          ],
          usage: { input: 1, output: 1 },
        },
      }),
    ];
    const state = createPiStreamState();
    for (const line of lines) {
      await processPiStdoutLine(
        line,
        { specFolderPath: tmpDir, taskNumber: '3', projectRoot: tmpDir },
        state,
      );
    }

    const events = await readEvents(tmpDir, '3');
    assert.deepEqual(
      events.map((event) => event.type),
      ['tool', 'tool', 'file_changed', 'tool', 'text', 'tokens'],
    );
    assert.deepEqual(events[0]?.data, { tool: 'bash', summary: 'pnpm test' });
    assert.deepEqual(events[1]?.data, { tool: 'write', summary: 'src/b.ts' });
    assert.deepEqual(events[2]?.data, { path: 'src/b.ts' });
    // A failed edit never becomes a file change.
    assert.equal(events.filter((event) => event.type === 'file_changed').length, 1);
    assert.equal(events.filter((event) => event.type === 'text').length, 1);
    assert.equal(events.find((event) => event.type === 'text')?.data?.text, 'kept');
  });

  it('tolerates U+2028 inside a string, a trailing carriage return, and malformed records', async () => {
    const parser = new PiEventStreamParser(
      { specFolderPath: tmpDir, taskNumber: '4', projectRoot: tmpDir },
      createPiStreamState(),
    );
    parser.feed('plain stdout noise\n');
    parser.feed('{"type": "broken\n');
    parser.feed(`${JSON.stringify({ type: 'future.event', payload: 1 })}\n`);
    parser.feed(
      `${JSON.stringify({
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'one\u2028two' }],
          usage: { input: 4, output: 6 },
        },
      })}\r\n`,
    );
    await parser.flush();

    const events = await readEvents(tmpDir, '4');
    assert.deepEqual(
      events.map((event) => event.type),
      ['text', 'tokens'],
    );
    assert.equal(events[0]?.data?.text, 'one\u2028two');
    assert.equal(events[1]?.data?.totalTokens, 10);
  });

  it('translates both retry phases and keeps observing after a retry', async () => {
    await feedFile(tmpDir, '5', RETRY_RUN);
    const events = await readEvents(tmpDir, '5');
    const retries = events.filter((event) => event.type === 'harness_retry');
    assert.equal(retries.length, 2);
    assert.equal(retries[0]?.data?.phase, 'start');
    assert.equal(retries[0]?.data?.attempt, 1);
    assert.equal(retries[0]?.data?.maxAttempts, 3);
    assert.equal(retries[0]?.data?.delayMs, 250);
    assert.equal(retries[0]?.data?.error, 'upstream exploded');
    assert.equal(retries[1]?.data?.phase, 'end');
    assert.equal(retries[1]?.data?.success, true);

    const texts = events.filter((event) => event.type === 'text').map((event) => event.data?.text);
    assert.deepEqual(texts, ['before retry', 'after retry']);
  });

  it('records settlement through the stream state callback', async () => {
    const state = createPiStreamState();
    let settled = 0;
    state.onSettled = () => {
      settled += 1;
    };
    await processPiStdoutLine(
      JSON.stringify({ type: 'agent_settled' }),
      { specFolderPath: tmpDir, taskNumber: '6', projectRoot: tmpDir },
      state,
    );
    assert.equal(state.settled, true);
    assert.equal(settled, 1);
  });
});
