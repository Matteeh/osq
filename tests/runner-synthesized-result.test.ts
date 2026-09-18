import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { createLogger } from '../src/core/logger.js';
import { createNewSpec } from '../src/core/new.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import {
  extractFinalTextFromStream,
  runTask,
  synthesizeResultFile,
} from '../src/watcher/runner.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface ParsedEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

async function appendRawEvent(
  specFolder: string,
  taskNumber: string,
  event: Record<string, unknown>,
): Promise<void> {
  const eventsDir = path.join(specFolder, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  await fs.appendFile(
    path.join(eventsDir, `${taskNumber}.jsonl`),
    `${JSON.stringify(event)}\n`,
    'utf8',
  );
}

async function readEvents(specFolder: string, taskNumber: string): Promise<ParsedEvent[]> {
  const eventFilePath = path.join(specFolder, '.run', 'events', `${taskNumber}.jsonl`);
  const raw = await fs.readFile(eventFilePath, 'utf8');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ParsedEvent);
}

async function captureStderr(fn: () => Promise<void>): Promise<string> {
  const originalWrite = process.stderr.write;
  let stderr = '';
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stderr.write;

  try {
    await fn();
  } finally {
    process.stderr.write = originalWrite;
  }

  return stderr;
}

/**
 * Adapter that exits cleanly without writing a result file. When `finalText` is
 * provided it emits a `text` harness event, simulating an adapter that captured
 * the agent's final stream text.
 */
class NoResultStubAdapter implements HarnessAdapter {
  readonly name = 'no-result-stub';

  constructor(private readonly finalText: string | null = null) {}

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    if (this.finalText !== null) {
      await appendRawEvent(options.specFolderPath, options.taskNumber, {
        type: 'text',
        timestamp: new Date().toISOString(),
        data: { text: this.finalText },
      });
    }
    return { exitCode: 0 };
  }
}

async function writePassingTask(specFolder: string): Promise<void> {
  const taskPath = path.join(specFolder, 'tasks', '1.md');
  const task = [
    '---',
    'title: When synthesis runs, the verify gate still decides',
    'verify: node -e "process.exit(0)"',
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] should pass',
  ].join('\n');
  await fs.writeFile(taskPath, `${task}\n`, 'utf8');
}

describe('Runner synthesized result', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-synthesized-result-test-'));
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Synthesized Result');
    specFolder = spec.folderPath;
    await writePassingTask(specFolder);
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('extractFinalTextFromStream returns null when no text event exists', async () => {
    await appendRawEvent(specFolder, '1', {
      type: 'tokens',
      timestamp: new Date().toISOString(),
      data: { promptTokens: 1, candidateTokens: 2 },
    });

    assert.equal(await extractFinalTextFromStream(specFolder, '1'), null);
  });

  it('extractFinalTextFromStream returns null when the event stream is missing', async () => {
    assert.equal(await extractFinalTextFromStream(specFolder, '404'), null);
  });

  it('extractFinalTextFromStream returns the last emitted text message', async () => {
    await appendRawEvent(specFolder, '1', {
      type: 'text',
      timestamp: new Date().toISOString(),
      data: { text: 'first message' },
    });
    await appendRawEvent(specFolder, '1', {
      type: 'text',
      timestamp: new Date().toISOString(),
      data: { text: 'final message' },
    });

    assert.equal(await extractFinalTextFromStream(specFolder, '1'), 'final message');
  });

  it('synthesizeResultFile writes synthesized: true frontmatter and an attribution header', async () => {
    const resultsDir = path.join(specFolder, '.run', 'results');
    const resultPath = await synthesizeResultFile(resultsDir, '1', 'the agent final message');

    assert.equal(resultPath, path.join(resultsDir, '1.md'));
    const content = await fs.readFile(resultPath, 'utf8');
    assert.match(content, /^---\nsynthesized: true\n---\n/);
    assert.match(content, /Synthesized by the osq watcher/);
    assert.ok(content.includes('the agent final message'));
  });

  it('case A: exit 0 with missing result and final text synthesizes a result and runs verify', async () => {
    const adapter = new NoResultStubAdapter('I completed the task.');
    const logger = createLogger('normal');

    let success = false;
    const stderr = await captureStderr(async () => {
      const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter, logger);
      success = result.success;
    });

    assert.equal(success, true);

    // Result file was synthesized with frontmatter and attribution.
    const resultPath = path.join(specFolder, '.run', 'results', '1.md');
    const content = await fs.readFile(resultPath, 'utf8');
    assert.match(content, /^---\nsynthesized: true\n---\n/);
    assert.match(content, /Synthesized by the osq watcher/);
    assert.ok(content.includes('I completed the task.'));

    // A synthesized result_written event was appended.
    const events = await readEvents(specFolder, '1');
    const resultWritten = events.find((event) => event.type === 'result_written');
    assert.ok(resultWritten, 'expected a result_written event');
    assert.equal(resultWritten.data?.synthesized, true);

    // The independent verify still ran and passed, and the task is done.
    assert.ok(events.some((event) => event.type === 'verify_ran'));
    await fs.stat(path.join(specFolder, '.run', 'done', '1'));

    // The synthesis was logged on the shared logger.
    assert.match(stderr, /task 1 result synthesized from agent message/);
  });

  it('case B: exit 0 with neither result file nor final text is dead with reason no_result', async () => {
    const adapter = new NoResultStubAdapter(null);

    const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'no_result');

    const deadContent = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.ok(deadContent.includes('reason: no_result'));

    const resultExists = await fs
      .stat(path.join(specFolder, '.run', 'results', '1.md'))
      .then(() => true)
      .catch(() => false);
    assert.equal(resultExists, false);
  });

  it('README documents the synthesized result behavior for the no_result reason', async () => {
    const readme = await fs.readFile(path.join(REPO_ROOT, 'README.md'), 'utf8');
    assert.match(readme, /synthesi[sz]ed/i);
    assert.match(readme, /no_result/);
  });
});
