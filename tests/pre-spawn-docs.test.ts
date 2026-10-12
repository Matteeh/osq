import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MANAGED_PLANNER_BLOCK } from '../src/core/foundation/init-blocks.js';

describe('pre-spawn verify documentation', () => {
  it('managed planner block tells planners to declare verify_starts', () => {
    assert.ok(
      MANAGED_PLANNER_BLOCK.includes('verify_starts: green'),
      'managed planner block must show the green declaration',
    );
  });
});
