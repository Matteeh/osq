import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scaffoldProject } from '../src/core/foundation/init.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const EXECUTOR_LINE =
  'Paths that `ungoverned` in `osq.config.ts` lists, by default README, `docs/`, license, `.gitignore` and env files, belong to no capability. A human edits them directly on the default branch with no change.';

const PLANNER_LINE =
  'Never write a requirement, scenario or test that pins an ungoverned file, one that `ungoverned` in `osq.config.ts` lists: by default README, `docs/`, license, `.gitignore` and env files. A human edits those directly on the default branch with no change, and a task may edit one in its scope without a delta.';

/** Collapse every run of whitespace so a wrapped line still matches its text. */
function collapse(text: string): string {
  return text.replace(/\s+/g, ' ');
}

describe('osq init ungoverned block lines', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-ungoverned-blocks-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('scaffolds a PLANNER.md that names ungoverned paths', async () => {
    await scaffoldProject(tmpDir);

    const content = await fs.readFile(path.join(tmpDir, 'PLANNER.md'), 'utf8');
    assert.ok(
      collapse(content).includes(PLANNER_LINE),
      'PLANNER.md should tell planners never to pin an ungoverned file',
    );
  });

  it('scaffolds an AGENTS.md that names ungoverned paths', async () => {
    await scaffoldProject(tmpDir);

    const content = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf8');
    assert.ok(
      collapse(content).includes(EXECUTOR_LINE),
      'AGENTS.md should say ungoverned paths belong to no capability',
    );
  });
});

describe('repository ungoverned block lines', () => {
  it('AGENTS.md carries the executor line', async () => {
    const content = await fs.readFile(path.join(repoRoot, 'AGENTS.md'), 'utf8');
    assert.ok(collapse(content).includes(EXECUTOR_LINE));
  });

  it('.opencode/agent/osq-coder.md carries the executor line', async () => {
    const content = await fs.readFile(
      path.join(repoRoot, '.opencode', 'agent', 'osq-coder.md'),
      'utf8',
    );
    assert.ok(collapse(content).includes(EXECUTOR_LINE));
  });

  it('PLANNER.md carries the planner line', async () => {
    const content = await fs.readFile(path.join(repoRoot, 'PLANNER.md'), 'utf8');
    assert.ok(collapse(content).includes(PLANNER_LINE));
  });

  it('templates/PLANNER.md carries the planner line', async () => {
    const content = await fs.readFile(path.join(repoRoot, 'templates', 'PLANNER.md'), 'utf8');
    assert.ok(collapse(content).includes(PLANNER_LINE));
  });
});
