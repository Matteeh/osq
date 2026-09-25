import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  EXECUTOR_STEPS,
  MANAGED_PLANNER_BLOCK,
  RESULT_HEADINGS,
} from '../src/core/foundation/init-blocks.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Collapse the block's line wrapping so a quoted sentence can be asserted. */
function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const STEP_2 =
  "2. Can't finish within your task's `scope`, or too big for one pass? Write what you need under `## Blocked` in `.run/results/<n>.md`, and exit without code.";

const PLANNER_OWNERSHIP_BULLET =
  "- A file belongs to one task. Before each later task, the watcher re-hashes the resolved `scope` of every done task. When a later task must extend a file, order that later task after the owner, put the file in its `scope` too, and name the shared file in the proposal; the watcher then recertifies the owner by itself when the owner's `verify` still passes. Any other change to a done task's files halts the change until a human runs `osq retry`. Globs resolve again at every audit, so a broad glob also captures files that later tasks create.";

describe('executor and planner wording', () => {
  it('executor step 2 tells a blocked executor what to write and to exit without code', () => {
    assert.equal(EXECUTOR_STEPS[1], STEP_2);
  });

  it('result headings place ## Blocked between ## Outside scope and ## Next', () => {
    assert.deepEqual(
      RESULT_HEADINGS.map(({ heading }) => heading),
      [
        '## Changed',
        '## Deviated',
        '## Missing context',
        '## Outside scope',
        '## Blocked',
        '## Next',
      ],
    );
    assert.equal(
      RESULT_HEADINGS.find(({ heading }) => heading === '## Blocked')?.purpose,
      'for the human: what you need before this task can be finished within its scope.',
    );
  });

  it('the managed planner block carries the new ownership bullet and drops the retry line', () => {
    const block = flatten(MANAGED_PLANNER_BLOCK);

    assert.ok(block.includes(PLANNER_OWNERSHIP_BULLET), 'must carry the new ownership bullet');
    assert.equal(block.includes('list the expected `osq retry`'), false);
  });

  it('both PLANNER.md copies carry the new ownership bullet', async () => {
    for (const relative of ['PLANNER.md', 'templates/PLANNER.md']) {
      const text = await fs.readFile(path.join(REPO_ROOT, relative), 'utf8');
      assert.ok(flatten(text).includes(PLANNER_OWNERSHIP_BULLET), `${relative} must carry it`);
    }
  });

  it('AGENTS.md carries the ## Blocked heading', async () => {
    const text = await fs.readFile(path.join(REPO_ROOT, 'AGENTS.md'), 'utf8');
    assert.ok(text.includes('## Blocked'));
  });
});
