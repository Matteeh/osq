import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { FALLBACK_PROPOSAL_MD, createNewSpec } from '../src/core/foundation/new.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'templates', 'openspec', 'schemas', 'osq', 'schema.yaml');
const HUMAN_STEPS = '## Human steps';

/** Trimmed body of a `## <heading>` section, up to the next `## ` heading. */
function sectionBody(markdown: string, heading: string): string {
  const start = markdown.indexOf(`${heading}\n`);
  assert.ok(start >= 0, `proposal must declare ${heading}`);
  const bodyStart = start + heading.length + 1;
  const end = markdown.indexOf('\n## ', bodyStart);
  const body = end >= 0 ? markdown.slice(bodyStart, end) : markdown.slice(bodyStart);
  return body.trim();
}

/** A seeded proposal never tells the human to approve and seeds `Human steps` as None. */
function assertHumanStepsNone(markdown: string, label: string): void {
  assert.equal(sectionBody(markdown, HUMAN_STEPS), 'None', `${label} must seed Human steps None`);
  assert.equal(markdown.includes('osq approve'), false, `${label} must not mention osq approve`);
}

describe('Seeded proposal human steps', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-proposal-seed-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('osq new seeds ## Human steps as None without osq approve', async () => {
    const spec = await createNewSpec(tmpDir, 'Seed Human Steps');
    const proposal = await fs.readFile(path.join(spec.folderPath, 'proposal.md'), 'utf8');
    assertHumanStepsNone(proposal, 'seeded proposal');
  });

  it('the unreadable-template fallback matches the seeded proposal', () => {
    assertHumanStepsNone(FALLBACK_PROPOSAL_MD, 'fallback proposal');
  });

  it('the osq schema instruction says Human steps never include osq approve', async () => {
    const schema = parseYaml(await fs.readFile(SCHEMA_PATH, 'utf8')) as {
      artifacts: Array<{ id: string; instruction: string }>;
    };
    const proposal = schema.artifacts.find((artifact) => artifact.id === 'proposal');
    assert.ok(proposal, 'schema must declare a proposal artifact');
    assert.ok(
      proposal.instruction.includes('never including `osq approve`'),
      'schema instruction must say Human steps never include osq approve',
    );
  });
});
