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
const REPO_OPENSPEC = path.join(REPO_ROOT, 'openspec');
const CANONICAL_PROPOSAL = path.join(REPO_ROOT, 'templates', 'proposal.md');
const SCHEMA_PROPOSAL = path.join(TEMPLATES_OPENSPEC, 'schemas', 'osq', 'templates', 'proposal.md');
const TEMPLATE_SCHEMA = path.join(TEMPLATES_OPENSPEC, 'schemas', 'osq', 'schema.yaml');
const TEMPLATE_CONFIG = path.join(TEMPLATES_OPENSPEC, 'config.yaml');
const REPO_SCHEMA = path.join(REPO_OPENSPEC, 'schemas', 'osq', 'schema.yaml');
const REPO_CONFIG = path.join(REPO_OPENSPEC, 'config.yaml');

const CONFIG_RULE =
  "Follow the proposal template's sections in order: Goal, Verify, Non-goals, Surface, Decisions, Contract, Human steps, Delta.";

interface ParsedArtifact {
  id: string;
  instruction: string;
}

interface ParsedConfig {
  rules?: Record<string, string[]>;
}

/** Assert `## Decisions` sits between `## Surface` and `## Contract`, comment then None. */
function assertSeededDecisionsSection(markdown: string, label: string): void {
  const surfaceIndex = markdown.indexOf('## Surface');
  const decisionsIndex = markdown.indexOf('## Decisions');
  const contractIndex = markdown.indexOf('## Contract');

  assert.ok(surfaceIndex >= 0, `${label} must declare ## Surface`);
  assert.ok(decisionsIndex > surfaceIndex, `${label} must place ## Decisions after ## Surface`);
  assert.ok(contractIndex > decisionsIndex, `${label} must place ## Contract after ## Decisions`);

  const body = markdown.slice(decisionsIndex, contractIndex);
  assert.ok(body.includes('<!--'), `${label} Decisions section must hold a comment`);
  assert.match(body, /^None$/m, `${label} Decisions section must seed a None line`);
}

/** The managed planner bullet, found in the block byte for byte. */
const PLANNER_DECISIONS_BULLET = [
  '- `## Decisions` follows `## Surface`. Give one line per accepted ADR that',
  '  governs a capability the change writes, saying what it means for this',
  '  change, such as `ADR 009: the adapter is the only module that imports',
  '  dockerode.` Name a system-wide ADR only to depart from it; AGENTS.md already',
  '  carries its rule. A departure line starts `Departs from ADR <n>:` and gives',
  '  the reason; a needed departure is a reason for a new ADR. Write `None` when',
  '  no ADR governs the change. Repeat a rule in a task only when that task',
  '  touches the area.',
].join('\n');

describe('Decisions proposal template', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-decisions-template-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('the schema template and the fallback hold the canonical proposal bytes', async () => {
    const canonical = await fs.readFile(CANONICAL_PROPOSAL, 'utf8');
    assert.equal(await fs.readFile(SCHEMA_PROPOSAL, 'utf8'), canonical);
    assert.equal(FALLBACK_PROPOSAL_MD, canonical);
  });

  it('osq new seeds ## Decisions after ## Surface and before ## Contract', async () => {
    const spec = await createNewSpec(tmpDir, 'Seed Decisions');
    const proposal = await fs.readFile(path.join(spec.folderPath, 'proposal.md'), 'utf8');
    assertSeededDecisionsSection(proposal, 'seeded proposal');
  });

  it('the unreadable-template fallback seeds the decisions section', () => {
    assertSeededDecisionsSection(FALLBACK_PROPOSAL_MD, 'fallback proposal');
  });

  it('the repository config and schema tree match the templates byte for byte', async () => {
    assert.equal(
      await fs.readFile(REPO_CONFIG, 'utf8'),
      await fs.readFile(TEMPLATE_CONFIG, 'utf8'),
    );
    assert.equal(
      await fs.readFile(REPO_SCHEMA, 'utf8'),
      await fs.readFile(TEMPLATE_SCHEMA, 'utf8'),
    );

    const templateRoot = path.join(TEMPLATES_OPENSPEC, 'schemas', 'osq');
    const repoRoot = path.join(REPO_OPENSPEC, 'schemas', 'osq');
    const files: string[] = [];

    async function walk(dir: string, prefix: string): Promise<void> {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const relative = path.join(prefix, entry.name);
        if (entry.isDirectory()) await walk(path.join(dir, entry.name), relative);
        else files.push(relative);
      }
    }

    await walk(templateRoot, '');
    for (const relative of files.sort()) {
      assert.equal(
        await fs.readFile(path.join(repoRoot, relative), 'utf8'),
        await fs.readFile(path.join(templateRoot, relative), 'utf8'),
        relative,
      );
    }
  });
});

describe('Decisions instruction and rules', () => {
  it('the proposal instruction names Decisions between Surface and Contract', async () => {
    const schema = parseYaml(await fs.readFile(TEMPLATE_SCHEMA, 'utf8')) as {
      artifacts: ParsedArtifact[];
    };
    const proposal = schema.artifacts.find((artifact) => artifact.id === 'proposal');
    assert.ok(proposal, 'schema must declare a proposal artifact');

    const instruction = proposal.instruction;
    const surfaceIndex = instruction.indexOf('**Surface**');
    const decisionsIndex = instruction.indexOf('**Decisions**');
    const contractIndex = instruction.indexOf('**Contract**');

    assert.ok(surfaceIndex >= 0, 'instruction must name Surface');
    assert.ok(decisionsIndex > surfaceIndex, 'instruction must name Decisions after Surface');
    assert.ok(contractIndex > decisionsIndex, 'instruction must name Contract after Decisions');
    assert.match(instruction, /Departs from ADR <n>:/);
  });

  it('the proposal rules name Decisions between Surface and Contract', async () => {
    const config = parseYaml(await fs.readFile(TEMPLATE_CONFIG, 'utf8')) as ParsedConfig;
    const rules = config.rules?.proposal ?? [];
    assert.equal(rules[0], CONFIG_RULE);

    const text = rules.join('\n');
    const surfaceIndex = text.indexOf('Surface');
    const decisionsIndex = text.indexOf('Decisions');
    const contractIndex = text.indexOf('Contract');

    assert.ok(decisionsIndex > surfaceIndex, 'rules must name Decisions after Surface');
    assert.ok(contractIndex > decisionsIndex, 'rules must name Contract after Decisions');
  });
});

describe('Planner decisions guidance', () => {
  it('names ## Decisions, the departure form, and None', () => {
    assert.ok(MANAGED_PLANNER_BLOCK.includes('## Decisions'));
    assert.ok(MANAGED_PLANNER_BLOCK.includes('Departs from ADR <n>:'));
    assert.ok(MANAGED_PLANNER_BLOCK.includes('None'));
  });

  it('places the decisions bullet directly after the Surface bullet', () => {
    const surfaceEnd = MANAGED_PLANNER_BLOCK.indexOf('rejects a proposal without the section.');
    const bulletIndex = MANAGED_PLANNER_BLOCK.indexOf(PLANNER_DECISIONS_BULLET);
    assert.ok(surfaceEnd >= 0, 'planner block must carry the Surface bullet');
    assert.ok(bulletIndex > surfaceEnd, 'decisions bullet must follow the Surface bullet');
    assert.equal(
      MANAGED_PLANNER_BLOCK.indexOf('- The delta is the exact text') > bulletIndex,
      true,
    );
  });

  it('the repository PLANNER.md and its template carry the same bullet', async () => {
    const planner = await fs.readFile(path.join(REPO_ROOT, 'PLANNER.md'), 'utf8');
    const template = await fs.readFile(path.join(REPO_ROOT, 'templates', 'PLANNER.md'), 'utf8');
    assert.ok(planner.includes(PLANNER_DECISIONS_BULLET));
    assert.ok(template.includes(PLANNER_DECISIONS_BULLET));
  });
});
