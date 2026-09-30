import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MANAGED_PLANNER_BLOCK } from '../src/core/foundation/init-blocks.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_SCHEMA = path.join(
  REPO_ROOT,
  'templates',
  'openspec',
  'schemas',
  'osq',
  'schema.yaml',
);
const REPO_SCHEMA = path.join(REPO_ROOT, 'openspec', 'schemas', 'osq', 'schema.yaml');
const PLANNER_MD = path.join(REPO_ROOT, 'PLANNER.md');
const TEMPLATE_PLANNER_MD = path.join(REPO_ROOT, 'templates', 'PLANNER.md');

/** Collapse line wrapping so a quoted sentence can be asserted as one string. */
function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const HUMAN_STEPS_BULLET =
  '- Anything a task must not do itself goes under `## Human steps`, which never includes `osq approve`.';

const NEW_SUBSECTION_BULLET =
  '- Split `## Human steps` into `### Before approval` and `### After landing`, and write `None` under one with no steps. A step during the run, such as an expected `osq retry`, goes under Before approval. After-landing steps are notes for the human, and nothing waits on them. A check osq can run goes in `check: <command>` in the proposal frontmatter. osq runs it after the change-level verify at archive and again when `osq land` merges a newer default branch. A failed check stops the change like a failed verify.';

const EXPECTED_RETRY_LINE = 'list the expected `osq retry`';

const SCHEMA_LINE =
  '- **Human steps**: everything a task must not do itself, never including `osq approve`, under `### Before approval` and `### After landing`; write `None` when there is nothing. After-landing steps are notes nothing waits on; a check osq can run goes in `check: <command>`, which osq runs after the change-level verify at archive and at land.';

describe('planner human steps guidance', () => {
  it('names the subsections and the check key without osq verified', () => {
    const block = flatten(MANAGED_PLANNER_BLOCK);
    assert.ok(block.includes('### Before approval'), 'must name ### Before approval');
    assert.ok(block.includes('### After landing'), 'must name ### After landing');
    assert.ok(block.includes('check: <command>'), 'must name check: <command>');
    assert.equal(block.includes('osq verified'), false, 'must not name osq verified');
  });

  it('adds the subsection bullet right after the Human steps bullet', () => {
    const block = flatten(MANAGED_PLANNER_BLOCK);
    assert.ok(
      block.includes(`${HUMAN_STEPS_BULLET} ${NEW_SUBSECTION_BULLET}`),
      'the subsection bullet must follow the Human steps bullet immediately',
    );
  });

  it('does not tell planners to list an expected retry for a shared file', () => {
    const block = flatten(MANAGED_PLANNER_BLOCK);
    assert.equal(block.includes(EXPECTED_RETRY_LINE), false, 'must not list an expected retry');
  });

  it('repository PLANNER.md and its template carry the new block', async () => {
    const planner = await fs.readFile(PLANNER_MD, 'utf8');
    const template = await fs.readFile(TEMPLATE_PLANNER_MD, 'utf8');
    assert.ok(flatten(planner).includes(NEW_SUBSECTION_BULLET), 'PLANNER.md must carry the bullet');
    assert.ok(
      flatten(template).includes(NEW_SUBSECTION_BULLET),
      'templates/PLANNER.md must carry the bullet',
    );
  });
});

describe('osq schema human steps guidance', () => {
  it('states the subsections and the check key in both copies', async () => {
    const template = await fs.readFile(TEMPLATE_SCHEMA, 'utf8');
    const repo = await fs.readFile(REPO_SCHEMA, 'utf8');

    assert.ok(template.includes(SCHEMA_LINE), 'template schema must carry the line');
    assert.ok(repo.includes(SCHEMA_LINE), 'repository schema must carry the line');
    assert.equal(template.includes('osq verified'), false, 'template must not name osq verified');
    assert.equal(
      repo.includes('osq verified'),
      false,
      'repository schema must not name osq verified',
    );
  });

  it('keeps both schema copies byte-identical', async () => {
    const template = await fs.readFile(TEMPLATE_SCHEMA, 'utf8');
    const repo = await fs.readFile(REPO_SCHEMA, 'utf8');

    assert.equal(repo, template);
  });
});
