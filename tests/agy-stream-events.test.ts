import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createLogger } from '../src/core/foundation/logger.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import {
  AgyAdapter,
  AgyEventStreamParser,
  buildAgyArgs,
  extractAgyTokens,
  extractAgyToolEvent,
  processAgyStdoutLine,
} from '../src/harness/agy/agy.js';
import type { SpawnTaskOptions } from '../src/harness/types.js';

interface CapturedOutput {
  stderr: string;
}

async function captureStderr(fn: () => Promise<void>): Promise<CapturedOutput> {
  const originalStderrWrite = process.stderr.write;
  let stderr = '';

  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stderr.write;

  try {
    await fn();
  } finally {
    process.stderr.write = originalStderrWrite;
  }

  return { stderr };
}

async function readEvents(specFolder: string, taskNumber: string) {
  const eventFilePath = path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`);
  const raw = await fs.readFile(eventFilePath, 'utf8');
  return raw
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

const FIXTURE_PATH = path.resolve('fixture/agy-events.jsonl');

describe('Agy stream-json event translation', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-agy-stream-test-'));
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Agy Stream Events Feature');
    specFolder = spec.folderPath;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    process.env.AGY_PATH = undefined;
  });

  it('buildAgyArgs adds --output-format stream-json to the arguments', () => {
    const args = buildAgyArgs({
      projectRoot: tmpDir,
      specFolderPath: specFolder,
      taskNumber: '1',
      taskTitle: 'Agy stream-json args',
      verifyCommand: 'node -e "process.exit(0)"',
      scope: ['src/index.ts'],
      entry: ['src/index.ts'],
      skills: [],
      tier: 'coding',
      config: DEFAULT_CONFIG,
    });

    const flagIndex = args.indexOf('--output-format');
    assert.notEqual(flagIndex, -1, 'Expected --output-format in agy args');
    assert.equal(args[flagIndex + 1], 'stream-json');
  });

  it('extracts token usage from step_update usage fields', () => {
    const event = {
      event: 'step_update',
      step_update: {
        conversation_id: 'abc',
        step_index: 1,
        state: 'DONE',
        step_type: 'agent_response',
        usage: {
          input_tokens: 13255,
          output_tokens: 36,
          thinking_tokens: 27,
          cache_read_tokens: 12,
          total_tokens: 13291,
        },
      },
    };

    const tokens = extractAgyTokens(event);
    assert.ok(tokens);
    assert.equal(tokens.promptTokens, 13255);
    assert.equal(tokens.candidateTokens, 36);
    assert.equal(tokens.cachedTokens, 12);
    assert.equal(tokens.totalTokens, 13291);
    assert.equal(tokens.cost, 0);
  });

  it('defaults missing usage fields and derives total from input plus output', () => {
    const tokens = extractAgyTokens({
      event: 'step_update',
      step_update: { step_type: 'agent_response', usage: { input_tokens: 10, output_tokens: 5 } },
    });

    assert.ok(tokens);
    assert.equal(tokens.promptTokens, 10);
    assert.equal(tokens.candidateTokens, 5);
    assert.equal(tokens.cachedTokens, 0);
    assert.equal(tokens.totalTokens, 15);

    // No usage at all yields null rather than a spurious zeroed event.
    assert.equal(extractAgyTokens({ event: 'step_update', step_update: {} }), null);
    assert.equal(extractAgyTokens(null), null);
    assert.equal(extractAgyTokens('not-an-event'), null);
  });

  it('appends a tokens event for a step_update with usage', async () => {
    const line = JSON.stringify({
      event: 'step_update',
      step_update: {
        step_index: 1,
        state: 'DONE',
        step_type: 'agent_response',
        usage: {
          input_tokens: 13255,
          output_tokens: 36,
          cache_read_tokens: 0,
          total_tokens: 13291,
        },
      },
    });

    await processAgyStdoutLine(line, specFolder, '1');

    const events = await readEvents(specFolder, '1');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'tokens');
    assert.deepEqual(events[0].data, {
      promptTokens: 13255,
      candidateTokens: 36,
      totalTokens: 13291,
      cachedTokens: 0,
      reasoningTokens: 0,
      cost: 0,
    });
  });

  it('extracts tool name and command/path summaries from step_update tool steps', () => {
    const longCommand = 'x'.repeat(100);
    assert.deepEqual(
      extractAgyToolEvent({
        event: 'step_update',
        step_update: {
          step_type: 'tool',
          tool_name: 'run_command',
          tool_info: { name: 'run_command', parameters: { CommandLine: longCommand } },
        },
      }),
      { tool: 'run_command', summary: longCommand.slice(0, 60) },
    );

    // Tool name falls back to tool_info.name.
    assert.deepEqual(
      extractAgyToolEvent({
        event: 'step_update',
        step_update: {
          step_type: 'tool',
          tool_info: { name: 'view_file', parameters: { AbsolutePath: '/a/b.ts' } },
        },
      }),
      { tool: 'view_file', summary: '/a/b.ts' },
    );

    // Non-tool steps and malformed values yield null.
    assert.equal(
      extractAgyToolEvent({
        event: 'step_update',
        step_update: { step_type: 'agent_response', usage: {} },
      }),
      null,
    );
    assert.equal(extractAgyToolEvent({ event: 'step_update', step_update: {} }), null);
    assert.equal(extractAgyToolEvent(null), null);
  });

  it('appends a tool event and logs it at verbose level from the shared handler', async () => {
    const line = JSON.stringify({
      event: 'step_update',
      step_update: {
        step_index: 2,
        state: 'DONE',
        step_type: 'tool',
        tool_name: 'run_command',
        tool_info: { name: 'run_command', parameters: { CommandLine: 'pnpm test' } },
      },
    });

    const captured = await captureStderr(async () => {
      await processAgyStdoutLine(line, specFolder, '2', createLogger('verbose', 'osq'));
    });

    const events = await readEvents(specFolder, '2');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'tool');
    assert.deepEqual(events[0].data, { tool: 'run_command', summary: 'pnpm test' });

    assert.ok(captured.stderr.includes('[tool] run_command: pnpm test'));
  });

  it('persists the tool event while suppressing the verbose log at normal level', async () => {
    const line = JSON.stringify({
      event: 'step_update',
      step_update: {
        step_type: 'tool',
        tool_name: 'view_file',
        tool_info: { parameters: { AbsolutePath: 'src/core/logger.ts' } },
      },
    });

    const captured = await captureStderr(async () => {
      await processAgyStdoutLine(line, specFolder, '3', createLogger('normal', 'osq'));
    });

    assert.equal(captured.stderr, '');

    const events = await readEvents(specFolder, '3');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'tool');
    assert.deepEqual(events[0].data, { tool: 'view_file', summary: 'src/core/logger.ts' });
  });

  it('parses fixture/agy-events.jsonl lines and emits a single tokens event', async () => {
    const fixtureContent = await fs.readFile(FIXTURE_PATH, 'utf8');
    const lines = fixtureContent
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      await assert.doesNotReject(async () => {
        await processAgyStdoutLine(line, specFolder, '1');
      });
    }

    // The fixture contains one agent_response step_update carrying usage; the
    // result summary must not double count.
    const events = await readEvents(specFolder, '1');
    const tokenEvents = events.filter((e) => e.type === 'tokens');
    assert.equal(tokenEvents.length, 1);
    assert.deepEqual(tokenEvents[0].data, {
      promptTokens: 13255,
      candidateTokens: 36,
      totalTokens: 13291,
      cachedTokens: 0,
      reasoningTokens: 27,
      cost: 0,
    });

    // Stream parser must tolerate chunked and split-line input.
    const parser = new AgyEventStreamParser(specFolder, '2');
    parser.feed(fixtureContent.slice(0, 200));
    parser.feed(fixtureContent.slice(200, 500));
    parser.feed(fixtureContent.slice(500));
    await parser.flush();

    const parsedEvents = await readEvents(specFolder, '2');
    const parsedTokenEvents = parsedEvents.filter((e) => e.type === 'tokens');
    assert.equal(parsedTokenEvents.length, 1);
  });

  it('falls back gracefully when stdout is plain text without valid JSON', async () => {
    const malformedLines = [
      'Plain stdout message from agy',
      '{ incomplete json',
      '   ',
      'error: failed to bind socket',
      '{"event": "broken',
      'null',
      '12345',
    ];

    for (const line of malformedLines) {
      await assert.doesNotReject(async () => {
        await processAgyStdoutLine(line, specFolder, '4');
      });
    }

    const parser = new AgyEventStreamParser(specFolder, '5');
    parser.feed('Some initial noisy stdout\n');
    parser.feed('{"event":"step_update","step_update":{"step_type"\n');
    parser.feed(
      `${JSON.stringify({
        event: 'step_update',
        step_update: {
          step_type: 'tool',
          tool_name: 'run_command',
          tool_info: { parameters: { CommandLine: 'pnpm lint' } },
        },
      })}\n`,
    );
    parser.feed('Trailing non-json line without newline');
    await assert.doesNotReject(async () => {
      await parser.flush();
    });

    const events = await readEvents(specFolder, '5');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'tool');
    assert.deepEqual(events[0].data, { tool: 'run_command', summary: 'pnpm lint' });
  });

  it('translates stream events through the adapter spawn path with the shared logger', async () => {
    const fakeBin = path.join(tmpDir, 'fake-agy.mjs');
    const fakeScript = `#!/usr/bin/env node
import fs from 'node:fs';
process.stdout.write(fs.readFileSync(${JSON.stringify(FIXTURE_PATH)}, 'utf8'));
process.exit(0);
`;
    await fs.writeFile(fakeBin, fakeScript, { mode: 0o755 });
    process.env.AGY_PATH = fakeBin;

    const config: OsqConfig = { ...DEFAULT_CONFIG };
    const taskOptions: SpawnTaskOptions = {
      projectRoot: tmpDir,
      specFolderPath: specFolder,
      taskNumber: '6',
      taskTitle: 'Stream events from fake agy',
      verifyCommand: 'node -e "process.exit(0)"',
      scope: ['src/dummy.ts'],
      entry: ['src/dummy.ts'],
      skills: [],
      tier: 'coding',
      config,
      logger: createLogger('verbose'),
    };

    const result = await new AgyAdapter().spawn(taskOptions);
    assert.equal(result.exitCode, 0);

    const events = await readEvents(specFolder, '6');
    const tokenEvents = events.filter((event) => event.type === 'tokens');
    assert.equal(tokenEvents.length, 1);
    assert.deepEqual(tokenEvents[0].data, {
      promptTokens: 13255,
      candidateTokens: 36,
      totalTokens: 13291,
      cachedTokens: 0,
      reasoningTokens: 27,
      cost: 0,
    });
  });
});
