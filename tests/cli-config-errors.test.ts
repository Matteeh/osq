import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { runCli } from '../src/cli/run.js';

const BROKEN_VALIDATION = `import { defineConfig } from '@matteeh/osq';

export default defineConfig({ vcs: { author: 'osq' } });
`;

const VALIDATION_MESSAGE = 'vcs.author must look like "Name <email>"';

interface CliRun {
  readonly exitCode: number | undefined;
  readonly errors: readonly string[];
}

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

/**
 * Run `runCli` with `cwd` as the process directory, capturing stderr and the
 * code handed to `process.exit`. All three globals are restored afterwards.
 */
async function runInProject(cwd: string, argv: readonly string[]): Promise<CliRun> {
  const originalCwd = process.cwd();
  const originalExit = process.exit;
  const originalError = console.error;
  const errors: string[] = [];
  let exitCode: number | undefined;

  console.error = ((...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  }) as typeof console.error;
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
  }) as unknown as typeof process.exit;

  try {
    process.chdir(cwd);
    await runCli(['node', 'osq', ...argv]);
  } finally {
    process.chdir(originalCwd);
    process.exit = originalExit;
    console.error = originalError;
  }

  return { exitCode, errors };
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

    const { exitCode, errors } = await runInProject(tmpDir, ['status']);

    assert.equal(exitCode, 1);
    assert.deepEqual(errors, [`Error: Failed to load ${file}: ${VALIDATION_MESSAGE}`]);
  });

  it('prints the ConfigLoadError, exits 1, and scaffolds nothing for init', async () => {
    const file = await writeBrokenConfig(tmpDir);

    const { exitCode, errors } = await runInProject(tmpDir, ['init']);

    assert.equal(exitCode, 1);
    assert.deepEqual(errors, [`Error: Failed to load ${file}: ${VALIDATION_MESSAGE}`]);
    assert.equal(await exists(path.join(tmpDir, 'openspec')), false);
  });

  it('propagates a non-ConfigLoadError thrown by a command action', async () => {
    await assert.rejects(
      runInProject(tmpDir, ['lint', '999']),
      /not found/,
      'a non-ConfigLoadError must still reject runCli',
    );
  });
});
