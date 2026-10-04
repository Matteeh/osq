import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { buildApprovalDigest, formatApprovalDigest } from '../src/core/spec/digest.js';
import { lookupRequirement } from '../src/core/spec/requirement-lookup.js';
import { getWebChange } from '../src/core/web/web-data.js';
import { buildWebFixture } from './fixtures/web/build.js';
import { createChange, createProject, restoreEnv } from './planning-observed-helpers.js';

const OPENSPEC_ROOT = DEFAULT_CONFIG.paths.openspecRoot;

const ALPHA_LIVING = [
  '# alpha Specification',
  '',
  '## Purpose',
  '',
  'Alpha purpose.',
  '',
  '## Requirements',
  '',
  '### Requirement: Alpha one',
  'The system SHALL do one.',
  '',
  '#### Scenario: One',
  '- **WHEN** one',
  '- **THEN** one',
  '',
  '### Requirement: Alpha two',
  'The system SHALL do two.',
  '',
  '#### Scenario: Two',
  '- **WHEN** two',
  '- **THEN** two',
  '',
  '### Requirement: Alpha three',
  'The system SHALL do three.',
  '',
  '#### Scenario: Three',
  '- **WHEN** three',
  '- **THEN** three',
  '',
].join('\n');

const ALPHA_DELTA = [
  '# alpha Specification',
  '',
  '## Purpose',
  '',
  'Alpha delta purpose.',
  '',
  '## ADDED Requirements',
  '',
  '### Requirement: Alpha new',
  'The system SHALL do new.',
  '',
  '#### Scenario: New',
  '- **WHEN** new',
  '- **THEN** new',
  '',
  '## MODIFIED Requirements',
  '',
  '### Requirement: Alpha one',
  'The system SHALL do one, modified.',
  '',
  '#### Scenario: One',
  '- **WHEN** one',
  '- **THEN** one modified',
  '',
  '## REMOVED Requirements',
  '',
  '### Requirement: Alpha three',
  '',
  '## RENAMED Requirements',
  '',
  '- FROM: `### Requirement: Alpha two`',
  '- TO: `### Requirement: Alpha renamed`',
  '',
].join('\n');

const REVIEW_PROPOSAL = [
  '---',
  'title: Review Change',
  'depends_on: []',
  'verify: node verify.cjs',
  'features:',
  '  reads: []',
  '---',
  '## Goal',
  '',
  'Review change goal.',
  '',
  '## Non-goals',
  '',
  '- Not a goal.',
  '',
  '## Surface',
  '',
  '<!-- User-facing names this change adds, changes, or removes:',
  'a template comment that spans lines. -->',
  '- Added: a thing.',
  '',
  '## Decisions',
  '',
  '<!-- One line per accepted ADR. -->',
  '- ADR 003: whatever.',
  '',
  '## Contract',
  '',
  '### Requirement: Contract thing',
  '',
  'The system SHALL contract.',
  '',
  '#### Scenario: Contract',
  '- **WHEN** contract',
  '- **THEN** contract',
  '',
  '## Human steps',
  '',
  '### Before approval',
  '',
  '- Step one.',
  '',
  '## Delta',
  '',
  '- specs/alpha/spec.md',
  '',
].join('\n');

async function write(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

describe('web approve review document', () => {
  let root = '';

  beforeEach(() => {
    restoreEnv();
  });
  afterEach(async () => {
    restoreEnv();
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  it('builds the proposal, each delta beside its living requirement, and the digest', async () => {
    root = await createProject();
    const change = await createChange(root, 'Review Change');
    await write(root, `${OPENSPEC_ROOT}/specs/alpha/spec.md`, ALPHA_LIVING);
    await write(
      root,
      path.relative(root, path.join(change.folderPath, 'proposal.md')),
      REVIEW_PROPOSAL,
    );
    await write(
      root,
      path.relative(root, path.join(change.folderPath, 'specs', 'alpha', 'spec.md')),
      ALPHA_DELTA,
    );

    const document = await getWebChange(root, change.specId, DEFAULT_CONFIG);
    const review = document.review;
    assert.ok(review, 'an unapproved active change should carry a review');

    assert.equal(review.goal, 'Review change goal.');
    assert.equal(review.nonGoals, '- Not a goal.');
    // The planner template's HTML comments never reach the reviewer.
    assert.equal(review.surface, '- Added: a thing.');
    assert.equal(review.decisions, '- ADR 003: whatever.');
    assert.equal(review.humanSteps, '### Before approval\n\n- Step one.');
    assert.ok(review.contract.includes('### Requirement: Contract thing'));
    assert.ok(review.contract.includes('The system SHALL contract.'));

    assert.equal(review.deltas.length, 1);
    const [capability] = review.deltas;
    assert.equal(capability.capability, 'alpha');
    assert.deepEqual(
      capability.requirements.map((entry) => entry.operation),
      ['added', 'modified', 'removed', 'renamed'],
    );

    const [added, modified, removed, renamed] = capability.requirements;
    assert.equal(added.name, 'Alpha new');
    assert.equal(added.from, null);
    assert.ok(added.proposed?.startsWith('### Requirement: Alpha new'));
    assert.equal(added.living, null);

    assert.equal(modified.name, 'Alpha one');
    assert.equal(modified.from, null);
    assert.ok(modified.proposed?.startsWith('### Requirement: Alpha one'));
    assert.equal(
      modified.living,
      await lookupRequirement(root, OPENSPEC_ROOT, 'alpha', 'Alpha one'),
    );

    assert.equal(removed.name, 'Alpha three');
    assert.equal(removed.proposed, null);
    assert.equal(
      removed.living,
      await lookupRequirement(root, OPENSPEC_ROOT, 'alpha', 'Alpha three'),
    );

    assert.equal(renamed.name, 'Alpha renamed');
    assert.equal(renamed.from, 'Alpha two');
    assert.equal(renamed.proposed, null);
    assert.equal(
      renamed.living,
      await lookupRequirement(root, OPENSPEC_ROOT, 'alpha', 'Alpha two'),
    );

    const digest = await buildApprovalDigest(root, change.folderPath, DEFAULT_CONFIG);
    assert.deepEqual(review.digest, digest);
    assert.equal(review.digestText, formatApprovalDigest(digest));
    assert.ok(
      review.digest.flags.some((flag) => flag.id === 'removed_requirement'),
      'a removed requirement should raise the removed_requirement flag',
    );
  });

  it('gives a requirement with no living match a null living block', async () => {
    root = await createProject();
    const change = await createChange(root, 'Orphan Review');
    await write(
      root,
      path.relative(root, path.join(change.folderPath, 'specs', 'gamma', 'spec.md')),
      [
        '# gamma Specification',
        '',
        '## REMOVED Requirements',
        '',
        '### Requirement: Missing',
        '',
      ].join('\n'),
    );

    const document = await getWebChange(root, change.specId, DEFAULT_CONFIG);
    const requirement = document.review?.deltas[0].requirements[0];
    assert.equal(requirement?.operation, 'removed');
    assert.equal(requirement?.living, null);
  });

  it('is null for an approved change', async () => {
    root = await createProject();
    const change = await createChange(root, 'Approved Review');
    await approveSpec(root, change.specId, DEFAULT_CONFIG, { planningReaders: [] });

    const document = await getWebChange(root, change.specId, DEFAULT_CONFIG);
    assert.equal(document.review, null);
  });
});

describe('web approve review null locations', () => {
  let root = '';

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
    root = '';
  });

  it('is null for the archived, rejected and approved active fixture changes', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-web-review-'));
    await buildWebFixture(root);

    const active = await getWebChange(root, '010-active-change', DEFAULT_CONFIG);
    assert.equal(active.review, null, 'an active change with an approval seal has no review');

    const archived = await getWebChange(root, '003-archived-unique', DEFAULT_CONFIG);
    assert.equal(archived.review, null, 'an archived change has no review');

    const rejected = await getWebChange(root, '002-rejected-change', DEFAULT_CONFIG);
    assert.equal(rejected.review, null, 'a rejected change has no review');
  });
});
