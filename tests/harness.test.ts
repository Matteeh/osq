import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { createNewSpec } from '../src/core/new.js';
import { AgyAdapter, buildAgyArgs } from '../src/harness/agy.js';
import { getHarnessAdapter } from '../src/harness/index.js';
import { MockAdapter } from '../src/harness/mock.js';
import { type HarnessEvent, appendHarnessEvent } from '../src/harness/types.js';

describe('Harness Adapter and Event Logging', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-harness-test-'));
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Harness Execution');
    specFolder = spec.folderPath;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('appendHarnessEvent appends valid JSONL events to .run/events/<n>.jsonl', async () => {
    const event1: HarnessEvent = {
      type: 'started',
      timestamp: new Date().toISOString(),
      data: { tier: 'coding', pid: 1234 },
    };
    const event2: HarnessEvent = {
      type: 'tokens',
      timestamp: new Date().toISOString(),
      data: { promptTokens: 100, candidateTokens: 50 },
    };

    await appendHarnessEvent(specFolder, '1', event1);
    await appendHarnessEvent(specFolder, '1', event2);

    const eventFilePath = path.join(specFolder, '.run', 'events', '1.jsonl');
    const content = await fs.readFile(eventFilePath, 'utf8');
    const lines = content
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    assert.equal(lines.length, 2);
    assert.equal(lines[0].type, 'started');
    assert.equal(lines[1].type, 'tokens');
    assert.equal(lines[1].data.promptTokens, 100);
  });

  it('MockAdapter setup and spawn simulates task execution and emits events', async () => {
    const mock = new MockAdapter();
    await mock.setup(tmpDir, DEFAULT_CONFIG);

    const result = await mock.spawn({
      projectRoot: tmpDir,
      specFolderPath: specFolder,
      taskNumber: '1',
      taskTitle: 'When sample task runs',
      verifyCommand: 'node -e "process.exit(0)"',
      scope: ['src/index.ts'],
      entry: ['src/index.ts'],
      skills: [],
      tier: 'coding',
    });

    assert.equal(result.exitCode, 0);

    // Verify result file was written by mock agent
    const resultFilePath = path.join(specFolder, '.run', 'results', '1.md');
    const resultExists = await fs.stat(resultFilePath);
    assert.ok(resultExists);

    // Verify events were logged
    const eventFilePath = path.join(specFolder, '.run', 'events', '1.jsonl');
    const eventContent = await fs.readFile(eventFilePath, 'utf8');
    assert.ok(eventContent.includes('"type":"tokens"'));
    assert.ok(eventContent.includes('"type":"result_written"'));
  });

  it('AgyAdapter initializes with correct name and can perform setup', async () => {
    const agy = new AgyAdapter();
    assert.equal(agy.name, 'agy');
    await agy.setup(tmpDir, DEFAULT_CONFIG);
  });

  it('getHarnessAdapter resolves registered adapters and rejects unknown names', () => {
    const mock = getHarnessAdapter('mock');
    assert.equal(mock.name, 'mock');

    const agy = getHarnessAdapter('agy');
    assert.equal(agy.name, 'agy');

    assert.throws(() => {
      getHarnessAdapter('unsupported-harness');
    }, /Unknown harness adapter: "unsupported-harness"/);
  });

  it('AgyAdapter includes --print-timeout <n>s in args based on config timeouts', () => {
    const config: OsqConfig = {
      ...DEFAULT_CONFIG,
      timeouts: {
        ...DEFAULT_CONFIG.timeouts,
        taskTimeoutSeconds: 300,
      },
    };

    const args = buildAgyArgs({
      projectRoot: tmpDir,
      specFolderPath: specFolder,
      taskNumber: '1',
      taskTitle: 'Agy print timeout test',
      verifyCommand: 'node -e "process.exit(0)"',
      scope: ['src/index.ts'],
      entry: ['src/index.ts'],
      skills: [],
      tier: 'coding',
      config,
    });

    const flagIndex = args.indexOf('--print-timeout');
    assert.notEqual(flagIndex, -1, 'Expected --print-timeout in args');
    assert.equal(args[flagIndex + 1], '270s');
  });
});
