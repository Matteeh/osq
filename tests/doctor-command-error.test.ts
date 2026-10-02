import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { CommandError } from '../src/cli/command-error.js';
import { type DoctorCommandOptions, doctorCommand } from '../src/cli/doctor.js';
import type { DoctorReport } from '../src/core/foundation/doctor.js';
import {
  MANAGED_AGENTS_MD_BODY,
  MANAGED_CLAUDE_PLAN_COMMAND,
  MANAGED_PLANNER_BLOCK,
} from '../src/core/foundation/init.js';
import { OPENSPEC_EXPECTED_VERSION } from '../src/core/spec/linter.js';
import { runCliCaptured } from './cli-capture.js';

const FAILING_REPORT: DoctorReport = {
  ok: false,
  checks: [
    { name: 'config', ok: true, message: 'loaded' },
    { name: 'managed-blocks', ok: false, message: 'PLANNER.md drifted' },
  ],
};

/** Installs a stub `openspec` binary so the default validator probe is hermetic. */
async function installFakeValidator(
  root: string,
  version: string = OPENSPEC_EXPECTED_VERSION,
): Promise<void> {
  const binDir = path.join(root, 'node_modules', '.bin');
  await fs.mkdir(binDir, { recursive: true });
  const script = `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(version)});\n`;
  await fs.writeFile(path.join(binDir, 'openspec'), script, { mode: 0o755 });
}

async function writeHealthyRepo(root: string): Promise<void> {
  await fs.mkdir(path.join(root, 'openspec', 'changes', 'archive'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'osq.config.ts'),
    "export default { harness: 'mock' };\n",
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

describe('doctor command errors', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-doctor-command-error-'));
    await writeHealthyRepo(root);
    await installFakeValidator(root);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('DoctorCommandOptions has no exit option', () => {
    // @ts-expect-error `exit` was removed from `DoctorCommandOptions`.
    const options: DoctorCommandOptions = { exit: () => {} };
    assert.ok(options);
  });

  it('returns the report when every check passes', async () => {
    const lines: string[] = [];
    const report = await doctorCommand({
      cwd: root,
      stdout: (line) => lines.push(line),
    });

    assert.equal(report.ok, true, JSON.stringify(report.checks));
    assert.equal(lines.length, report.checks.length);
    assert.ok(lines.some((line) => line.startsWith('[ok] config:')));
  });

  it('prints one line per check then rejects with an empty CommandError and leaves the exit code alone', async () => {
    const lines: string[] = [];
    const originalExitCode = process.exitCode;
    process.exitCode = undefined;
    try {
      await assert.rejects(
        doctorCommand({
          report: FAILING_REPORT,
          stdout: (line) => lines.push(line),
        }),
        (error: unknown) => {
          assert.ok(error instanceof CommandError, `expected a CommandError, got ${String(error)}`);
          assert.equal(error.name, 'CommandError');
          assert.equal(error.message, '');
          assert.equal(error.exitCode, 1);
          return true;
        },
      );
      assert.equal(process.exitCode, undefined, 'the command must not set process.exitCode');
    } finally {
      process.exitCode = originalExitCode;
    }

    assert.deepEqual(lines, ['[ok] config: loaded', '[fail] managed-blocks: PLANNER.md drifted']);
  });

  it('exits 0 through the CLI when every check passes', async () => {
    const capture = await runCliCaptured(root, ['doctor']);

    assert.equal(capture.exitCode ?? 0, 0, JSON.stringify(capture.lines));
    assert.ok(
      capture.lines.some(
        (line) => line.stream === 'stdout' && line.text.startsWith('[ok] config:'),
      ),
      JSON.stringify(capture.lines),
    );
  });

  it('prints the failing checks and exits 1 through the CLI', async () => {
    await fs.writeFile(path.join(root, 'PLANNER.md'), '# no markers\n', 'utf8');

    const capture = await runCliCaptured(root, ['doctor']);

    assert.equal(capture.exitCode, 1, JSON.stringify(capture.lines));
    assert.ok(
      capture.lines.some(
        (line) => line.stream === 'stdout' && line.text.startsWith('[fail] managed-blocks:'),
      ),
      JSON.stringify(capture.lines),
    );
  });
});
