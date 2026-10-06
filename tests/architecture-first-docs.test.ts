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
const README_MD = path.join(REPO_ROOT, 'README.md');

const PRECEDING_BULLET = '- Write files with the file tool, never through a shell echo.';
const NEW_BULLET = [
  '- A project with no accepted ADR that applies to all writes its architecture',
  '  and style ADRs first, each with a one-sentence rule and a checks test where',
  '  the rule can be tested.',
].join('\n');

const STARTER_ADR_PATH = 'decisions/000-how-this-project-is-built.md';

/** Slice the single managed block, markers included, out of a document. */
function extractManagedBlock(content: string): string {
  const start = content.indexOf(OSQ_START_MARKER);
  const end = content.indexOf(OSQ_END_MARKER);
  assert.notEqual(start, -1, 'document should contain OSQ_START_MARKER');
  assert.ok(end > start, 'OSQ_END_MARKER should follow OSQ_START_MARKER');
  return content.slice(start, end + OSQ_END_MARKER.length);
}

/**
 * Return the markdown from a heading to the next heading of the same level.
 * Matching the exact level keeps a `# comment` inside a fenced code block from
 * looking like a section break.
 */
function section(content: string, heading: string): string {
  const start = content.indexOf(heading);
  assert.notEqual(start, -1, `README should contain ${heading}`);
  const level = heading.match(/^#+/)?.[0].length ?? 1;
  const rest = content.slice(start + heading.length);
  const next = new RegExp(`^#{${level}} `, 'm').exec(rest);
  return next ? rest.slice(0, next.index) : rest;
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

describe('architecture-first documentation', () => {
  it('shows the ADR step after init in ## Install', async () => {
    const readme = await fs.readFile(README_MD, 'utf8');
    const install = section(readme, '## Install');
    const init = install.indexOf('npx @matteeh/osq init');
    const adr = install.indexOf(STARTER_ADR_PATH);
    assert.notEqual(init, -1, '## Install should run init');
    assert.notEqual(adr, -1, `## Install should name ${STARTER_ADR_PATH}`);
    assert.ok(adr > init, 'the ADR step should follow the init line');
    assert.ok(
      install.includes('architecture and style ADRs'),
      '## Install should tell the reader to write the architecture and style ADRs',
    );
    assert.ok(
      install.includes('first feature brief'),
      '## Install should place the ADRs before the first feature brief',
    );
  });

  it('marks the decisions scaffold line in ## What it puts in your repo', async () => {
    const readme = await fs.readFile(README_MD, 'utf8');
    assert.ok(
      readme.includes(
        'decisions/ *       ADRs, superseded not edited; init writes a README and a starter ADR',
      ),
      'the decisions line should be marked as written by osq init',
    );
  });

  it('says decisions lint applies once an ADR is accepted', async () => {
    const readme = await fs.readFile(README_MD, 'utf8');
    const decisions = section(readme, '### Architecture decisions');
    assert.ok(
      decisions.includes('When the project has an accepted ADR'),
      'the section should key lint on an accepted ADR',
    );
    assert.equal(
      decisions.includes('any ADR with osq frontmatter'),
      false,
      'the section should no longer key lint on any ADR file',
    );
  });

  it('says doctor warns until an accepted ADR applies to all', async () => {
    const readme = await fs.readFile(README_MD, 'utf8');
    const decisions = section(readme, '### Architecture decisions');
    assert.ok(
      decisions.includes('warns until an accepted ADR applies to `all`'),
      'the decisions check paragraph should name the system-wide warning',
    );
  });
});
