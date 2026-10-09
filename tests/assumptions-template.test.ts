import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { MANAGED_PLANNER_BLOCK } from '../src/core/foundation/init-blocks.js';
import { FALLBACK_PROPOSAL_MD, createNewSpec } from '../src/core/foundation/new.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES_OPENSPEC = path.join(REPO_ROOT, 'templates', 'openspec');
const CANONICAL_PROPOSAL = path.join(REPO_ROOT, 'templates', 'proposal.md');
const SCHEMA_PROPOSAL = path.join(TEMPLATES_OPENSPEC, 'schemas', 'osq', 'templates', 'proposal.md');
const TEMPLATE_SCHEMA = path.join(TEMPLATES_OPENSPEC, 'schemas', 'osq', 'schema.yaml');
const TEMPLATE_CONFIG = path.join(TEMPLATES_OPENSPEC, 'config.yaml');

const CONFIG_RULE =
  "Follow the proposal template's sections in order: Goal, Verify, Non-goals, Surface, Decisions, Assumptions, Contract, Human steps, Delta.";

interface ParsedArtifact {
  id: string;
  instruction: string;
}

interface ParsedConfig {
  rules?: Record<string, string[]>;
}

/**
 * Assert `## Assumptions` sits between `## Decisions` and `## Contract`, with an
 * HTML comment and a `None` line, exactly as the spec's seeded-assumptions
 * scenario says.
 */
function assertSeededAssumptionsSection(markdown: string, label: string): void {
  const decisionsIndex = markdown.indexOf('## Decisions');
  const assumptionsIndex = markdown.indexOf('## Assumptions');
  const contractIndex = markdown.indexOf('## Contract');

  assert.ok(decisionsIndex >= 0, `${label} must declare ## Decisions`);
  assert.ok(
    assumptionsIndex > decisionsIndex,
    `${label} must place ## Assumptions after ## Decisions`,
  );
  assert.ok(
    contractIndex > assumptionsIndex,
    `${label} must place ## Contract after ## Assumptions`,
  );

  const body = markdown.slice(assumptionsIndex, contractIndex);
  assert.ok(body.includes('<!--'), `${label} Assumptions section must hold a comment`);
  assert.match(body, /^None$/m, `${label} Assumptions section must seed a None line`);
}

/** The managed planner bullet, found in the block byte for byte. */
const PLANNER_ASSUMPTIONS_BULLET = [
  '- `## Assumptions` follows `## Decisions`. Give one line per assumption the',
  '  plan rests on that the human should check before approving, or write',
  '  `None`. osq shows them as a notice on the approve view.',
].join('\n');

describe('Assumptions proposal template', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-assumptions-template-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('the schema template and the fallback hold the canonical proposal bytes', async () => {
    const canonical = await fs.readFile(CANONICAL_PROPOSAL, 'utf8');
    assert.equal(await fs.readFile(SCHEMA_PROPOSAL, 'utf8'), canonical);
    assert.equal(FALLBACK_PROPOSAL_MD, canonical);
  });

  it('osq new seeds ## Assumptions after ## Decisions and before ## Contract', async () => {
    const spec = await createNewSpec(tmpDir, 'Seed Assumptions');
    const proposal = await fs.readFile(path.join(spec.folderPath, 'proposal.md'), 'utf8');
    assertSeededAssumptionsSection(proposal, 'seeded proposal');
  });

  it('the unreadable-template fallback seeds the assumptions section', () => {
    assertSeededAssumptionsSection(FALLBACK_PROPOSAL_MD, 'fallback proposal');
  });
});

describe('Assumptions instruction and rules', () => {
  it('the proposal instruction names Assumptions between Decisions and Contract', async () => {
    const schema = parseYaml(await fs.readFile(TEMPLATE_SCHEMA, 'utf8')) as {
      artifacts: ParsedArtifact[];
    };
    const proposal = schema.artifacts.find((artifact) => artifact.id === 'proposal');
    assert.ok(proposal, 'schema must declare a proposal artifact');

    const instruction = proposal.instruction;
    const decisionsIndex = instruction.indexOf('**Decisions**');
    const assumptionsIndex = instruction.indexOf('**Assumptions**');
    const contractIndex = instruction.indexOf('**Contract**');

    assert.ok(decisionsIndex >= 0, 'instruction must name Decisions');
    assert.ok(
      assumptionsIndex > decisionsIndex,
      'instruction must name Assumptions after Decisions',
    );
    assert.ok(contractIndex > assumptionsIndex, 'instruction must name Contract after Assumptions');
  });

  it('the proposal rules name Assumptions between Decisions and Contract', async () => {
    const config = parseYaml(await fs.readFile(TEMPLATE_CONFIG, 'utf8')) as ParsedConfig;
    const rules = config.rules?.proposal ?? [];
    assert.equal(rules[0], CONFIG_RULE);

    const text = rules.join('\n');
    const decisionsIndex = text.indexOf('Decisions');
    const assumptionsIndex = text.indexOf('Assumptions');
    const contractIndex = text.indexOf('Contract');

    assert.ok(decisionsIndex >= 0, 'rules must name Decisions');
    assert.ok(assumptionsIndex > decisionsIndex, 'rules must name Assumptions after Decisions');
    assert.ok(contractIndex > assumptionsIndex, 'rules must name Contract after Assumptions');
  });
});

describe('Planner assumptions guidance', () => {
  it('names ## Assumptions and None', () => {
    assert.ok(MANAGED_PLANNER_BLOCK.includes('## Assumptions'));
    assert.ok(MANAGED_PLANNER_BLOCK.includes('None'));
  });

  it('places the assumptions bullet directly after the Decisions bullet', () => {
    const decisionsEnd = MANAGED_PLANNER_BLOCK.indexOf('  touches the area.');
    const bulletIndex = MANAGED_PLANNER_BLOCK.indexOf(PLANNER_ASSUMPTIONS_BULLET);
    assert.ok(decisionsEnd >= 0, 'planner block must carry the Decisions bullet');
    assert.ok(bulletIndex > decisionsEnd, 'assumptions bullet must follow the Decisions bullet');
    assert.equal(
      MANAGED_PLANNER_BLOCK.indexOf('- The delta is the exact text') > bulletIndex,
      true,
    );
  });

  it('the repository PLANNER.md and its template carry the same bullet', async () => {
    const planner = await fs.readFile(path.join(REPO_ROOT, 'PLANNER.md'), 'utf8');
    const template = await fs.readFile(path.join(REPO_ROOT, 'templates', 'PLANNER.md'), 'utf8');
    assert.ok(planner.includes(PLANNER_ASSUMPTIONS_BULLET));
    assert.ok(template.includes(PLANNER_ASSUMPTIONS_BULLET));
  });
});
