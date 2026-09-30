import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MANAGED_PLANNER_BLOCK } from '../src/core/foundation/init-blocks.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLANNER_MD = path.join(REPO_ROOT, 'PLANNER.md');
const TEMPLATE_PLANNER_MD = path.join(REPO_ROOT, 'templates', 'PLANNER.md');
const TEMPLATE_SCHEMA = path.join(
  REPO_ROOT,
  'templates',
  'openspec',
  'schemas',
  'osq',
  'schema.yaml',
);
const REPO_SCHEMA = path.join(REPO_ROOT, 'openspec', 'schemas', 'osq', 'schema.yaml');
const README_MD = path.join(REPO_ROOT, 'README.md');

const NAMES_AFTER_LANDING = '### After landing';
const NAMES_CHECK_COMMAND = 'check: <command>';

describe('planner check guidance', () => {
  it('names the subsections and the check key in the managed planner block', () => {
    assert.ok(
      MANAGED_PLANNER_BLOCK.includes('### Before approval'),
      'must name ### Before approval',
    );
    assert.ok(MANAGED_PLANNER_BLOCK.includes(NAMES_AFTER_LANDING), 'must name ### After landing');
    assert.ok(MANAGED_PLANNER_BLOCK.includes(NAMES_CHECK_COMMAND), 'must name check: <command>');
    assert.equal(
      MANAGED_PLANNER_BLOCK.includes('osq verified'),
      false,
      'must not name osq verified',
    );
  });

  it('names them in both PLANNER.md copies without osq verified', async () => {
    for (const file of [PLANNER_MD, TEMPLATE_PLANNER_MD]) {
      const text = await fs.readFile(file, 'utf8');
      assert.ok(text.includes(NAMES_AFTER_LANDING), `${file} must name ### After landing`);
      assert.ok(text.includes(NAMES_CHECK_COMMAND), `${file} must name check: <command>`);
      assert.equal(text.includes('osq verified'), false, `${file} must not name osq verified`);
    }
  });

  it('names them in both schema copies without osq verified', async () => {
    for (const file of [TEMPLATE_SCHEMA, REPO_SCHEMA]) {
      const text = await fs.readFile(file, 'utf8');
      assert.ok(text.includes(NAMES_AFTER_LANDING), `${file} must name ### After landing`);
      assert.ok(text.includes(NAMES_CHECK_COMMAND), `${file} must name check: <command>`);
      assert.equal(text.includes('osq verified'), false, `${file} must not name osq verified`);
    }
  });

  it('removes osq verified and osq check from README.md', async () => {
    const readme = await fs.readFile(README_MD, 'utf8');
    assert.equal(readme.includes('osq verified'), false, 'README.md must not name osq verified');
    assert.equal(readme.includes('osq check'), false, 'README.md must not name osq check');
  });
});
