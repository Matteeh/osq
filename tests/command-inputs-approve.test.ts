import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveCommand } from '../src/cli/approve.js';
import { loadConfig } from '../src/core/foundation/config.js';
import { runCliCaptured } from './cli-capture.js';
import { createChange, createProject, restoreEnv } from './planning-observed-helpers.js';

const tmpRoots: string[] = [];

beforeEach(() => {
  restoreEnv();
  // Keep the default planning readers away from the real home directory so the
  // CLI's approval matches the direct call's empty `planningReaders`.
  process.env.CODEX_HOME = '/nonexistent-osq-command-inputs-codex';
  process.env.OSQ_CLAUDE_PROJECTS_DIR = '/nonexistent-osq-command-inputs-claude';
  process.env.CLAUDE_CONFIG_DIR = '/nonexistent-osq-command-inputs-claude-config';
  process.env.OPENCODE_PATH = '/nonexistent-osq-command-inputs-opencode';
});

afterEach(async () => {
  restoreEnv();
  for (const root of tmpRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

/** A command's writers, appending each exact chunk to a string. */
interface Writers {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

interface Captured {
  readonly stdout: string;
  readonly stderr: string;
}

/** Run `run` with appending writers, proving no byte reaches the process streams. */
async function captureDirect(run: (writers: Writers) => Promise<unknown>): Promise<Captured> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const leaked: string[] = [];
  const originalStdout = process.stdout.write;
  const originalStderr = process.stderr.write;
  const record = (chunk: string | Uint8Array): boolean => {
    leaked.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  };
  process.stdout.write = record as typeof process.stdout.write;
  process.stderr.write = record as typeof process.stderr.write;
  try {
    await run({ stdout: (text) => stdout.push(text), stderr: (text) => stderr.push(text) });
  } finally {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
  }
  assert.deepEqual(leaked, [], 'the direct call wrote to a process stream');
  return { stdout: stdout.join(''), stderr: stderr.join('') };
}

/** A fresh project with one flagged change, ready to approve. */
async function flaggedProject(): Promise<{ root: string; specId: string }> {
  const root = await createProject();
  tmpRoots.push(root);
  const change = await createChange(root, 'Flagged Change');
  return { root, specId: change.specId };
}

describe('command inputs for approve', () => {
  it('osq approve prints the same text directly and through runCli', async () => {
    const cli = await flaggedProject();
    const cliCapture = await runCliCaptured(cli.root, ['approve', cli.specId]);
    assert.equal(cliCapture.exitCode ?? 0, 0, JSON.stringify(cliCapture.lines));

    const direct = await flaggedProject();
    const config = await loadConfig(direct.root);
    const directCapture = await captureDirect((writers) =>
      approveCommand([direct.specId], {
        cwd: direct.root,
        config,
        planningReaders: [],
        now: new Date(),
        ...writers,
      }),
    );

    assert.equal(directCapture.stdout, cliCapture.stdout);
    assert.equal(directCapture.stderr, cliCapture.stderr);
    assert.match(directCapture.stdout, /Approved 001 \(001-flagged-change\) with 2 flags:/);
    assert.equal(directCapture.stderr, '');
  });

  it('a confirmed run prints its flag lines to stdout', async () => {
    const direct = await flaggedProject();
    const config = await loadConfig(direct.root);
    let asked = '';

    const capture = await captureDirect((writers) =>
      approveCommand([direct.specId], {
        cwd: direct.root,
        config,
        planningReaders: [],
        now: new Date(),
        confirm: true,
        isTerminal: () => true,
        ask: async (question) => {
          asked = question;
          return 'y';
        },
        ...writers,
      }),
    );

    assert.equal(asked, `Approve ${direct.specId} with 2 flag(s)? [y/N]`);
    assert.match(capture.stdout, /Flag: verify without a test in task 1 \u2014 node verify.cjs/);
    assert.equal(capture.stderr, '');
  });
});
