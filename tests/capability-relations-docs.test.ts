import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MANAGED_PLANNER_BLOCK } from '../src/core/foundation/init-blocks.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Collapse line wrapping so a quoted sentence can be asserted as one string. */
function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const RELATION_BULLET =
  '- Every change relates to a capability: it writes a delta or names one in `features.reads`, and every read names a living capability or one the change creates. List each new capability in `creates` in the proposal frontmatter. Never invent a capability to avoid touching an existing one.';

const PARENT_SPEC_HEADING = '### Parent spec';
const REPLACING_BULLET = '- Replacing a requirement';

const OSQ_START_MARKER = '<!-- OSQ:START -->';
const OSQ_END_MARKER = '<!-- OSQ:END -->';

describe('capability relation guidance', () => {
  it('keeps the relation bullet under ### Parent spec and before the replacing bullet', () => {
    const block = flatten(MANAGED_PLANNER_BLOCK);
    const parent = block.indexOf(PARENT_SPEC_HEADING);
    const bullet = block.indexOf(RELATION_BULLET);
    const replacing = block.indexOf(REPLACING_BULLET);

    assert.ok(parent >= 0, 'the block must hold ### Parent spec');
    assert.ok(bullet > parent, 'the relation bullet must sit under ### Parent spec');
    assert.ok(replacing > bullet, 'the relation bullet must precede the replacing bullet');
  });

  it('carries the relation bullet in both PLANNER.md copies between their OSQ markers', async () => {
    for (const relative of ['PLANNER.md', 'templates/PLANNER.md']) {
      const raw = await fs.readFile(path.join(REPO_ROOT, relative), 'utf8');
      const start = raw.indexOf(OSQ_START_MARKER);
      const end = raw.indexOf(OSQ_END_MARKER);
      assert.notEqual(start, -1, `${relative} must hold the OSQ start marker`);
      assert.ok(end > start, `${relative} must hold the OSQ end marker after the start`);

      const block = flatten(raw.slice(start, end + OSQ_END_MARKER.length));
      assert.ok(block.includes(RELATION_BULLET), `${relative} must carry the relation bullet`);
      assert.ok(
        block.indexOf(RELATION_BULLET) < block.indexOf(REPLACING_BULLET),
        `${relative} must place the relation bullet before the replacing bullet`,
      );
    }
  });
});
