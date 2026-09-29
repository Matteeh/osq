import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { archiveSpecFolder } from '../src/watcher/archiver.js';
import { runCliCaptured } from './cli-capture.js';

const FAIL_CHECK_SCRIPT = 'process.exit(3);\n';

function proposalMd(options: { check?: string; humanSteps?: string }): string {
  const lines = ['---', 'title: Change', 'verify: node verify.cjs'];
  if (options.check !== undefined) lines.push(`check: ${options.check}`);
  lines.push(
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
  );
  if (options.humanSteps !== undefined) {
    lines.push('## Human steps', options.humanSteps);
  }
  return `${lines.join('\n')}\n`;
}

async function archiveChange(
  root: string,
  folderName: string,
  options: { check?: string; humanSteps?: string } = {},
): Promise<string> {
  const dir = path.join(root, 'openspec', 'changes', folderName);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(dir, 'proposal.md'), proposalMd(options), 'utf8');
  await fs.writeFile(path.join(dir, 'tasks', '1.md'), '# Task\n', 'utf8');
  return archiveSpecFolder(root, dir, DEFAULT_CONFIG);
}

describe('command errors for check and verified', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-command-error-verification-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('keeps the failed check on stdout and leaves stderr empty', async () => {
    await fs.writeFile(path.join(tmpDir, 'check.cjs'), FAIL_CHECK_SCRIPT, 'utf8');
    await archiveChange(tmpDir, '001-fail', {
      check: 'node check.cjs',
      humanSteps: '### After landing\nA step',
    });

    const capture = await runCliCaptured(tmpDir, ['check', '001']);

    assert.equal(capture.exitCode, 1);
    assert.equal(
      capture.lines.filter((line) => line.stream === 'stderr').length,
      0,
      `stderr should be empty, got:\n${JSON.stringify(capture.lines)}`,
    );
    assert.ok(
      capture.lines.some((line) => line.stream === 'stdout' && line.text.includes('Exit code: 3')),
      capture.lines.map((line) => line.text).join('\n'),
    );
    assert.ok(
      capture.lines.some((line) => line.stream === 'stdout' && line.text.startsWith('Next:')),
      capture.lines.map((line) => line.text).join('\n'),
    );
  });

  it('prints one stderr line for a missing check target', async () => {
    const capture = await runCliCaptured(tmpDir, ['check', '999']);

    assert.equal(capture.exitCode, 1);
    assert.deepEqual(capture.lines, [
      {
        stream: 'stderr',
        text: 'Error running check for 999:\n  Spec "999" not found in specs or archive',
      },
    ]);
  });

  it('prints one stderr line when verified has no outcome flag', async () => {
    const capture = await runCliCaptured(tmpDir, ['verified', '999']);

    assert.equal(capture.exitCode, 1);
    assert.deepEqual(capture.lines, [
      { stream: 'stderr', text: 'Error: specify exactly one of --passed or --failed.' },
    ]);
  });

  it('prints one stderr line for a missing verification target', async () => {
    const capture = await runCliCaptured(tmpDir, ['verified', '999', '--passed']);

    assert.equal(capture.exitCode, 1);
    assert.deepEqual(capture.lines, [
      {
        stream: 'stderr',
        text: 'Error recording verification for 999:\n  Spec "999" not found in specs or archive',
      },
    ]);
  });
});
