import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { readDecisions, validateDecisions } from '../src/core/foundation/decisions.js';
import { checkProjectRules, renderRulesBlock } from '../src/core/foundation/rules-block.js';
import { readLivingCapabilityNames } from '../src/core/spec/digest-capability.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The README section from its `## ` heading to the next same-level heading. */
function readmeSection(readme: string, heading: string): string {
  const lines = readme.split('\n');
  const start = lines.findIndex((line) => line === heading);
  assert.notEqual(start, -1, `README must contain a \`${heading}\` section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

describe('ADR 007: role environments', () => {
  it('is accepted, applies to all, and reaches the project rules block', async () => {
    const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
    const living = await readLivingCapabilityNames(repoRoot, DEFAULT_CONFIG.paths.openspecRoot);
    const adr = records.adrs.find((entry) => entry.number === '007');

    assert.ok(adr, 'ADR 007 must be read');
    assert.equal(adr.status, 'accepted');
    assert.equal(adr.appliesTo, 'all');
    assert.deepEqual(adr.checks, ['tests/confinement-env.test.ts']);
    await fs.access(path.join(repoRoot, 'tests/confinement-env.test.ts'));

    const problems = validateDecisions(records, living, DEFAULT_CONFIG);
    assert.deepEqual(problems.errors, []);
    assert.deepEqual(problems.warnings, []);

    const block = renderRulesBlock(records);
    assert.ok(block, 'the rules block must render');
    assert.match(block, / ADR 007$/m, 'the rules block must hold a line for ADR 007');
    assert.deepEqual(await checkProjectRules(repoRoot, DEFAULT_CONFIG), []);
  });

  it('names confinement.roles in the README gates and permissions section', async () => {
    const readme = await fs.readFile(path.join(repoRoot, 'README.md'), 'utf8');
    const section = readmeSection(readme, '## Gates and permissions');
    assert.match(section, /confinement\.roles/);
  });
});
