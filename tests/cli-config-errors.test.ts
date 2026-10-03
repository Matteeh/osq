import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { runCliCaptured } from './cli-capture.js';

const BROKEN_VALIDATION = `import { defineConfig } from '@matteeh/osq';

export default defineConfig({ vcs: { author: 'osq' } });
`;

const VALIDATION_MESSAGE = 'vcs.author must look like "Name <email>"';

async function writeBrokenConfig(root: string): Promise<string> {
  const file = path.join(root, 'osq.config.ts');
  await fs.writeFile(file, BROKEN_VALIDATION, 'utf8');
  return file;
}

async function exists(target: string): Promise<boolean> {
  return fs.stat(target).then(
    () => true,
    () => false,
  );
}

describe('cli config errors', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-cli-config-errors-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('prints the ConfigLoadError and exits 1 for status', async () => {
    const file = await writeBrokenConfig(tmpDir);

    const capture = await runCliCaptured(tmpDir, ['status']);

    assert.equal(capture.exitCode, 1);
    assert.equal(capture.stderr, `Error: Failed to load ${file}: ${VALIDATION_MESSAGE}\n`);
    assert.deepEqual(capture.lines, [
      { stream: 'stderr', text: `Error: Failed to load ${file}: ${VALIDATION_MESSAGE}` },
    ]);
  });

  it('prints the ConfigLoadError, exits 1, and scaffolds nothing for init', async () => {
    const file = await writeBrokenConfig(tmpDir);

    const capture = await runCliCaptured(tmpDir, ['init']);

    assert.equal(capture.exitCode, 1);
    assert.equal(capture.stderr, `Error: Failed to load ${file}: ${VALIDATION_MESSAGE}\n`);
    assert.deepEqual(capture.lines, [
      { stream: 'stderr', text: `Error: Failed to load ${file}: ${VALIDATION_MESSAGE}` },
    ]);
    assert.equal(await exists(path.join(tmpDir, 'openspec')), false);
  });

  it('propagates a non-ConfigLoadError thrown by a command action', async () => {
    await assert.rejects(
      runCliCaptured(tmpDir, ['lint', '999']),
      /not found/,
      'a non-ConfigLoadError must still reject runCli',
    );
  });
});
