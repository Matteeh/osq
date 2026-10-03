import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { initCommand } from '../src/cli/init.js';
import { newCommand } from '../src/cli/new.js';
import { setupCommand } from '../src/cli/setup.js';
import { defineConfig, loadConfig } from '../src/core/foundation/config.js';
import { runCliCaptured } from './cli-capture.js';

/** A command's writers, appending each exact chunk to a string. */
interface Writers {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

interface Captured {
  readonly stdout: string;
  readonly stderr: string;
}

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-scaffold-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

/**
 * Reset the fixed project directory to an empty state and return it. The CLI
 * and the direct call each get a fresh project, at the same path, so their
 * output names the same absolute paths and can be compared byte for byte.
 */
async function freshProject(): Promise<string> {
  const project = path.join(root, 'project');
  await fs.rm(project, { recursive: true, force: true });
  await fs.mkdir(project, { recursive: true });
  return project;
}

/** Run the command directly, proving no byte reaches the process streams. */
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

describe('command inputs across scaffolding commands', () => {
  it('osq new prints the same text directly and through runCli', async () => {
    const cliProject = await freshProject();
    const cli = await runCliCaptured(cliProject, ['new', 'Demo Change']);
    assert.equal(cli.exitCode, undefined, JSON.stringify(cli.lines));

    const directProject = await freshProject();
    const config = await loadConfig(directProject);
    const direct = await captureDirect((writers) =>
      newCommand('Demo Change', { cwd: directProject, config, ...writers }),
    );

    assert.equal(direct.stdout, cli.stdout);
    assert.equal(direct.stderr, cli.stderr);
    assert.match(direct.stdout, /Created spec 001: 001-demo-change\n/);
  });

  it('osq init prints the same text directly and through runCli', async () => {
    const cliProject = await freshProject();
    const cli = await runCliCaptured(cliProject, ['init']);
    assert.equal(cli.exitCode, undefined, JSON.stringify(cli.lines));

    const directProject = await freshProject();
    const config = await loadConfig(directProject);
    const direct = await captureDirect((writers) =>
      initCommand({ cwd: directProject, config, ...writers }),
    );

    assert.equal(direct.stdout, cli.stdout);
    assert.equal(direct.stderr, cli.stderr);
    assert.match(direct.stdout, /\nosq initialized successfully\.\n$/);
  });

  it('osq init --refresh-schema prints the same text directly and through runCli', async () => {
    const cliProject = await freshProject();
    const cli = await runCliCaptured(cliProject, ['init', '--refresh-schema']);
    assert.equal(cli.exitCode, undefined, JSON.stringify(cli.lines));

    const directProject = await freshProject();
    const config = await loadConfig(directProject);
    const direct = await captureDirect((writers) =>
      initCommand({ cwd: directProject, config, refreshSchema: true, ...writers }),
    );

    assert.equal(direct.stdout, cli.stdout);
    assert.equal(direct.stderr, cli.stderr);
  });

  it('setupCommand writes the harness line to its stdout writer', async () => {
    const project = await freshProject();
    const config = defineConfig({ harness: 'mock' });
    const stdout: string[] = [];

    await setupCommand({ cwd: project, config, stdout: (text) => stdout.push(text) });

    assert.equal(stdout.join(''), "Harness 'mock' setup completed successfully.\n");
  });
});
