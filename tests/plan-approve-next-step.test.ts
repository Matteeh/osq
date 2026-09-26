import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveCommand } from '../src/cli/approve.js';
import { planCommand } from '../src/cli/plan.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { getChangesDir } from '../src/core/status/layout.js';
import { installFakeValidator } from './helpers.js';

async function captureStdout(run: () => Promise<void>): Promise<string> {
  let output = '';
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Buffer) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    await run();
  } finally {
    process.stdout.write = original;
  }
  return output;
}

/** Captures logs and stubs `process.exit` so the refusal stays testable. */
async function captureExitAndLogs(
  run: () => Promise<void>,
): Promise<{ lines: string[]; exitCode: number | undefined }> {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalExit = process.exit;
  let exitCode: number | undefined;

  const push = (...args: unknown[]): void => {
    lines.push(args.map(String).join(' '));
  };
  console.log = push;
  console.warn = push;
  console.error = push;
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`PROCESS_EXIT_${exitCode}`);
  }) as unknown as typeof process.exit;

  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!message.startsWith('PROCESS_EXIT_')) throw error;
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    process.exit = originalExit;
  }

  return { lines, exitCode };
}

async function findChangeFolder(root: string, slug: string): Promise<string> {
  const changesDir = getChangesDir(DEFAULT_CONFIG.paths.openspecRoot, root);
  const entries = await fs.readdir(changesDir);
  const folder = entries.find((entry) => entry.includes(slug));
  assert.ok(folder, `change folder for ${slug} should exist`);
  return path.join(changesDir, folder);
}

describe('osq plan and approve next step', () => {
  let tmpDir: string;
  let briefFixture: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-approve-next-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);

    briefFixture = path.join(tmpDir, 'next-step-brief.md');
    await fs.writeFile(briefFixture, '# Next Step Feature\n\nDetails.\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('ends the fresh handoff line with the change next step', async () => {
    const stdout = await captureStdout(() =>
      planCommand('fresh-next-step', { brief: briefFixture, cwd: tmpDir }),
    );

    const folder = await findChangeFolder(tmpDir, 'fresh-next-step');
    const id = path.basename(folder).match(/^(\d+)/)?.[1];
    assert.ok(id, 'change folder carries a numeric id');

    const lines = stdout.trim().split('\n');
    assert.equal(lines.length, 1, 'handoff stays exactly one line');
    assert.ok(lines[0].includes(folder), 'handoff names the folder path');
    assert.ok(
      lines[0].endsWith(` \u2014 next: unplanned \u2014 osq plan ${id}`),
      `handoff should end with the next step, got: ${lines[0]}`,
    );
  });

  it('prints the template next step after the approval error', async () => {
    await captureStdout(() =>
      planCommand('template-refusal', { brief: briefFixture, cwd: tmpDir }),
    );
    const folder = await findChangeFolder(tmpDir, 'template-refusal');
    const id = path.basename(folder).match(/^(\d+)/)?.[1];
    assert.ok(id, 'change folder carries a numeric id');

    const { lines, exitCode } = await captureExitAndLogs(() =>
      approveCommand([id], {
        cwd: tmpDir,
        config: DEFAULT_CONFIG,
        planningReaders: [],
        now: new Date(),
      }),
    );

    assert.equal(exitCode, 1, 'a placeholder verify refuses approval');
    assert.ok(
      lines.includes(`Next: unplanned \u2014 osq plan ${id}`),
      `refusal should print the next step, got:\n${lines.join('\n')}`,
    );
  });

  it('prints no next step when the change folder does not exist', async () => {
    const { lines, exitCode } = await captureExitAndLogs(() =>
      approveCommand(['999'], {
        cwd: tmpDir,
        config: DEFAULT_CONFIG,
        planningReaders: [],
        now: new Date(),
      }),
    );

    assert.equal(exitCode, 1);
    assert.equal(
      lines.some((line) => line.startsWith('Next:')),
      false,
      `a missing change prints nothing more, got:\n${lines.join('\n')}`,
    );
  });
});
