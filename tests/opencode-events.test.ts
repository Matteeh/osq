import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import {
  OpencodeAdapter,
  OpencodeEventStreamParser,
  extractOpencodeTokens,
  processOpencodeStdoutLine,
} from '../src/harness/opencode/opencode.js';
import type { SpawnTaskOptions } from '../src/harness/types.js';

describe('OpenCode Event Stream and Token Metrics Translation', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-opencode-events-test-'));
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Events Feature');
    specFolder = spec.folderPath;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('Stdout JSON lines stream matching fixture/opencode-events.jsonl is parsed line by line', async () => {
    const fixturePath = path.resolve('fixture/opencode-events.jsonl');
    const fixtureContent = await fs.readFile(fixturePath, 'utf8');
    const fixtureLines = fixtureContent
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    assert.equal(fixtureLines.length, 3);

    // Parse each line individually
    for (const line of fixtureLines) {
      await assert.doesNotReject(async () => {
        await processOpencodeStdoutLine(line, specFolder, '1');
      });
    }

    // Verify stream parser handles chunked and split-line input
    const parser = new OpencodeEventStreamParser(specFolder, '2');
    const half1 = fixtureContent.slice(0, 150);
    const half2 = fixtureContent.slice(150, 400);
    const half3 = fixtureContent.slice(400);

    parser.feed(half1);
    parser.feed(half2);
    parser.feed(half3);
    await parser.flush();

    // Verify events written for task 2
    const eventFilePath = path.join(specFolder, '.run', 'events', '2.jsonl');
    const eventsRaw = await fs.readFile(eventFilePath, 'utf8');
    const events = eventsRaw
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));

    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'text');
    assert.equal(events[1].type, 'tokens');
  });

  it('step_finish event extracts input, output, total, and cache tokens with cost', () => {
    const fixtureStepFinish = {
      type: 'step_finish',
      timestamp: 1789673166622,
      sessionID: 'ses_f4f2ab168ffe8KfVG0qfEvul50',
      part: {
        id: 'prt_0b0d5571b0019EC4LWHoRDbcGf',
        reason: 'stop',
        snapshot: '3684cd022b68e3e6259b51e8951d9f3e386fa933',
        messageID: 'msg_0b0d55041001lPhr3J3inGgLBu',
        sessionID: 'ses_f4f2ab168ffe8KfVG0qfEvul50',
        type: 'step-finish',
        tokens: {
          total: 8138,
          input: 8136,
          output: 2,
          reasoning: 0,
          cache: { write: 0, read: 0 },
        },
        cost: 0.0012216,
      },
    };

    const extracted = extractOpencodeTokens(fixtureStepFinish);
    assert.ok(extracted);
    assert.equal(extracted.promptTokens, 8136);
    assert.equal(extracted.candidateTokens, 2);
    assert.equal(extracted.totalTokens, 8138);
    assert.equal(extracted.cachedTokens, 0);
    assert.equal(extracted.cost, 0.0012216);

    // Extraction with non-zero cache and direct tokens format
    const withCache = {
      type: 'step_finish',
      part: {
        tokens: {
          input: 1200,
          output: 300,
          total: 1500,
          cache: { write: 50, read: 250 },
        },
        cost: 0.0045,
      },
    };

    const extractedWithCache = extractOpencodeTokens(withCache);
    assert.ok(extractedWithCache);
    assert.equal(extractedWithCache.promptTokens, 1200);
    assert.equal(extractedWithCache.candidateTokens, 300);
    assert.equal(extractedWithCache.totalTokens, 1500);
    assert.equal(extractedWithCache.cachedTokens, 300);
    assert.equal(extractedWithCache.cost, 0.0045);

    // Extraction with numeric cache tokens
    const withNumericCache = {
      type: 'step_finish',
      part: {
        tokens: {
          input: 500,
          output: 100,
          cache: 150,
        },
      },
    };
    const extractedNumCache = extractOpencodeTokens(withNumericCache);
    assert.ok(extractedNumCache);
    assert.equal(extractedNumCache.promptTokens, 500);
    assert.equal(extractedNumCache.candidateTokens, 100);
    assert.equal(extractedNumCache.totalTokens, 600); // derived when total is missing
    assert.equal(extractedNumCache.cachedTokens, 150);
    assert.equal(extractedNumCache.cost, 0);
  });

  it('tokens event is appended to .run/events/<n>.jsonl with promptTokens, candidateTokens, totalTokens, cachedTokens, cost', async () => {
    const fixtureStepFinishLine = JSON.stringify({
      type: 'step_finish',
      timestamp: 1789673166622,
      sessionID: 'ses_f4f2ab168ffe8KfVG0qfEvul50',
      part: {
        id: 'prt_0b0d5571b0019EC4LWHoRDbcGf',
        reason: 'stop',
        snapshot: '3684cd022b68e3e6259b51e8951d9f3e386fa933',
        messageID: 'msg_0b0d55041001lPhr3J3inGgLBu',
        sessionID: 'ses_f4f2ab168ffe8KfVG0qfEvul50',
        type: 'step-finish',
        tokens: {
          total: 8138,
          input: 8136,
          output: 2,
          reasoning: 0,
          cache: { write: 0, read: 0 },
        },
        cost: 0.0012216,
      },
    });

    await processOpencodeStdoutLine(fixtureStepFinishLine, specFolder, '1');

    const eventFilePath = path.join(specFolder, '.run', 'events', '1.jsonl');
    const rawEvents = await fs.readFile(eventFilePath, 'utf8');
    const events = rawEvents
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));

    assert.equal(events.length, 1);
    const tokenEvent = events[0];
    assert.equal(tokenEvent.type, 'tokens');
    assert.equal(tokenEvent.timestamp, new Date(1789673166622).toISOString());
    assert.deepEqual(tokenEvent.data, {
      promptTokens: 8136,
      candidateTokens: 2,
      totalTokens: 8138,
      cachedTokens: 0,
      reasoningTokens: 0,
      cost: 0.0012216,
    });

    // End-to-end spawn test with fake binary outputting fixture lines
    const fakeBin = path.join(tmpDir, 'fake-emitting-opencode.mjs');
    const fixturePath = path.resolve('fixture/opencode-events.jsonl');
    const fakeScript = `#!/usr/bin/env node
import fs from 'node:fs';
const content = fs.readFileSync(${JSON.stringify(fixturePath)}, 'utf8');
process.stdout.write(content);
process.exit(0);
`;
    await fs.writeFile(fakeBin, fakeScript, { mode: 0o755 });

    const adapter = new OpencodeAdapter();
    const config: OsqConfig = {
      ...DEFAULT_CONFIG,
      opencode: { bin: fakeBin },
    };

    const taskOptions: SpawnTaskOptions = {
      projectRoot: tmpDir,
      specFolderPath: specFolder,
      taskNumber: '3',
      taskTitle: 'When fake opencode emits events',
      verifyCommand: 'node -e "process.exit(0)"',
      scope: ['src/dummy.ts'],
      entry: ['src/dummy.ts'],
      skills: [],
      tier: 'coding',
      config,
    };

    const spawnResult = await adapter.spawn(taskOptions);
    assert.equal(spawnResult.exitCode, 0);

    const task3EventsFile = path.join(specFolder, '.run', 'events', '3.jsonl');
    const task3Raw = await fs.readFile(task3EventsFile, 'utf8');
    const task3Events = task3Raw
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));

    assert.equal(task3Events.length, 2);
    assert.equal(task3Events[0].type, 'text');
    assert.equal(task3Events[1].type, 'tokens');
    assert.deepEqual(task3Events[1].data, {
      promptTokens: 8136,
      candidateTokens: 2,
      totalTokens: 8138,
      cachedTokens: 0,
      reasoningTokens: 0,
      cost: 0.0012216,
    });
  });

  it('Unknown event types such as step_start and text are logged at verbose level without throwing', async () => {
    let debugCalled = false;
    const origDebug = console.debug;
    console.debug = () => {
      debugCalled = true;
    };

    const verboseLogs: string[] = [];
    const fakeLogger = {
      info: () => {},
      verbose: (msg: string) => {
        verboseLogs.push(msg);
      },
      warn: () => {},
      error: () => {},
      status: () => {},
      clearStatus: () => {},
    };

    try {
      const stepStartLine = JSON.stringify({
        type: 'step_start',
        timestamp: 1789673165771,
        sessionID: 'ses_f4f2ab168ffe8KfVG0qfEvul50',
        part: { id: 'prt_1', type: 'step-start' },
      });

      const customLine = JSON.stringify({
        type: 'tool_call',
        name: 'grep',
      });

      // None of these should throw
      await assert.doesNotReject(async () => {
        await processOpencodeStdoutLine(stepStartLine, specFolder, 'unknown-test', fakeLogger);
        await processOpencodeStdoutLine(customLine, specFolder, 'unknown-test', fakeLogger);
      });

      // Verify console.debug was not called and unknown events were routed to verbose
      assert.equal(debugCalled, false);
      assert.ok(verboseLogs.length >= 2);
      assert.ok(verboseLogs.some((msg) => msg.includes('step_start')));
      assert.ok(verboseLogs.some((msg) => msg.includes('tool_call')));

      // No tokens event should have been written
      const eventFilePath = path.join(specFolder, '.run', 'events', 'unknown-test.jsonl');
      const exists = await fs
        .stat(eventFilePath)
        .then(() => true)
        .catch(() => false);
      assert.equal(exists, false);
    } finally {
      console.debug = origDebug;
    }
  });

  it('Malformed or unparseable non-JSON stdout lines do not crash the adapter process', async () => {
    const malformedLines = [
      'Plain stdout message from process',
      '{ incomplete json',
      '   ',
      'error: failed to bind socket',
      '{"type": "broken',
      'null',
      '12345',
    ];

    for (const line of malformedLines) {
      await assert.doesNotReject(async () => {
        await processOpencodeStdoutLine(line, specFolder, 'malformed-test');
      });
    }

    // Also verify streaming parser with mixed valid and malformed lines
    const parser = new OpencodeEventStreamParser(specFolder, 'mixed-test');
    parser.feed('Some initial noisy stdout from binary\n');
    parser.feed('{"broken": json\n');
    parser.feed(
      `${JSON.stringify({
        type: 'step_finish',
        part: {
          tokens: { input: 10, output: 5, total: 15, cache: { write: 0, read: 0 } },
          cost: 0.0001,
        },
      })}\n`,
    );
    parser.feed('Trailing non-json line without newline');
    await assert.doesNotReject(async () => {
      await parser.flush();
    });

    const eventFilePath = path.join(specFolder, '.run', 'events', 'mixed-test.jsonl');
    const rawEvents = await fs.readFile(eventFilePath, 'utf8');
    const events = rawEvents
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));

    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'tokens');
    assert.equal(events[0].data.promptTokens, 10);
    assert.equal(events[0].data.candidateTokens, 5);
    assert.equal(events[0].data.totalTokens, 15);
  });
});
