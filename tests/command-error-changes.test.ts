import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { CommandError } from '../src/cli/command-error.js';
import { inboxCommand } from '../src/cli/inbox.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { type CliCapture, runCliCaptured } from './cli-capture.js';

describe('converted commands throw CommandError', () => {
  let tmpDir: string;
  let homeAsFile: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-command-error-changes-'));
    await scaffoldProject(tmpDir);
    homeAsFile = path.join(tmpDir, 'home-is-a-file');
    await fs.writeFile(homeAsFile, 'not a directory', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  /** Run the command line and require exactly one stderr line, no stdout line, code 1. */
  async function oneStderrLine(argv: readonly string[]): Promise<CliCapture> {
    const capture = await runCliCaptured(tmpDir, argv);
    assert.equal(capture.exitCode, 1, `argv ${argv.join(' ')} exit code`);
    assert.equal(
      capture.lines.length,
      1,
      `argv ${argv.join(' ')} wrote:\n${JSON.stringify(capture.lines)}`,
    );
    assert.equal(capture.lines[0]?.stream, 'stderr');
    return capture;
  }

  it('new throws when the spec name slugifies to nothing', async () => {
    const capture = await oneStderrLine(['new', '///']);
    assert.equal(capture.lines[0]?.text, 'Error: Spec name cannot be empty');
  });

  it('done throws when --manual is blank', async () => {
    const capture = await oneStderrLine(['done', '999', '1', '--manual', ' ']);
    assert.equal(
      capture.lines[0]?.text,
      'Error: --manual <reason> is required to mark a task done',
    );
  });

  it('done throws when the spec is missing', async () => {
    const capture = await oneStderrLine(['done', '999', '1', '--manual', 'x']);
    assert.ok(
      capture.lines[0]?.text.startsWith('Error marking task done:\n  Spec "999" not found'),
      `got: ${capture.lines[0]?.text}`,
    );
  });

  it('reject throws when the spec is missing', async () => {
    const capture = await oneStderrLine(['reject', '999', '--reason', 'x']);
    assert.ok(
      capture.lines[0]?.text.startsWith('Error rejecting 999:\n  Spec "999" not found'),
      `got: ${capture.lines[0]?.text}`,
    );
  });

  it('retry throws when the spec is missing', async () => {
    const capture = await oneStderrLine(['retry', '999', '1']);
    assert.ok(
      capture.lines[0]?.text.startsWith('Error retrying 999 1:\n  Spec "999" not found'),
      `got: ${capture.lines[0]?.text}`,
    );
  });

  it('queue throws when the queue file is missing', async () => {
    const capture = await oneStderrLine(['queue']);
    assert.ok(
      capture.lines[0]?.text.startsWith('Queue error: Queue file not found'),
      `got: ${capture.lines[0]?.text}`,
    );
  });

  it('inbox rejects with a CommandError when the cursor folder cannot be created', async () => {
    const stdout: string[] = [];
    let caught: unknown;
    try {
      await inboxCommand({
        cwd: tmpDir,
        config: DEFAULT_CONFIG,
        home: homeAsFile,
        stdout: (msg) => stdout.push(msg),
      });
    } catch (error) {
      caught = error;
    }

    assert.ok(caught instanceof CommandError, `expected a CommandError, got ${String(caught)}`);
    assert.equal(caught.exitCode, 1);
    assert.ok(
      caught.message.startsWith('Inbox error: ENOTDIR'),
      `expected an ENOTDIR inbox error, got: ${caught.message}`,
    );
    assert.deepEqual(stdout, [], 'the inbox printed nothing before failing');
  });
});
