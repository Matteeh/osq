import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  CodexEventStreamParser,
  createCodexStreamState,
  processCodexStdoutLine,
} from '../../src/harness/codex-stream.js';
import { FIXTURE_EVENTS, FIXTURE_RECOVERABLE } from './support.js';

interface ParsedEvent {
  type: string;
  timestamp: string;
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

describe('Codex stream observations', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-codex-stream-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('translates completed observations in order without duplicating lifecycle stages', async () => {
    const content = await fs.readFile(FIXTURE_EVENTS, 'utf8');
    const parser = new CodexEventStreamParser(
      { specFolderPath: tmpDir, taskNumber: '1', projectRoot: tmpDir },
      createCodexStreamState(),
    );
    parser.feed(content.slice(0, 120));
    parser.feed(content.slice(120, 400));
    parser.feed(content.slice(400));
    await parser.flush();

    const events = await readEvents(tmpDir, '1');
    assert.deepEqual(
      events.map((event) => event.type),
      ['text', 'tool', 'tool', 'file_changed', 'file_changed', 'tokens'],
    );

    assert.deepEqual(events[0].data, { text: 'Implemented the change.' });
    assert.deepEqual(events[1].data, { tool: 'command', summary: 'pnpm test' });
    assert.deepEqual(events[2].data, {
      tool: 'fs.read_file',
      summary: '{"path":"src/a.ts"}',
    });
    assert.deepEqual(events[3].data, { path: 'src/a.ts' });
    assert.deepEqual(events[4].data, { path: 'src/b.ts' });
    assert.deepEqual(events[5].data, {
      promptTokens: 100,
      candidateTokens: 25,
      totalTokens: 125,
      cachedTokens: 40,
      reasoningTokens: 7,
    });

    // Reasoning text never becomes a result and item lifecycle updates never duplicate.
    assert.equal(events.filter((event) => event.data?.text === 'thinking final').length, 0);
    assert.equal(events.filter((event) => event.type === 'file_changed').length, 2);
  });

  it('omits absent optional usage counters and never writes cost', async () => {
    await processCodexStdoutLine(
      JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 11, output_tokens: 5 } }),
      { specFolderPath: tmpDir, taskNumber: '2', projectRoot: tmpDir },
      createCodexStreamState(),
    );

    const events = await readEvents(tmpDir, '2');
    assert.equal(events.length, 1);
    assert.deepEqual(events[0].data, { promptTokens: 11, candidateTokens: 5, totalTokens: 16 });
    assert.ok(!('cost' in (events[0].data ?? {})));
    assert.ok(!('cachedTokens' in (events[0].data ?? {})));
    assert.ok(!('reasoningTokens' in (events[0].data ?? {})));
  });

  it('tolerates malformed and unknown records and flushes an unterminated final record', async () => {
    const parser = new CodexEventStreamParser(
      { specFolderPath: tmpDir, taskNumber: '3', projectRoot: tmpDir },
      createCodexStreamState(),
    );
    parser.feed('plain stdout noise\n');
    parser.feed('{"type": "broken\n');
    parser.feed(`${JSON.stringify({ type: 'future.event', payload: 1 })}\n`);
    parser.feed(
      JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 4, output_tokens: 6 } }),
    );
    await parser.flush();

    const events = await readEvents(tmpDir, '3');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'tokens');
    assert.equal(events[0].data?.totalTokens, 10);
  });

  it('relativizes absolute file-change paths to the project root', async () => {
    const absolute = path.join(tmpDir, 'src', 'nested', 'file.ts');
    await processCodexStdoutLine(
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'f1', type: 'file_change', status: 'completed', changes: [{ path: absolute }] },
      }),
      { specFolderPath: tmpDir, taskNumber: '4', projectRoot: tmpDir },
      createCodexStreamState(),
    );

    const events = await readEvents(tmpDir, '4');
    assert.deepEqual(events[0].data, { path: path.join('src', 'nested', 'file.ts') });
  });

  it('treats turn.failed as terminal but a recoverable error followed by success as not terminal', async () => {
    const failed = createCodexStreamState();
    await processCodexStdoutLine(
      JSON.stringify({ type: 'turn.failed', error: { message: 'exploded' } }),
      { specFolderPath: tmpDir, taskNumber: '5', projectRoot: tmpDir },
      failed,
    );
    assert.equal(failed.terminalFailure, 'exploded');

    const recovered = createCodexStreamState();
    const reconverContent = await fs.readFile(FIXTURE_RECOVERABLE, 'utf8');
    for (const line of reconverContent.split('\n').filter(Boolean)) {
      await processCodexStdoutLine(
        line,
        { specFolderPath: tmpDir, taskNumber: '6', projectRoot: tmpDir },
        recovered,
      );
    }
    assert.equal(recovered.terminalFailure, undefined);
    const events = await readEvents(tmpDir, '6');
    assert.equal(events.filter((event) => event.type === 'text').length, 1);
    assert.equal(events.filter((event) => event.type === 'tokens').length, 1);
  });
});
