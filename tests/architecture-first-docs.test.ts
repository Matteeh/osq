import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  MANAGED_PLANNER_BLOCK,
  OSQ_END_MARKER,
  OSQ_START_MARKER,
} from '../src/core/foundation/init-blocks.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLANNER_MD = path.join(REPO_ROOT, 'PLANNER.md');
const TEMPLATE_PLANNER_MD = path.join(REPO_ROOT, 'templates', 'PLANNER.md');

const PRECEDING_BULLET = '- Write files with the file tool, never through a shell echo.';
const NEW_BULLET = [
  '- A project with no accepted ADR that applies to all writes its architecture',
  '  and style ADRs first, each with a one-sentence rule and a checks test where',
  '  the rule can be tested.',
].join('\n');

/** Slice the single managed block, markers included, out of a document. */
function extractManagedBlock(content: string): string {
  const start = content.indexOf(OSQ_START_MARKER);
  const end = content.indexOf(OSQ_END_MARKER);
  assert.notEqual(start, -1, 'document should contain OSQ_START_MARKER');
  assert.ok(end > start, 'OSQ_END_MARKER should follow OSQ_START_MARKER');
  return content.slice(start, end + OSQ_END_MARKER.length);
}

type CheckedDocument = { label: string; text: string };

async function readDocuments(): Promise<CheckedDocument[]> {
  const [planner, template] = await Promise.all([
    fs.readFile(PLANNER_MD, 'utf8'),
    fs.readFile(TEMPLATE_PLANNER_MD, 'utf8'),
  ]);
  return [
    { label: 'MANAGED_PLANNER_BLOCK', text: MANAGED_PLANNER_BLOCK },
    { label: 'PLANNER.md', text: planner },
    { label: 'templates/PLANNER.md', text: template },
  ];
}

describe('planner architecture-first guidance', () => {
  it('names the order under ### Either way in MANAGED_PLANNER_BLOCK', () => {
    const text = MANAGED_PLANNER_BLOCK;
    const eitherWay = text.indexOf('### Either way');
    const bullet = text.indexOf(NEW_BULLET);
    assert.notEqual(eitherWay, -1, 'block should hold ### Either way');
    assert.notEqual(bullet, -1, 'block should hold the architecture-first bullet');
    assert.ok(bullet > eitherWay, 'the bullet should sit under ### Either way');
  });

  it('holds the phrases the requirement names', () => {
    assert.ok(MANAGED_PLANNER_BLOCK.includes('writes its architecture'));
    assert.ok(MANAGED_PLANNER_BLOCK.includes('and style ADRs first'));
    assert.ok(MANAGED_PLANNER_BLOCK.includes('each with a one-sentence rule'));
    assert.ok(MANAGED_PLANNER_BLOCK.includes('a checks test where'));
    assert.ok(MANAGED_PLANNER_BLOCK.includes('the rule can be tested.'));
  });

  it('places the bullet right after the shell echo bullet', () => {
    assert.ok(
      MANAGED_PLANNER_BLOCK.includes(`${PRECEDING_BULLET}\n${NEW_BULLET}`),
      'the architecture-first bullet must follow the shell echo bullet with nothing between',
    );
  });

  it('carries the bullet in every checked-in copy', async () => {
    for (const doc of await readDocuments()) {
      const content = doc.text;
      assert.ok(
        content.includes(NEW_BULLET),
        `${doc.label} must carry the architecture-first bullet`,
      );
      assert.ok(
        content.includes(`${PRECEDING_BULLET}\n${NEW_BULLET}`),
        `${doc.label} must order the bullet after the shell echo bullet`,
      );
      assert.ok(content.includes('writes its architecture'), `${doc.label} must name the order`);
      assert.ok(content.includes('and style ADRs first'), `${doc.label} must name the order`);
    }
  });

  it('keeps both checked-in managed blocks byte-identical to the constant', async () => {
    const [planner, template] = await Promise.all([
      fs.readFile(PLANNER_MD, 'utf8'),
      fs.readFile(TEMPLATE_PLANNER_MD, 'utf8'),
    ]);
    assert.equal(extractManagedBlock(planner), MANAGED_PLANNER_BLOCK);
    assert.equal(extractManagedBlock(template), MANAGED_PLANNER_BLOCK);
  });
});
