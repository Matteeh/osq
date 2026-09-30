import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { createProgram } from '../src/cli/index.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';

interface CliLine {
  readonly stream: 'stdout' | 'stderr';
  readonly text: string;
}

interface CliRun {
  readonly exitCode: number | undefined;
  readonly lines: readonly CliLine[];
}

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

/**
 * Run `createProgram` in `cwd`, capturing every line each console method writes
 * and stubbing `process.exit` so an unknown command is observed as an exit code
 * instead of ending the test process.
 */
async function runProgram(cwd: string, argv: readonly string[]): Promise<CliRun> {
  const previousCwd = process.cwd();
  const previousExitCode = process.exitCode;
  const previousLog = console.log;
  const previousError = console.error;
  const previousWarn = console.warn;
  const previousExit = process.exit;
  const lines: CliLine[] = [];
  let exitCode: number | undefined;

  const push = (stream: 'stdout' | 'stderr') => {
    return (...args: unknown[]): void => {
      lines.push({ stream, text: args.map(String).join(' ') });
    };
  };
  console.log = push('stdout');
  console.error = push('stderr');
  console.warn = push('stderr');
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error('process.exit called');
  }) as unknown as typeof process.exit;

  try {
    process.chdir(cwd);
    process.exitCode = undefined;
    await createProgram('test').parseAsync(['node', 'osq', ...argv]);
    exitCode = process.exitCode;
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'process.exit called') throw error;
  } finally {
    process.chdir(previousCwd);
    process.exitCode = previousExitCode;
    console.log = previousLog;
    console.error = previousError;
    console.warn = previousWarn;
    process.exit = previousExit;
  }

  return { exitCode, lines };
}

describe('osq done removed', () => {
  it('registers no command named done', () => {
    const program = createProgram();
    assert.equal(
      program.commands.find((command) => command.name() === 'done'),
      undefined,
    );
  });

  it('fails an unknown done invocation and writes no marker', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-done-removed-'));
    tmpDirs.push(root);
    await scaffoldProject(root);
    const spec = await createNewSpec(root, 'Order Flow');

    const result = await runProgram(root, ['done', '001', '1', '--manual', 'x']);

    assert.notEqual(result.exitCode, 0);
    assert.equal(await exists(path.join(spec.folderPath, '.run', 'done', '1')), false);
  });
});
