import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { CommandError } from '../src/cli/command-error.js';
import { showCommand } from '../src/cli/show.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { runCliCaptured } from './cli-capture.js';

const SHOW_NOT_FOUND = 'Show error: Spec "999" not found in specs or archive';

describe('command errors', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-command-error-'));
    await scaffoldProject(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('prints the show refusal on stderr and sets exit code 1', async () => {
    const capture = await runCliCaptured(tmpDir, ['show', '999']);

    assert.equal(capture.exitCode, 1);
    assert.deepEqual(capture.lines, [{ stream: 'stderr', text: SHOW_NOT_FOUND }]);
  });

  it('rejects an empty show id with one stderr line', async () => {
    const capture = await runCliCaptured(tmpDir, ['show', ' ']);

    assert.equal(capture.exitCode, 1);
    assert.deepEqual(capture.lines, [
      {
        stream: 'stderr',
        text: 'Error: specify a spec ID to show (e.g. osq show 001)',
      },
    ]);
  });

  it('prints a report error for a bad --since date', async () => {
    const capture = await runCliCaptured(tmpDir, ['report', '--since', 'garbage']);

    assert.equal(capture.exitCode, 1);
    assert.deepEqual(capture.lines, [
      { stream: 'stderr', text: 'Report error: --since is not a date: garbage' },
    ]);
  });

  it('prints a status error when a proposal is a directory', async () => {
    const changeFolder = path.join(tmpDir, 'openspec', 'changes', '001-broken');
    await fs.mkdir(path.join(changeFolder, 'proposal.md'), { recursive: true });

    const capture = await runCliCaptured(tmpDir, ['status']);

    assert.equal(capture.exitCode, 1);
    assert.equal(capture.lines.length, 1, `one line only, got:\n${JSON.stringify(capture.lines)}`);
    assert.equal(capture.lines[0]?.stream, 'stderr');
    assert.ok(
      capture.lines[0]?.text.startsWith('Status error: EISDIR'),
      `expected an EISDIR status error, got: ${capture.lines[0]?.text}`,
    );
  });

  it('lets a caller catch the CommandError and carry on', async () => {
    const originalError = console.error;
    const errors: string[] = [];
    console.error = ((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    }) as typeof console.error;

    let caught: unknown;
    try {
      await showCommand('999', { cwd: tmpDir, config: DEFAULT_CONFIG });
    } catch (error) {
      caught = error;
    } finally {
      console.error = originalError;
    }

    assert.ok(caught instanceof CommandError, 'the command rejects with a CommandError');
    assert.equal(caught.message, SHOW_NOT_FOUND);
    assert.equal(caught.exitCode, 1);
    assert.deepEqual(errors, [], 'the command itself prints nothing');
  });
});
