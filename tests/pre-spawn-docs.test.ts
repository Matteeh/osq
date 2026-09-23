import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MANAGED_PLANNER_BLOCK } from '../src/core/foundation/init-blocks.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('pre-spawn verify documentation', () => {
  it('README names the pre-spawn gate and its surface', async () => {
    const readme = await fs.readFile(path.join(REPO_ROOT, 'README.md'), 'utf8');

    assert.ok(readme.includes('gates.preSpawnVerify'), 'README must name gates.preSpawnVerify');
    assert.ok(readme.includes('verify_starts'), 'README must name verify_starts');
    assert.ok(readme.includes('verify_precondition'), 'README must name verify_precondition');
  });

  it('managed planner block tells planners to declare verify_starts', () => {
    assert.ok(
      MANAGED_PLANNER_BLOCK.includes('verify_starts: green'),
      'managed planner block must show the green declaration',
    );
  });
});
