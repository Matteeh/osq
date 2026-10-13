import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scaffoldProject } from '../src/core/foundation/init.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const PLANNER_LINE =
  'Words a project bans from its code are listed in `bannedWords` in `osq.config.ts`, each with the paths it covers. Never plan a name, message or comment that puts one there; `osq lint` warns when a task file or delta spec holds one in code.';

/** Collapse every run of whitespace so a wrapped line still matches its text. */
function collapse(text: string): string {
  return text.replace(/\s+/g, ' ');
}

describe('osq init banned words block line', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-banned-words-blocks-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('Fresh init names banned words', async () => {
    await scaffoldProject(tmpDir);

    const content = await fs.readFile(path.join(tmpDir, 'PLANNER.md'), 'utf8');
    const collapsed = collapse(content);
    assert.ok(collapsed.includes('`bannedWords`'), 'PLANNER.md should name `bannedWords`');
    assert.ok(
      collapsed.includes('`osq lint` warns'),
      'PLANNER.md should say `osq lint` warns about a banned word',
    );
    assert.ok(
      collapsed.includes(PLANNER_LINE),
      'PLANNER.md should tell planners where banned words are listed',
    );
  });
});

describe('repository banned words block line', () => {
  it('PLANNER.md carries the banned words line', async () => {
    const content = await fs.readFile(path.join(repoRoot, 'PLANNER.md'), 'utf8');
    assert.ok(collapse(content).includes(PLANNER_LINE));
  });

  it('templates/PLANNER.md carries the banned words line', async () => {
    const content = await fs.readFile(path.join(repoRoot, 'templates', 'PLANNER.md'), 'utf8');
    assert.ok(collapse(content).includes(PLANNER_LINE));
  });
});
