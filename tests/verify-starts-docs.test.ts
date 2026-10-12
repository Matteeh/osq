import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MANAGED_PLANNER_BLOCK } from '../src/core/foundation/init-blocks.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readFile(relative: string): Promise<string> {
  return fs.readFile(path.join(REPO_ROOT, relative), 'utf8');
}

describe('verify starts documentation', () => {
  it('managed planner block states the red rule, the shared verify, and the honest any rule', () => {
    const block = MANAGED_PLANNER_BLOCK.replace(/\s+/g, ' ');

    assert.doesNotMatch(block, /use `any` when either start is fine/);
    assert.match(block, /verify_starts: red/, 'the block must state the red rule');
    assert.match(
      block,
      /names a test the task creates/i,
      'the red rule must name a test the task creates',
    );
    assert.match(block, /new test file may share/i, 'the block must allow a shared verify');
    assert.match(
      block,
      /`any` is only for a task that can honestly start either way/,
      'the block must limit any to honest either-way starts',
    );
  });

  it('PLANNER.md and templates/PLANNER.md carry the same planner guidance', async () => {
    for (const relative of ['PLANNER.md', 'templates/PLANNER.md']) {
      const text = (await readFile(relative)).replace(/\s+/g, ' ');
      assert.match(text, /verify_starts: red/, `${relative} must state the red rule`);
      assert.match(text, /new test file may share/i, `${relative} must allow a shared verify`);
      assert.match(
        text,
        /`any` is only for a task that can honestly start either way/,
        `${relative} must limit any to honest either-way starts`,
      );
    }
  });
});
