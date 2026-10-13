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

const RULE =
  "A path's language comes from its nearest manifest; language-specific code sits behind the languages kernel adapter, and a gate names the languages it misses.";

/** The section from its `## ` heading line to the next same-level heading. */
function markdownSection(content: string, heading: string): string {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line === heading);
  assert.notEqual(start, -1, `the ADR must contain a \`${heading}\` section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

describe('ADR 017: language support is accepted and reaches every agent', () => {
  it('is accepted, applies to all, and reaches the project rules block', async () => {
    const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
    const living = await readLivingCapabilityNames(repoRoot, DEFAULT_CONFIG.paths.openspecRoot);
    const adr = records.adrs.find((entry) => entry.number === '017');

    assert.ok(adr, 'ADR 017 must be read');
    assert.equal(records.ignored.includes(adr.path), false, 'ADR 017 must not be ignored');
    assert.equal(adr.status, 'accepted');
    assert.equal(adr.appliesTo, 'all');
    assert.equal(adr.rule, RULE);
    assert.deepEqual([...adr.checks], []);

    const problems = validateDecisions(records, living, DEFAULT_CONFIG);
    assert.deepEqual(problems.errors, []);
    assert.deepEqual(problems.warnings, []);

    const block = renderRulesBlock(records);
    assert.ok(block, 'the rules block must render');
    assert.match(block, / ADR 017$/m, 'the rules block must hold a line for ADR 017');
    assert.deepEqual(await checkProjectRules(repoRoot, DEFAULT_CONFIG), []);
  });

  it('is linked exactly once from the decisions index', async () => {
    const readme = await fs.readFile(
      path.join(repoRoot, DEFAULT_CONFIG.paths.decisions, 'README.md'),
      'utf8',
    );
    const links = readme.match(/017-language-support\.md/g) ?? [];
    assert.equal(links.length, 1, 'the index must link 017-language-support.md exactly once');
  });

  it('names the seam in its Decision section and the rejected parser', async () => {
    const content = await fs.readFile(
      path.join(repoRoot, DEFAULT_CONFIG.paths.decisions, '017-language-support.md'),
      'utf8',
    );
    const decision = markdownSection(content, '## Decision');
    for (const term of ['src/kernel/languages/', 'Cargo.toml', 'JUnit XML', 'ADR 006']) {
      assert.ok(decision.includes(term), `the Decision section must name ${term}`);
    }

    const rejected = markdownSection(content, '## Rejected');
    assert.ok(rejected.includes('tree-sitter'), 'the Rejected section must name tree-sitter');
  });
});
