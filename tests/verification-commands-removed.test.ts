import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createProgram } from '../src/cli/index.js';
import { runCli } from '../src/cli/run.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { archiveSpecFolder } from '../src/watcher/archiver.js';
import { runCliCaptured } from './cli-capture.js';

interface CliLine {
  readonly stream: 'stdout' | 'stderr';
  readonly text: string;
}

interface ExitCapture {
  readonly exitCode: number | undefined;
  readonly lines: readonly CliLine[];
}

/**
 * Run `runCli` in `cwd`, capturing every line each console method writes and
 * the code passed to `process.exit`, which is stubbed to throw so a command
 * that ends the process is observed as an exit code instead.
 */
async function runCliExit(cwd: string, argv: readonly string[]): Promise<ExitCapture> {
  const originalCwd = process.cwd();
  const originalExitCode = process.exitCode;
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalExit = process.exit;
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
    await runCli(['node', 'osq', ...argv]);
    exitCode = process.exitCode;
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'process.exit called') throw error;
    exitCode = exitCode ?? (typeof process.exitCode === 'number' ? process.exitCode : undefined);
  } finally {
    process.chdir(originalCwd);
    process.exitCode = originalExitCode;
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    process.exit = originalExit;
  }

  return { exitCode, lines };
}

function proposalMd(): string {
  return [
    '---',
    'title: Removed verification command',
    'verify: node verify.cjs',
    '---',
    '## Goal',
    'A goal.',
    '## Contract',
    '| Input | Expected Output |',
    '|---|---|',
    '| a | b |',
    '## Non-goals',
    'None.',
    '## Surface',
    'None.',
    '## Delta',
    'None.',
  ].join('\n');
}

async function archiveChange(root: string): Promise<string> {
  const dir = path.join(root, 'openspec', 'changes', '012-removed');
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(), 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), '# Task\n', 'utf8');
  return archiveSpecFolder(root, dir, DEFAULT_CONFIG);
}

describe('removed verification commands', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-verification-commands-removed-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('registers no check and no verified command', () => {
    const program = createProgram('test');
    const names = program.commands.map((command) => command.name());

    assert.equal(names.includes('check'), false);
    assert.equal(names.includes('verified'), false);
  });

  it('fails a removed command and appends nothing to the archived change', async () => {
    const archived = await archiveChange(tmpDir);
    const eventsPath = path.join(archived, '.run', 'events', 'change.jsonl');
    const before = await fs.readFile(eventsPath, 'utf8');

    for (const argv of [
      ['verified', '012', '--passed'],
      ['check', '012'],
    ]) {
      const result = await runCliExit(tmpDir, argv);

      assert.notEqual(result.exitCode, 0, `${argv.join(' ')} should exit non-zero`);
      assert.equal(
        await fs.readFile(eventsPath, 'utf8'),
        before,
        `${argv.join(' ')} should append nothing`,
      );
    }
  });

  it('prints the show refusal on stderr and never exits', async () => {
    await scaffoldProject(tmpDir);

    const capture = await runCliCaptured(tmpDir, ['show', '999']);

    assert.equal(capture.exitCode, 1);
    assert.deepEqual(capture.lines, [
      {
        stream: 'stderr',
        text: 'Show error: Spec "999" not found in specs or archive',
      },
    ]);
  });
});
