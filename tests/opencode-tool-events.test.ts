import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { createLogger } from '../src/core/logger.js';
import { createNewSpec } from '../src/core/new.js';
import {
  OpencodeAdapter,
  OpencodeEventStreamParser,
  extractOpencodeToolEvent,
  extractToolEventSummary,
  processOpencodeStdoutLine,
} from '../src/harness/opencode.js';
import type { HarnessEventType, SpawnTaskOptions, ToolEventData } from '../src/harness/types.js';

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

describe('OpenCode tool event translation', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-opencode-tools-test-'));
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Tool Events Feature');
    specFolder = spec.folderPath;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("adds 'tool' to HarnessEventType and exposes ToolEventData", () => {
    const eventType: HarnessEventType = 'tool';
    assert.equal(eventType, 'tool');

    const data: ToolEventData = { tool: 'read', summary: 'src/a.ts' };
    assert.deepEqual(data, { tool: 'read', summary: 'src/a.ts' });
  });

  it('extracts file paths and patterns for read, edit, write, and glob tools', () => {
    assert.equal(extractToolEventSummary('read', { path: '/a/b.ts' }), '/a/b.ts');
    assert.equal(extractToolEventSummary('edit', { file: '/a/c.ts' }), '/a/c.ts');
    assert.equal(extractToolEventSummary('write', { filepath: '/a/d.ts' }), '/a/d.ts');
    assert.equal(extractToolEventSummary('glob', { pattern: 'src/**/*.ts' }), 'src/**/*.ts');

    // Real OpenCode uses camelCase filePath in state.input; keep the fallback robust.
    assert.equal(extractToolEventSummary('read', { filePath: '/a/e.ts' }), '/a/e.ts');
  });

  it('extracts the first 60 characters of the command for the bash tool', () => {
    const longCommand = 'x'.repeat(100);
    const summary = extractToolEventSummary('bash', { command: longCommand });
    assert.equal(summary, longCommand.slice(0, 60));
    assert.equal(summary.length, 60);
    assert.equal(extractToolEventSummary('bash', { cmd: 'echo hi' }), 'echo hi');
  });

  it('falls back to 60 characters of JSON for any other tool', () => {
    const input = { alpha: 1, beta: 'two' };
    assert.equal(extractToolEventSummary('custom', input), JSON.stringify(input).slice(0, 60));
  });

  it('recognizes tool_use top-level and part.type tool-use events', () => {
    assert.deepEqual(
      extractOpencodeToolEvent({
        type: 'tool_use',
        tool: 'read',
        input: { path: '/x.ts' },
      }),
      { tool: 'read', summary: '/x.ts' },
    );

    assert.deepEqual(
      extractOpencodeToolEvent({
        type: 'message',
        part: { type: 'tool-use', tool: 'bash', input: { command: 'ls -la' } },
      }),
      { tool: 'bash', summary: 'ls -la' },
    );

    // OpenCode nests the input under part.state.input.
    assert.deepEqual(
      extractOpencodeToolEvent({
        type: 'tool_use',
        part: { type: 'tool', tool: 'write', state: { input: { filePath: '/y.ts' } } },
      }),
      { tool: 'write', summary: '/y.ts' },
    );

    // Non-tool events and malformed values yield null.
    assert.equal(extractOpencodeToolEvent({ type: 'step_start' }), null);
    assert.equal(extractOpencodeToolEvent({ type: 'tool_use' }), null);
    assert.equal(extractOpencodeToolEvent(null), null);
    assert.equal(extractOpencodeToolEvent('tool_use'), null);
  });

  it('appends a tool event and logs it at verbose level from the shared handler', async () => {
    const line = JSON.stringify({
      type: 'tool_use',
      timestamp: 1789673166622,
      tool: 'read',
      input: { path: '/a/b.ts' },
    });

    const captured = await captureStderr(async () => {
      await processOpencodeStdoutLine(line, specFolder, '1', createLogger('verbose', 'osq'));
    });

    const events = await readEvents(specFolder, '1');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'tool');
    assert.equal(events[0].timestamp, new Date(1789673166622).toISOString());
    assert.deepEqual(events[0].data, { tool: 'read', summary: '/a/b.ts' });

    assert.ok(captured.stderr.includes('[tool] read: /a/b.ts'));
  });

  it('persists the event while suppressing the verbose log at normal level', async () => {
    const line = JSON.stringify({
      type: 'tool_use',
      tool: 'bash',
      input: { command: 'pnpm test' },
    });

    const captured = await captureStderr(async () => {
      await processOpencodeStdoutLine(line, specFolder, '2', createLogger('normal', 'osq'));
    });

    assert.equal(captured.stderr, '');

    const events = await readEvents(specFolder, '2');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'tool');
    assert.deepEqual(events[0].data, { tool: 'bash', summary: 'pnpm test' });
  });

  it('recognizes tool_use lines in the stream parser and forwards the logger', async () => {
    const parser = new OpencodeEventStreamParser(specFolder, '3', createLogger('verbose'));

    const captured = await captureStderr(async () => {
      parser.feed(
        `${JSON.stringify({
          type: 'tool_use',
          part: { type: 'tool-use', tool: 'glob', input: { pattern: 'src/**/*.ts' } },
        })}\n`,
      );
      await parser.flush();
    });

    const events = await readEvents(specFolder, '3');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'tool');
    assert.deepEqual(events[0].data, { tool: 'glob', summary: 'src/**/*.ts' });
    assert.ok(captured.stderr.includes('[tool] glob: src/**/*.ts'));
  });

  it('emits tool events through the adapter spawn path with the shared logger', async () => {
    const fakeBin = path.join(tmpDir, 'fake-tool-opencode.mjs');
    const toolLine = JSON.stringify({
      type: 'tool_use',
      timestamp: 1789673166622,
      tool: 'edit',
      input: { file: 'src/core/logger.ts' },
    });
    const fakeScript = `#!/usr/bin/env node
process.stdout.write(${JSON.stringify(`${toolLine}\n`)});
process.exit(0);
`;
    await fs.writeFile(fakeBin, fakeScript, { mode: 0o755 });

    const config: OsqConfig = { ...DEFAULT_CONFIG, opencode: { bin: fakeBin } };
    const taskOptions: SpawnTaskOptions = {
      projectRoot: tmpDir,
      specFolderPath: specFolder,
      taskNumber: '4',
      taskTitle: 'Tool event from fake opencode',
      verifyCommand: 'node -e "process.exit(0)"',
      scope: ['src/dummy.ts'],
      entry: ['src/dummy.ts'],
      skills: [],
      tier: 'coding',
      config,
      logger: createLogger('verbose'),
    };

    const captured = await captureStderr(async () => {
      const result = await new OpencodeAdapter().spawn(taskOptions);
      assert.equal(result.exitCode, 0);
    });

    const events = await readEvents(specFolder, '4');
    const toolEvents = events.filter((event) => event.type === 'tool');
    assert.equal(toolEvents.length, 1);
    assert.deepEqual(toolEvents[0].data, { tool: 'edit', summary: 'src/core/logger.ts' });
    assert.ok(captured.stderr.includes('[tool] edit: src/core/logger.ts'));
  });
});
