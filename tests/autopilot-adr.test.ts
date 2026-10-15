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
  'With autopilot on, a human approves the queue once; osq plans, approves, runs and lands each approved item in order and stops when recovery runs out.';

/** The section from its `## ` heading line to the next same-level heading. */
function markdownSection(content: string, heading: string): string {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line === heading);
  assert.notEqual(start, -1, `the ADR must contain a \`${heading}\` section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

describe('ADR 021: autopilot is accepted and its checks test holds it off by default', () => {
  it('is accepted for its capabilities and reports no problem', async () => {
    const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
    const living = await readLivingCapabilityNames(repoRoot, DEFAULT_CONFIG.paths.openspecRoot);
    const adr = records.adrs.find((entry) => entry.number === '021');

    assert.ok(adr, 'ADR 021 must be read');
    assert.equal(records.ignored.includes(adr.path), false, 'ADR 021 must not be ignored');
    assert.equal(adr.status, 'accepted');
    assert.ok(Array.isArray(adr.appliesTo), 'applies_to must be a capability list');
    assert.deepEqual(adr.appliesTo, [
      'watcher-and-harness',
      'cli-foundation',
      'status-inspection',
      'version-control',
    ]);
    assert.equal(adr.rule, RULE);
    assert.deepEqual([...adr.checks], ['tests/autopilot-adr.test.ts']);

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
      lines.some((line) => line.endsWith('ADR 021')),
      false,
      'ADR 021 does not apply to all, so the rules block must not name it',
    );
    assert.deepEqual(await checkProjectRules(repoRoot, DEFAULT_CONFIG), []);
  });

  it('is linked exactly once from the decisions index', async () => {
    const readme = await fs.readFile(
      path.join(repoRoot, DEFAULT_CONFIG.paths.decisions, 'README.md'),
      'utf8',
    );
    const links = readme.match(/021-autopilot\.md/g) ?? [];
    assert.equal(links.length, 1, 'the index must link 021-autopilot.md exactly once');
  });

  it('names its mechanism in its Decision, Consequences and Rejected sections', async () => {
    const content = await fs.readFile(
      path.join(repoRoot, DEFAULT_CONFIG.paths.decisions, '021-autopilot.md'),
      'utf8',
    );

    const decision = markdownSection(content, '## Decision');
    for (const term of [
      'autopilot.enabled',
      'osq queue approve',
      'autopilot.maxSteers',
      'gates.autoRetries',
      'osq approve',
      'osq land',
      'ADR 018',
      'ADR 019',
    ]) {
      assert.ok(decision.includes(term), `the Decision section must name ${term}`);
    }

    const consequences = markdownSection(
      content,
      '## Consequences for ADR 003, ADR 006 and ADR 018',
    );
    for (const term of ['ADR 003', 'ADR 006', 'ADR 018']) {
      assert.ok(consequences.includes(term), `the Consequences section must name ${term}`);
    }

    const rejected = markdownSection(content, '## Rejected');
    assert.ok(
      rejected.includes('Skipping a gate'),
      'the Rejected section must name Skipping a gate',
    );
  });

  it('leaves autopilot off by default', () => {
    const config = DEFAULT_CONFIG as unknown as Record<string, unknown>;
    const autopilot = config.autopilot;
    const enabled =
      autopilot !== null && typeof autopilot === 'object'
        ? (autopilot as { enabled?: unknown }).enabled
        : undefined;
    assert.ok(
      autopilot === undefined || enabled !== true,
      'DEFAULT_CONFIG must leave autopilot absent or with enabled not true',
    );
  });
});
