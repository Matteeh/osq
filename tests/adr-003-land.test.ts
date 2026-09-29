import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adrPath = path.join(repoRoot, 'decisions', '003-git-strategy.md');

/** The text of decision `n`, from its `### n.` heading to the next decision. */
function decision(text: string, n: number): string {
  const start = text.indexOf(`### ${n}.`);
  assert.ok(start >= 0, `decision ${n} must exist`);
  const next = text.indexOf(`### ${n + 1}.`, start + 1);
  assert.ok(next > start, `decision ${n} must end before decision ${n + 1}`);
  return text.slice(start, next);
}

describe('ADR 003 land decisions', () => {
  it('decision 7 builds the land commit from the tip and moves it without a squash', async () => {
    const seven = decision(await fs.readFile(adrPath, 'utf8'), 7);

    assert.ok(seven.includes('git commit-tree'), 'decision 7 must name git commit-tree');
    assert.ok(seven.includes('--ff-only'), 'decision 7 must name --ff-only');
    assert.ok(
      !seven.includes('git merge --squash osq/'),
      'decision 7 must not describe landing by a squash',
    );
  });

  it('decision 8 states the land commit runs no hooks and signs when git is set to', async () => {
    const eight = decision(await fs.readFile(adrPath, 'utf8'), 8);

    assert.ok(
      eight.includes('The land commit runs no commit hooks.'),
      'decision 8 must state the land commit runs no commit hooks',
    );
    assert.ok(eight.includes('-S'), 'decision 8 must name the signing flag -S');
  });
});
