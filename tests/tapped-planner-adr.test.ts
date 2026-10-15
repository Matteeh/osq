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
  'A planner a human starts with a tap or osq plan --run runs detached, as ADR 018 runs one; it writes only the change folder, and a human approves.';

/** The section from its `## ` heading line to the next same-level heading. */
function markdownSection(content: string, heading: string): string {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line === heading);
  assert.notEqual(start, -1, `the ADR must contain a \`${heading}\` section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

describe('ADR 019: the tapped planner is accepted and reaches the project', () => {
  it('is accepted for its capabilities and reports no problem', async () => {
    const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
    const living = await readLivingCapabilityNames(repoRoot, DEFAULT_CONFIG.paths.openspecRoot);
    const adr = records.adrs.find((entry) => entry.number === '019');

    assert.ok(adr, 'ADR 019 must be read');
    assert.equal(records.ignored.includes(adr.path), false, 'ADR 019 must not be ignored');
    assert.equal(adr.status, 'accepted');
    assert.ok(Array.isArray(adr.appliesTo), 'applies_to must be a capability list');
    assert.deepEqual(adr.appliesTo, ['cli-foundation', 'watcher-and-harness', 'web-inspection']);
    assert.equal(adr.rule, RULE);
    assert.deepEqual([...adr.checks], []);

    const problems = validateDecisions(records, living, DEFAULT_CONFIG);
    assert.deepEqual(problems.errors, []);
    assert.deepEqual(problems.warnings, []);
  });

  it('keeps the project rules block free of ADR 019', async () => {
    const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
    const block = renderRulesBlock(records);
    assert.ok(block, 'the rules block must render');
    const lines = block.split('\n');
    assert.equal(
      lines.some((line) => line.endsWith('ADR 019')),
      false,
      'ADR 019 does not apply to all, so the rules block must not name it',
    );
    assert.deepEqual(await checkProjectRules(repoRoot, DEFAULT_CONFIG), []);
  });

  it('is linked exactly once from the decisions index', async () => {
    const readme = await fs.readFile(
      path.join(repoRoot, DEFAULT_CONFIG.paths.decisions, 'README.md'),
      'utf8',
    );
    const links = readme.match(/019-tapped-planner\.md/g) ?? [];
    assert.equal(links.length, 1, 'the index must link 019-tapped-planner.md exactly once');
  });

  it('names the mechanism in its Decision section and the rejected in-place plan', async () => {
    const content = await fs.readFile(
      path.join(repoRoot, DEFAULT_CONFIG.paths.decisions, '019-tapped-planner.md'),
      'utf8',
    );
    const decision = markdownSection(content, '## Decision');
    for (const term of ['osq plan <id> --run', '.run/plan-run.md', '.planning', 'ADR 018']) {
      assert.ok(decision.includes(term), `the Decision section must name ${term}`);
    }

    const rejected = markdownSection(content, '## Rejected');
    assert.ok(
      rejected.includes('Planning in place in the checkout'),
      'the Rejected section must name Planning in place in the checkout',
    );
  });
});
