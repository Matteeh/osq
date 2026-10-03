import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { doctorCommand } from '../src/cli/doctor.js';
import { serveCommand } from '../src/cli/serve.js';
import { type OsqConfig, defineConfig, loadConfig } from '../src/core/foundation/config.js';
import {
  MANAGED_AGENTS_MD_BODY,
  MANAGED_CLAUDE_PLAN_COMMAND,
  MANAGED_PLANNER_BLOCK,
} from '../src/core/foundation/init.js';
import { OPENSPEC_EXPECTED_VERSION } from '../src/core/spec/linter.js';
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

let project: string;
let config: OsqConfig;

/** Install a stub `openspec` binary so the default validator probe is hermetic. */
async function installFakeValidator(root: string): Promise<void> {
  const binDir = path.join(root, 'node_modules', '.bin');
  await fs.mkdir(binDir, { recursive: true });
  const script = `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(OPENSPEC_EXPECTED_VERSION)});\n`;
  await fs.writeFile(path.join(binDir, 'openspec'), script, { mode: 0o755 });
}

/** A repository whose doctor checks all pass, with the given configured harness. */
async function writeHealthyRepo(root: string, harness: string): Promise<void> {
  await fs.mkdir(path.join(root, 'openspec', 'changes', 'archive'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'osq.config.ts'),
    `export default { harness: '${harness}' };\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(root, 'AGENTS.md'),
    `# Instructions\n\n${MANAGED_AGENTS_MD_BODY}\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(root, 'PLANNER.md'),
    `# Instructions\n\n${MANAGED_PLANNER_BLOCK}\n`,
    'utf8',
  );
  const commandDir = path.join(root, '.claude', 'commands');
  await fs.mkdir(commandDir, { recursive: true });
  await fs.writeFile(
    path.join(commandDir, 'osq-plan.md'),
    `# Plan a change with osq\n\n${MANAGED_CLAUDE_PLAN_COMMAND}\n`,
    'utf8',
  );
}

beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inputs-doctor-serve-'));
  await writeHealthyRepo(project, 'mock');
  await installFakeValidator(project);
  config = await loadConfig(project);
});

afterEach(async () => {
  await fs.rm(project, { recursive: true, force: true });
});

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

describe('command inputs across doctor and serve', () => {
  it('osq doctor prints the same text directly and through runCli', async () => {
    const cli = await runCliCaptured(project, ['doctor']);
    assert.equal(cli.exitCode, undefined, JSON.stringify(cli.lines));

    const direct = await captureDirect((writers) =>
      doctorCommand({ cwd: project, config, ...writers }),
    );

    assert.equal(direct.stdout, cli.stdout);
    assert.equal(direct.stderr, cli.stderr);
    assert.match(direct.stdout, /\[ok\] config: loaded \(harness: mock\)\n/);
  });

  it('passes an explicit config to doctor config check instead of loading the file', async () => {
    const agyProject = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inputs-doctor-config-'));
    try {
      await writeHealthyRepo(agyProject, 'agy');
      await installFakeValidator(agyProject);

      const direct = await captureDirect((writers) =>
        doctorCommand({ cwd: agyProject, config: defineConfig({ harness: 'mock' }), ...writers }),
      );

      assert.match(direct.stdout, /\[ok\] config: loaded \(harness: mock\)\n/);
      assert.doesNotMatch(direct.stdout, /harness: agy/);
    } finally {
      await fs.rm(agyProject, { recursive: true, force: true });
    }
  });

  it('osq serve --export prints the same text directly and through runCli', async () => {
    const target = path.join(project, 'snapshot');

    const cli = await runCliCaptured(project, ['serve', '--export', 'snapshot']);
    assert.equal(cli.exitCode, undefined, JSON.stringify(cli.lines));
    await fs.rm(target, { recursive: true, force: true });

    const direct = await captureDirect((writers) =>
      serveCommand({ cwd: project, config, exportDir: 'snapshot', ...writers }),
    );

    assert.equal(direct.stdout, cli.stdout);
    assert.equal(direct.stderr, cli.stderr);
    assert.equal(
      direct.stdout,
      `exported dashboard to ${target}\nscrubbed: project root and home directory paths only; read the export before publishing\n`,
    );
    await fs.rm(target, { recursive: true, force: true });
  });
});
