import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { planCommand } from '../src/cli/plan.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { getChangesDir } from '../src/core/status/layout.js';
import { runCliCaptured } from './cli-capture.js';
import { createChange, createProject, restoreEnv } from './planning-observed-helpers.js';

/** Collect stdout while `run` executes, so planning noise stays out of the report. */
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

async function findChangeFolder(root: string, slug: string): Promise<string> {
  const changesDir = getChangesDir(DEFAULT_CONFIG.paths.openspecRoot, root);
  const entries = await fs.readdir(changesDir);
  const folder = entries.find((entry) => entry.includes(slug));
  assert.ok(folder, `change folder for ${slug} should exist`);
  return path.join(changesDir, folder);
}

describe('approve throws a CommandError carrying the next step', () => {
  let root = '';
  let brief = '';

  beforeEach(async () => {
    restoreEnv();
    root = await createProject();
    brief = path.join(root, 'next-step-brief.md');
    await fs.writeFile(brief, '# Next Step Feature\n\nDetails.\n', 'utf8');
    // Keep the default planning readers away from the real home directory.
    process.env.CODEX_HOME = path.join(root, 'missing-codex');
    process.env.OSQ_CLAUDE_PROJECTS_DIR = path.join(root, 'missing-claude');
    process.env.CLAUDE_CONFIG_DIR = path.join(root, 'missing-claude-config');
    process.env.OPENCODE_PATH = path.join(root, 'missing-opencode');
  });

  afterEach(async () => {
    restoreEnv();
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  /** Plan a brief-holding template change and return its numeric id. */
  async function planTemplate(slug: string): Promise<string> {
    await captureStdout(() => planCommand(slug, { brief, cwd: root }));
    const folder = await findChangeFolder(root, slug);
    const id = path.basename(folder).match(/^(\d+)/)?.[1];
    assert.ok(id, 'template change carries a numeric id');
    return id;
  }

  it('approving a template fails and prints the template next step', async () => {
    const id = await planTemplate('template-approval');
    const capture = await runCliCaptured(root, ['approve', id]);

    assert.equal(capture.exitCode, 1);
    const errorLine = capture.lines.find(
      (line) => line.stream === 'stderr' && line.text.startsWith(`Error approving ${id}:`),
    );
    assert.ok(
      errorLine,
      `expected an Error approving ${id} line, got:\n${JSON.stringify(capture.lines)}`,
    );
    const last = capture.lines.at(-1);
    assert.equal(last?.stream, 'stdout');
    assert.equal(last?.text, `Next: unplanned \u2014 osq plan ${id}`);
  });

  it('prints the error before the next step', async () => {
    const id = await planTemplate('ordering-approval');
    const capture = await runCliCaptured(root, ['approve', id]);

    const errorIndex = capture.lines.findIndex(
      (line) => line.stream === 'stderr' && line.text.startsWith(`Error approving ${id}:`),
    );
    const nextIndex = capture.lines.findIndex(
      (line) => line.stream === 'stdout' && line.text === `Next: unplanned \u2014 osq plan ${id}`,
    );
    assert.ok(
      nextIndex > errorIndex,
      `error must precede the next step:\n${JSON.stringify(capture.lines)}`,
    );
  });

  it('prints one stderr line and no next step for a missing change', async () => {
    const capture = await runCliCaptured(root, ['approve', '999']);

    assert.equal(capture.exitCode, 1);
    assert.equal(
      capture.lines.filter((line) => line.stream === 'stderr').length,
      1,
      JSON.stringify(capture.lines),
    );
    assert.ok(capture.lines[0]?.text.startsWith('Error approving 999:'));
    assert.equal(
      capture.lines.some((line) => line.text.startsWith('Next:')),
      false,
      JSON.stringify(capture.lines),
    );
  });

  it('several ids stop at the first failure', async () => {
    const change = await createChange(root, 'Second Change');

    const first = await runCliCaptured(root, ['approve', '999', change.specId]);
    assert.equal(first.exitCode, 1);
    await assert.rejects(fs.stat(path.join(change.folderPath, '.run', 'approved')));

    const second = await runCliCaptured(root, ['approve', change.specId]);
    assert.equal(second.exitCode ?? 0, 0, JSON.stringify(second.lines));
    assert.ok(await fs.stat(path.join(change.folderPath, '.run', 'approved')));
  });

  it('a terminal refusal is not wrapped in an approval error', async () => {
    const change = await createChange(root, 'Flagged Change');
    const capture = await runCliCaptured(root, ['approve', change.specId, '--confirm']);

    assert.equal(capture.exitCode, 1);
    const stderrLines = capture.lines.filter((line) => line.stream === 'stderr');
    assert.equal(stderrLines.length, 1, JSON.stringify(capture.lines));
    assert.ok(
      stderrLines[0]?.text.startsWith(`Refusing to approve ${change.specId} without a terminal:`),
      JSON.stringify(capture.lines),
    );
    assert.equal(
      capture.lines.some((line) => line.text.startsWith('Error approving')),
      false,
      JSON.stringify(capture.lines),
    );
  });
});
