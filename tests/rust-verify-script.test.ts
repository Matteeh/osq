import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Answers `--version` with `CARGO_VERSION_TEXT` without recording it, records
 * each other cargo invocation and answers the mutants status it is given.
 */
const CARGO_STUB = `#!/bin/sh
if [ "\${1:-}" = "--version" ]; then
  printf '%s\\n' "\${CARGO_VERSION_TEXT}"
  exit 0
fi
printf '%s\\n' "$*" >> "$CARGO_LOG_FILE"
if [ "\${1:-}" = "mutants" ]; then
  exit "\${CARGO_MUTANTS_STATUS:-0}"
fi
exit 0
`;

const FORMAT_COMMAND = 'fmt --all --check';
const CLIPPY_COMMAND = 'clippy --workspace --all-targets -- -D warnings';
const TEST_COMMAND = 'test --workspace -- --include-ignored';
const SKIP_LINE = 'mutation check not run: OSQ_DIFF is not set';
const PINNED_VERSION = 'cargo 1.99.1 (stub)';

interface RunResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** A temporary folder holding the recording cargo stub, its log and a diff. */
interface Stub {
  readonly log: string;
  readonly diff: string;
  readonly env: NodeJS.ProcessEnv;
}

/** Run `sh scripts/verify-rust.sh` from the repository root with `env`. */
function runVerify(env: NodeJS.ProcessEnv): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['scripts/verify-rust.sh'], { cwd: repoRoot, env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/** Build a stub tree, run `fn` with it, then remove the tree. */
async function withStub<T>(status: number, fn: (stub: Stub) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-verify-rust-'));
  try {
    const cargo = path.join(dir, 'cargo');
    await fs.writeFile(cargo, CARGO_STUB);
    await fs.chmod(cargo, 0o755);

    const log = path.join(dir, 'cargo.log');
    await fs.writeFile(log, '');

    const diff = path.join(dir, 'change.diff');
    await fs.writeFile(diff, 'diff --git a/crates/core/src/lib.rs b/crates/core/src/lib.rs\n');

    const env: NodeJS.ProcessEnv = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key !== 'OSQ_DIFF'),
    );
    env.PATH = `${dir}${path.delimiter}${env.PATH ?? ''}`;
    env.CARGO_LOG_FILE = log;
    env.CARGO_MUTANTS_STATUS = String(status);
    env.CARGO_VERSION_TEXT = PINNED_VERSION;

    return await fn({ log, diff, env });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** The cargo invocations the stub recorded, in order. */
async function recordedCommands(log: string): Promise<readonly string[]> {
  const text = await fs.readFile(log, 'utf8');
  return text.split('\n').filter((line) => line.length > 0);
}

describe('rust-core: Verify script steps', () => {
  const rows = [
    { name: 'a diff file and mutants status 0', diff: 'set', status: 0, exit: 0, mutates: true },
    { name: 'a diff file and mutants status 2', diff: 'set', status: 2, exit: 2, mutates: true },
    { name: 'an unset OSQ_DIFF', diff: 'unset', status: 0, exit: 0, mutates: false },
    { name: 'an empty OSQ_DIFF', diff: 'empty', status: 0, exit: 0, mutates: false },
  ] as const;

  for (const row of rows) {
    it(`runs the cargo commands in order for ${row.name}`, async () => {
      await withStub(row.status, async (stub) => {
        if (row.diff === 'set') stub.env.OSQ_DIFF = stub.diff;
        if (row.diff === 'empty') stub.env.OSQ_DIFF = '';

        const result = await runVerify(stub.env);
        assert.equal(result.code, row.exit, `exit code for ${row.name}`);

        const commands = await recordedCommands(stub.log);
        assert.equal(commands[0], FORMAT_COMMAND, 'the format check runs first');
        assert.equal(commands[1], CLIPPY_COMMAND, 'clippy runs second');
        assert.equal(commands[2], TEST_COMMAND, 'the workspace tests run third');

        if (row.mutates) {
          assert.equal(commands.length, 4, 'the mutation check runs after the tests');
          const mutants = commands[3] ?? '';
          assert.match(mutants, /^mutants /, `the fourth call is cargo mutants: ${mutants}`);
          assert.ok(
            mutants.includes(`--in-diff ${stub.diff}`),
            `the mutants call names the diff: ${mutants}`,
          );
        } else {
          assert.equal(commands.length, 3, 'no mutation check runs without a diff');
        }
      });
    });
  }
});

describe('rust-core: Verify script names the missing diff', () => {
  it('prints the skip line and exits 0 without OSQ_DIFF', async () => {
    await withStub(0, async (stub) => {
      const result = await runVerify(stub.env);
      assert.equal(result.code, 0);
      assert.ok(result.stdout.includes(SKIP_LINE), `output must hold "${SKIP_LINE}"`);
    });
  });
});

describe('rust-core: Verify script refuses another toolchain', () => {
  const rows = [
    {
      name: 'the pinned version',
      version: PINNED_VERSION,
      exit: 0,
      output: SKIP_LINE,
      commands: [FORMAT_COMMAND, CLIPPY_COMMAND, TEST_COMMAND],
    },
    {
      name: 'one patch behind',
      version: 'cargo 1.99.0 (stub)',
      exit: 1,
      output:
        "cargo 1.99.0 is on PATH, but rust-toolchain.toml pins 1.99.1; put rustup's cargo proxy first on PATH",
      commands: [],
    },
    {
      name: 'an older minor',
      version: 'cargo 1.97.0 (stub)',
      exit: 1,
      output:
        "cargo 1.97.0 is on PATH, but rust-toolchain.toml pins 1.99.1; put rustup's cargo proxy first on PATH",
      commands: [],
    },
  ] as const;

  for (const row of rows) {
    it(`handles cargo --version printing ${row.name}`, async () => {
      await withStub(0, async (stub) => {
        stub.env.CARGO_VERSION_TEXT = row.version;

        const result = await runVerify(stub.env);
        assert.equal(result.code, row.exit, `exit code for ${row.name}`);

        const output = `${result.stdout}${result.stderr}`;
        assert.ok(output.includes(row.output), `output must hold "${row.output}"`);

        const commands = await recordedCommands(stub.log);
        assert.deepEqual(commands, row.commands, `cargo commands for ${row.name}`);
      });
    });
  }
});
