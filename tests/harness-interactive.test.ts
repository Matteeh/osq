import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { AgyAdapter } from '../src/harness/agy.js';
import { MockAdapter } from '../src/harness/mock.js';
import { OpencodeAdapter } from '../src/harness/opencode.js';

describe('HarnessAdapter spawnInteractive', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-harness-interactive-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('OpencodeAdapter spawns fake binary with expected argv and returns exit code', async () => {
    const recordedFile = path.join(tmpDir, 'opencode-recorded.json');
    const fakeBin = path.join(tmpDir, 'fake-opencode.mjs');

    const fakeScript = `#!/usr/bin/env node
import fs from 'node:fs';
const argv = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(recordedFile)}, JSON.stringify({ argv, isTTY: process.stdout.isTTY }, null, 2), 'utf8');
process.exit(42);
`;
    await fs.writeFile(fakeBin, fakeScript, { mode: 0o755 });

    const adapter = new OpencodeAdapter();
    const prompt = 'Plan change 031';

    // Set OPENCODE_PATH to point to fake bin
    const originalPath = process.env.OPENCODE_PATH;
    process.env.OPENCODE_PATH = fakeBin;

    try {
      const exitCode = await adapter.spawnInteractive({
        prompt,
        cwd: tmpDir,
        model: 'custom/model',
        agent: 'osq-planner',
      });

      assert.equal(exitCode, 42);

      const recorded = JSON.parse(await fs.readFile(recordedFile, 'utf8'));
      assert.equal(recorded.argv[0], prompt);
      assert.equal(recorded.argv[1], '--dir');
      assert.equal(recorded.argv[2], tmpDir);

      const modelIdx = recorded.argv.indexOf('--model');
      assert.notEqual(modelIdx, -1);
      assert.equal(recorded.argv[modelIdx + 1], 'custom/model');

      const agentIdx = recorded.argv.indexOf('--agent');
      assert.notEqual(agentIdx, -1);
      assert.equal(recorded.argv[agentIdx + 1], 'osq-planner');
    } finally {
      process.env.OPENCODE_PATH = originalPath;
    }
  });

  it('AgyAdapter spawns fake binary with expected -i argv and returns exit code', async () => {
    const recordedFile = path.join(tmpDir, 'agy-recorded.json');
    const fakeBin = path.join(tmpDir, 'fake-agy.mjs');

    const fakeScript = `#!/usr/bin/env node
import fs from 'node:fs';
const argv = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(recordedFile)}, JSON.stringify({ argv }, null, 2), 'utf8');
process.exit(0);
`;
    await fs.writeFile(fakeBin, fakeScript, { mode: 0o755 });

    const adapter = new AgyAdapter();
    const prompt = 'Plan change 031 in agy';

    const originalPath = process.env.AGY_PATH;
    process.env.AGY_PATH = fakeBin;

    try {
      const exitCode = await adapter.spawnInteractive({
        prompt,
        cwd: tmpDir,
        model: 'gemini-3.8-pro',
        agent: 'custom-planner',
      });

      assert.equal(exitCode, 0);

      const recorded = JSON.parse(await fs.readFile(recordedFile, 'utf8'));
      assert.equal(recorded.argv[0], '-i');
      assert.equal(recorded.argv[1], prompt);

      const modelIdx = recorded.argv.indexOf('--model');
      assert.notEqual(modelIdx, -1);
      assert.equal(recorded.argv[modelIdx + 1], 'gemini-3.8-pro');

      const agentIdx = recorded.argv.indexOf('--agent');
      assert.notEqual(agentIdx, -1);
      assert.equal(recorded.argv[agentIdx + 1], 'custom-planner');

      assert.ok(recorded.argv.includes('--dangerously-skip-permissions'));
    } finally {
      process.env.AGY_PATH = originalPath;
    }
  });

  it('MockAdapter records interactive spawns and returns configured exit code', async () => {
    const mock = new MockAdapter();
    mock.setBehavior({ exitCode: 7 });

    const exitCode = await mock.spawnInteractive({
      prompt: 'Test prompt',
      cwd: tmpDir,
      model: 'mock-model',
    });

    assert.equal(exitCode, 7);
    assert.equal(mock.recordedInteractiveSpawns.length, 1);
    assert.deepEqual(mock.recordedInteractiveSpawns[0], {
      prompt: 'Test prompt',
      cwd: tmpDir,
      model: 'mock-model',
    });

    mock.resetBehavior();
    assert.equal(mock.recordedInteractiveSpawns.length, 0);
  });
});
