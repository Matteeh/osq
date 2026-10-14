import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  type ClaudeStreamContext,
  type ClaudeStreamState,
  createClaudeStreamState,
  processClaudeStdoutLine,
} from '../src/harness/claude/claude-stream.js';
import {
  type CodexStreamContext,
  type CodexStreamState,
  createCodexStreamState,
  processCodexStdoutLine,
} from '../src/harness/codex/codex-stream.js';
import { processOpencodeStdoutLine } from '../src/harness/opencode/opencode.js';

interface ParsedEvent {
  type: string;
  timestamp?: string;
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

interface Replay {
  readonly events: ParsedEvent[];
  readonly state?: CodexStreamState;
}

async function replay(
  adapter: 'Claude' | 'OpenCode' | 'Codex',
  line: string,
  specFolder: string,
): Promise<Replay> {
  const taskNumber = '1';
  if (adapter === 'Claude') {
    const ctx: ClaudeStreamContext = {
      specFolderPath: specFolder,
      taskNumber,
      projectRoot: '/project',
    };
    const state: ClaudeStreamState = createClaudeStreamState();
    await processClaudeStdoutLine(line, ctx, state);
    return { events: await readEvents(specFolder, taskNumber) };
  }
  if (adapter === 'OpenCode') {
    await processOpencodeStdoutLine(line, specFolder, taskNumber);
    return { events: await readEvents(specFolder, taskNumber) };
  }
  const state = createCodexStreamState();
  const ctx: CodexStreamContext = {
    specFolderPath: specFolder,
    taskNumber,
    projectRoot: specFolder,
  };
  await processCodexStdoutLine(line, ctx, state);
  return { events: await readEvents(specFolder, taskNumber), state };
}

/** The rows of "Usage limit records", with the expected value each row names. */
const ROWS: ReadonlyArray<{
  readonly adapter: 'Claude' | 'OpenCode' | 'Codex';
  readonly line: string;
  readonly event: 'usage_limit' | 'none';
  readonly resetsAt?: string;
  readonly error?: string;
}> = [
  {
    adapter: 'Claude',
    line: '{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":1791990000,"rateLimitType":"five_hour"}}',
    event: 'usage_limit',
    resetsAt: '2026-10-14T15:00:00.000Z',
  },
  {
    adapter: 'Claude',
    line: '{"type":"rate_limit_event","rate_limit_info":{"status":"allowed"}}',
    event: 'none',
  },
  {
    adapter: 'OpenCode',
    line: '{"type":"error","timestamp":1791980000000,"sessionID":"ses_1","error":{"type":"provider.quota","message":"Monthly quota exceeded"}}',
    event: 'usage_limit',
    error: 'Monthly quota exceeded',
  },
  {
    adapter: 'OpenCode',
    line: '{"type":"error","timestamp":1791980000000,"sessionID":"ses_1","error":{"type":"provider.no-route","message":"No route"}}',
    event: 'none',
  },
  {
    adapter: 'Codex',
    line: '{"type":"turn.failed","error":{"message":"You’ve hit your usage limit. Try again at 3:00 PM."}}',
    event: 'usage_limit',
    error: 'You’ve hit your usage limit. Try again at 3:00 PM.',
  },
  {
    adapter: 'Codex',
    line: '{"type":"turn.failed","error":{"message":"stream disconnected"}}',
    event: 'none',
  },
];

describe('Usage limit records', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-usage-limit-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("replays every record and writes what the row says to task 1's events", async () => {
    for (const [index, row] of ROWS.entries()) {
      const specFolder = path.join(tmpDir, `row-${index}`);
      await fs.mkdir(specFolder, { recursive: true });
      const { events } = await replay(row.adapter, row.line, specFolder);
      const usage = events.filter((event) => event.type === 'usage_limit');

      if (row.event === 'none') {
        assert.equal(usage.length, 0, `${row.adapter} ${row.line} wrote a usage_limit event`);
        continue;
      }

      assert.equal(
        usage.length,
        1,
        `${row.adapter} ${row.line} wrote ${usage.length} usage_limit events`,
      );
      const data = usage[0]?.data ?? {};
      assert.equal(data.resetsAt, row.resetsAt);
      assert.equal(data.error, row.error);
      assert.equal('resetsAt' in data, row.resetsAt !== undefined);
      assert.equal('error' in data, row.error !== undefined);
    }
  });

  it('keeps a Codex usage limit as a terminal failure carrying the message', async () => {
    const codexLimit =
      '{"type":"turn.failed","error":{"message":"You’ve hit your usage limit. Try again at 3:00 PM."}}';
    const { state } = await replay('Codex', codexLimit, tmpDir);
    assert.equal(state?.terminalFailure, 'You’ve hit your usage limit. Try again at 3:00 PM.');
  });
});
