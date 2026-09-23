import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveCommand } from '../src/cli/approve.js';
import { createProgram } from '../src/cli/index.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import {
  createChange,
  createProject,
  readManifest,
  restoreEnv,
} from './planning-observed-helpers.js';

const APPROVAL_FLAGS = {
  ids: ['verify_without_test'],
  mode: 'shown',
};
const FLAG_SUMMARY =
  '2 flags: verify without a test in task 1, verify without a test in the proposal';

/**
 * Replaces the task and proposal verifies with one that names a test runner so
 * the change trips no flag, and creates the named test file.
 */
async function useRunnerVerify(root: string, folderPath: string): Promise<void> {
  await fs.mkdir(path.join(root, 'tests'), { recursive: true });
  await fs.writeFile(path.join(root, 'tests', 'sample.test.ts'), '// fixture test\n', 'utf8');
  const verify = 'node --import tsx --test tests/sample.test.ts';
  for (const relative of ['proposal.md', path.join('tasks', '1.md')]) {
    const target = path.join(folderPath, relative);
    const content = await fs.readFile(target, 'utf8');
    await fs.writeFile(target, content.replace(/^verify:.*$/m, `verify: ${verify}`), 'utf8');
  }
}

/** Captures logs and stubs `process.exit` so refusal and decline stay testable. */
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

describe('osq approve confirmation', () => {
  let root = '';

  beforeEach(() => {
    restoreEnv();
  });
  afterEach(async () => {
    restoreEnv();
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  it('registers --confirm on osq approve', () => {
    const program = createProgram();
    const approve = program.commands.find((command) => command.name() === 'approve');
    assert.ok(approve);
    assert.ok(approve.options.some((option) => option.long === '--confirm'));
  });

  it('approves a flagged change by default and records mode shown', async () => {
    root = await createProject();
    const change = await createChange(root, 'Flagged Change');

    const { lines, exitCode } = await captureExitAndLogs(() =>
      approveCommand([change.specId], {
        cwd: root,
        config: DEFAULT_CONFIG,
        planningReaders: [],
        now: new Date(),
      }),
    );

    assert.equal(exitCode, undefined);
    const folderName = path.basename(change.folderPath);
    assert.ok(
      lines.includes(`Approved ${change.specId} (${folderName}) with ${FLAG_SUMMARY}`),
      `approval line should carry the flag summary, got:\n${lines.join('\n')}`,
    );
    assert.ok(lines.includes('Flag: verify without a test in task 1 \u2014 node verify.cjs'));
    assert.ok(lines.includes('Flag: verify without a test in the proposal \u2014 node verify.cjs'));
    const digestIndex = lines.findIndex((line) => line.startsWith('Change: '));
    const approvedIndex = lines.findIndex((line) => line.startsWith('Approved '));
    assert.ok(digestIndex >= 0, 'the digest should print');
    assert.ok(approvedIndex > digestIndex, 'the approval line should follow the digest');

    const manifest = await readManifest(change.folderPath);
    assert.deepEqual(manifest.approvalFlags, APPROVAL_FLAGS);
  });

  it('records mode confirmed when the prompt is answered y', async () => {
    root = await createProject();
    const change = await createChange(root, 'Confirmed Change');
    let asked: string | null = null;

    const { exitCode } = await captureExitAndLogs(() =>
      approveCommand([change.specId], {
        cwd: root,
        config: DEFAULT_CONFIG,
        planningReaders: [],
        now: new Date(),
        confirm: true,
        isTerminal: () => true,
        ask: async (question) => {
          asked = question;
          return 'y';
        },
      }),
    );

    assert.equal(exitCode, undefined);
    assert.equal(asked, `Approve ${change.specId} with 2 flag(s)? [y/N]`);
    const manifest = await readManifest(change.folderPath);
    assert.deepEqual(manifest.approvalFlags, { ids: ['verify_without_test'], mode: 'confirmed' });
  });

  it('declines an empty answer and writes nothing', async () => {
    root = await createProject();
    const change = await createChange(root, 'Declined Change');

    const { exitCode } = await captureExitAndLogs(() =>
      approveCommand([change.specId], {
        cwd: root,
        config: DEFAULT_CONFIG,
        planningReaders: [],
        now: new Date(),
        confirm: true,
        isTerminal: () => true,
        ask: async () => '',
      }),
    );

    assert.equal(exitCode, 1);
    await assert.rejects(fs.stat(path.join(change.folderPath, '.run', 'approved')));
    await assert.rejects(fs.stat(path.join(change.folderPath, '.run', 'manifest.json')));
    await assert.rejects(fs.stat(path.join(change.folderPath, '.run', 'plan.jsonl')));
  });

  it('refuses without a terminal and writes nothing', async () => {
    root = await createProject();
    const change = await createChange(root, 'No Terminal Change');
    let asked = false;

    const { lines, exitCode } = await captureExitAndLogs(() =>
      approveCommand([change.specId], {
        cwd: root,
        config: DEFAULT_CONFIG,
        planningReaders: [],
        now: new Date(),
        confirm: true,
        isTerminal: () => false,
        ask: async () => {
          asked = true;
          return 'y';
        },
      }),
    );

    assert.equal(exitCode, 1);
    assert.equal(asked, false, 'a refusal must never prompt');
    assert.ok(
      lines.includes(`Refusing to approve ${change.specId} without a terminal: ${FLAG_SUMMARY}`),
      `refusal should name the flags, got:\n${lines.join('\n')}`,
    );
    await assert.rejects(fs.stat(path.join(change.folderPath, '.run', 'approved')));
    await assert.rejects(fs.stat(path.join(change.folderPath, '.run', 'manifest.json')));
  });

  it('never asks when --confirm fires no flags', async () => {
    root = await createProject();
    const change = await createChange(root, 'Clean Change');
    await useRunnerVerify(root, change.folderPath);
    let asked = false;

    const { lines, exitCode } = await captureExitAndLogs(() =>
      approveCommand([change.specId], {
        cwd: root,
        config: DEFAULT_CONFIG,
        planningReaders: [],
        now: new Date(),
        confirm: true,
        isTerminal: () => true,
        ask: async () => {
          asked = true;
          return 'y';
        },
      }),
    );

    assert.equal(exitCode, undefined);
    assert.equal(asked, false);
    const folderName = path.basename(change.folderPath);
    assert.ok(lines.includes(`Approved ${change.specId} (${folderName})`));
    assert.equal(
      lines.some((line) => line.startsWith('Flag:')),
      false,
      'a clean change should print no flag lines',
    );
    const manifest = await readManifest(change.folderPath);
    assert.deepEqual(manifest.approvalFlags, { ids: [], mode: 'shown' });
  });
});
