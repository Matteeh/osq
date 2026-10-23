import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MANAGED_PLANNER_BLOCK } from '../src/core/foundation/init-blocks.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLANNER_MD = path.join(REPO_ROOT, 'PLANNER.md');
const TEMPLATE_PLANNER_MD = path.join(REPO_ROOT, 'templates', 'PLANNER.md');

const NEW_BULLET =
  '- Write file contents with the file tool, never through a shell echo or heredoc. A script may make mechanical edits, such as one scope change across several task files; `osq lint` checks the result.';
const OLD_BULLET = '- Write files with the file tool, never through a shell echo.';

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

describe('planner scripted edits rule', () => {
  it('carries the new one-line bullet in every checked-in copy', async () => {
    for (const doc of await readDocuments()) {
      assert.ok(doc.text.includes(NEW_BULLET), `${doc.label} must carry the new bullet line`);
    }
  });

  it('drops the old shell echo bullet from every checked-in copy', async () => {
    for (const doc of await readDocuments()) {
      assert.ok(!doc.text.includes(OLD_BULLET), `${doc.label} must not carry the old bullet line`);
    }
  });
});
