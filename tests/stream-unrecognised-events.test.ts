import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createLogger } from '../src/core/logger.js';
import { processAgyStdoutLine } from '../src/harness/agy.js';
import { processOpencodeStdoutLine } from '../src/harness/opencode.js';

interface CapturedOutput {
  stdout: string;
  stderr: string;
}

/**
 * Capture both process streams for the duration of `fn` so a test can prove
 * that an unrecognised harness event never leaks onto stdout while its verbose
 * diagnostic still reaches the leveled logger.
 */
async function captureOutput(fn: () => Promise<void>): Promise<CapturedOutput> {
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  let stdout = '';
  let stderr = '';

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stderr.write;

  try {
    await fn();
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }

  return { stdout, stderr };
}

describe('Unrecognised harness stream events', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-unrecognised-events-test-'));
    specFolder = path.join(tmpDir, 'specs', '001-test');
    await fs.mkdir(path.join(specFolder, '.run', 'events'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('opencode routes unrecognised event types to logger.verbose without touching stdout', async () => {
    const line = JSON.stringify({
      type: 'step_start',
      timestamp: 1789673165771,
      part: { id: 'prt_1', type: 'step-start' },
    });
    const logger = createLogger('verbose');

    const captured = await captureOutput(async () => {
      await processOpencodeStdoutLine(line, specFolder, '1', logger);
    });

    assert.match(captured.stderr, /\[opencode\] Unknown event type: step_start/);
    assert.equal(captured.stdout, '');
  });

  it('opencode stays silent at normal level for unrecognised event types', async () => {
    const line = JSON.stringify({ type: 'tool_call', name: 'grep' });
    const logger = createLogger('normal');

    const captured = await captureOutput(async () => {
      await processOpencodeStdoutLine(line, specFolder, '1', logger);
    });

    assert.equal(captured.stderr, '');
    assert.equal(captured.stdout, '');
  });

  it('opencode does not use console.debug for unrecognised event types', async () => {
    const line = JSON.stringify({ type: 'step_start', part: { type: 'step-start' } });
    const originalDebug = console.debug;
    let debugCalls = 0;
    console.debug = () => {
      debugCalls += 1;
    };

    try {
      const captured = await captureOutput(async () => {
        await processOpencodeStdoutLine(line, specFolder, '1', createLogger('verbose'));
      });

      assert.equal(debugCalls, 0, 'console.debug must not be used for stream events');
      assert.equal(captured.stdout, '');
    } finally {
      console.debug = originalDebug;
    }
  });

  it('agy routes unrecognised event types to logger.verbose without touching stdout', async () => {
    const line = JSON.stringify({ event: 'ping', seq: 7 });
    const logger = createLogger('verbose');

    const captured = await captureOutput(async () => {
      await processAgyStdoutLine(line, specFolder, '1', logger);
    });

    assert.match(captured.stderr, /\[agy\]/);
    assert.match(captured.stderr, /ping/);
    assert.equal(captured.stdout, '');
  });

  it('agy routes malformed non-JSON lines to logger.verbose without touching stdout', async () => {
    const logger = createLogger('verbose');

    const captured = await captureOutput(async () => {
      await processAgyStdoutLine('plain text from agy', specFolder, '1', logger);
    });

    assert.match(captured.stderr, /\[agy\]/);
    assert.match(captured.stderr, /plain text from agy/);
    assert.equal(captured.stdout, '');
  });

  it('agy stays silent at normal level for unrecognised events and malformed lines', async () => {
    const logger = createLogger('normal');

    const captured = await captureOutput(async () => {
      await processAgyStdoutLine(JSON.stringify({ event: 'ping' }), specFolder, '1', logger);
      await processAgyStdoutLine('plain text from agy', specFolder, '1', logger);
    });

    assert.equal(captured.stderr, '');
    assert.equal(captured.stdout, '');
  });

  it('unrecognised events write nothing to the append-only events.jsonl stream', async () => {
    await captureOutput(async () => {
      await processOpencodeStdoutLine(
        JSON.stringify({ type: 'step_start', part: { type: 'step-start' } }),
        specFolder,
        '1',
        createLogger('verbose'),
      );
      await processAgyStdoutLine(
        JSON.stringify({ event: 'ping' }),
        specFolder,
        '1',
        createLogger('verbose'),
      );
      await processAgyStdoutLine('plain text from agy', specFolder, '1', createLogger('verbose'));
    });

    const eventsPath = path.join(specFolder, '.run', 'events', '1.jsonl');
    const exists = await fs
      .stat(eventsPath)
      .then(() => true)
      .catch(() => false);
    assert.equal(exists, false, 'unrecognised events must not be persisted');
  });
});
