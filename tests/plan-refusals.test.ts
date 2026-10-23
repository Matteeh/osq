import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { planCommand } from '../src/cli/plan.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

/** The folders directly under `changesDir`, sorted. */
async function changeFolders(changesDir: string): Promise<string[]> {
  const entries = await fs.readdir(changesDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** A scaffolded project with VCS off, rooted in a temp directory. */
async function newProject(): Promise<{ root: string; config: OsqConfig }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-plan-refusals-'));
  tmpDirs.push(root);
  await scaffoldProject(root);
  return { root, config: defineConfig({ vcs: { enabled: false } }) };
}

/** Run `run`, prove it fails the check, and prove the changes directory is unchanged. */
async function assertRefused(
  root: string,
  run: () => Promise<void>,
  check: (error: unknown) => boolean,
): Promise<void> {
  const changesDir = path.join(root, 'openspec', 'changes');
  const before = await changeFolders(changesDir);
  await assert.rejects(run, check);
  assert.deepEqual(await changeFolders(changesDir), before);
}

describe('cli-foundation: Plan refuses before writing', () => {
  it('a missing --brief file fails with ENOENT and leaves no folder', async () => {
    const { root, config } = await newProject();
    await assertRefused(
      root,
      () =>
        planCommand('order-flow', {
          cwd: root,
          config,
          brief: path.join(root, 'missing-brief.md'),
        }),
      (error: unknown) =>
        error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT',
    );
  });

  it('no --brief and no editor fails with the brief message and leaves no folder', async () => {
    const { root, config } = await newProject();
    const savedVisual = process.env.VISUAL;
    const savedEditor = process.env.EDITOR;
    try {
      Reflect.deleteProperty(process.env, 'VISUAL');
      Reflect.deleteProperty(process.env, 'EDITOR');
      await assertRefused(
        root,
        () => planCommand('order-flow', { cwd: root, config }),
        (error: unknown) =>
          error instanceof Error &&
          error.message === 'No brief provided. Specify --brief <file> or set $EDITOR.',
      );
    } finally {
      if (savedVisual === undefined) Reflect.deleteProperty(process.env, 'VISUAL');
      else process.env.VISUAL = savedVisual;
      if (savedEditor === undefined) Reflect.deleteProperty(process.env, 'EDITOR');
      else process.env.EDITOR = savedEditor;
    }
  });

  it('a number that names no change fails with the refusal message and leaves no folder', async () => {
    const { root, config } = await newProject();
    const brief = path.join(root, 'brief.md');
    await fs.writeFile(brief, '# Brief\n\nOrder flows.\n', 'utf8');
    await assertRefused(
      root,
      () => planCommand('307', { cwd: root, config, brief }),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          'osq plan 307 names no change, and a number is not a name for a new change. Plan the next queue item with osq plan --next, or start a change with osq plan <name> --brief <file> and a descriptive name.',
    );
  });
});
