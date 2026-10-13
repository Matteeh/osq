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
  'With autoSteer on, the watcher runs one planner per run steering trigger; it writes only the change folder, osq lints the plan, and a human approves.';

/** The section from its `## ` heading line to the next same-level heading. */
function markdownSection(content: string, heading: string): string {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line === heading);
  assert.notEqual(start, -1, `the ADR must contain a \`${heading}\` section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

describe('ADR 018: the steering planner is accepted and reaches the watcher', () => {
  it('is accepted for its capabilities and reports no problem', async () => {
    const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
    const living = await readLivingCapabilityNames(repoRoot, DEFAULT_CONFIG.paths.openspecRoot);
    const adr = records.adrs.find((entry) => entry.number === '018');

    assert.ok(adr, 'ADR 018 must be read');
    assert.equal(records.ignored.includes(adr.path), false, 'ADR 018 must not be ignored');
    assert.equal(adr.status, 'accepted');
    assert.ok(Array.isArray(adr.appliesTo), 'applies_to must be a capability list');
    assert.deepEqual(adr.appliesTo, ['watcher-and-harness', 'cli-foundation']);
    assert.equal(adr.rule, RULE);
    assert.deepEqual([...adr.checks], []);

    const problems = validateDecisions(records, living, DEFAULT_CONFIG);
    assert.deepEqual(problems.errors, []);
    assert.deepEqual(problems.warnings, []);
  });

  it('keeps the project rules block unchanged', async () => {
    const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
    const block = renderRulesBlock(records);
    assert.ok(block, 'the rules block must render');
    const lines = block.split('\n');
    assert.equal(
      lines.some((line) => line.endsWith('ADR 018')),
      false,
      'ADR 018 does not apply to all, so the rules block must not name it',
    );
    assert.deepEqual(await checkProjectRules(repoRoot, DEFAULT_CONFIG), []);
  });

  it('is linked exactly once from the decisions index', async () => {
    const readme = await fs.readFile(
      path.join(repoRoot, DEFAULT_CONFIG.paths.decisions, 'README.md'),
      'utf8',
    );
    const links = readme.match(/018-steering-planner\.md/g) ?? [];
    assert.equal(links.length, 1, 'the index must link 018-steering-planner.md exactly once');
  });

  it('names the mechanism in its Decision section and the rejected approval', async () => {
    const content = await fs.readFile(
      path.join(repoRoot, DEFAULT_CONFIG.paths.decisions, '018-steering-planner.md'),
      'utf8',
    );
    const decision = markdownSection(content, '## Decision');
    for (const term of [
      'autoSteer.enabled',
      '.run/auto-steer.md',
      'osq plan <id> --print',
      'ADR 007',
    ]) {
      assert.ok(decision.includes(term), `the Decision section must name ${term}`);
    }

    const rejected = markdownSection(content, '## Rejected');
    assert.ok(
      rejected.includes('Letting the planner approve'),
      'the Rejected section must name Letting the planner approve',
    );
  });
});
