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
  'A capability is a vertical slice with every layer it needs in one folder named after it, under src or src/kernel; only kernel slices are shared.';

/** Every slice the ADR's `## Target slices` table must name as a row. */
const TARGET_SLICES = [
  'config',
  'state',
  'openspec',
  'git',
  'cli',
  'loop',
  'setup',
  'decisions',
  'plan',
  'lint',
  'approve',
  'run',
  'archive',
  'validate',
  'land',
  'harness',
  'watch',
  'status',
  'inbox',
  'report',
  'trace',
  'web',
  'server',
  'mcp',
];

/** The section from its `## ` heading line to the next same-level heading. */
function markdownSection(content: string, heading: string): string {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line === heading);
  assert.notEqual(start, -1, `the ADR must contain a \`${heading}\` section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

describe('ADR 016: capability slices is accepted and reaches every agent', () => {
  it('is accepted, applies to all, and reaches the project rules block', async () => {
    const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
    const living = await readLivingCapabilityNames(repoRoot, DEFAULT_CONFIG.paths.openspecRoot);
    const adr = records.adrs.find((entry) => entry.number === '016');

    assert.ok(adr, 'ADR 016 must be read');
    assert.equal(records.ignored.includes(adr.path), false, 'ADR 016 must not be ignored');
    assert.equal(adr.status, 'accepted');
    assert.equal(adr.appliesTo, 'all');
    assert.equal(adr.rule, RULE);
    assert.deepEqual([...adr.checks], ['tests/capability-slices.test.ts']);

    const problems = validateDecisions(records, living, DEFAULT_CONFIG);
    assert.deepEqual(problems.errors, []);
    assert.deepEqual(problems.warnings, []);

    const block = renderRulesBlock(records);
    assert.ok(block, 'the rules block must render');
    assert.match(block, / ADR 016$/m, 'the rules block must hold a line for ADR 016');
    assert.deepEqual(await checkProjectRules(repoRoot, DEFAULT_CONFIG), []);
  });

  it('is linked exactly once from the decisions index', async () => {
    const readme = await fs.readFile(
      path.join(repoRoot, DEFAULT_CONFIG.paths.decisions, 'README.md'),
      'utf8',
    );
    const links = readme.match(/016-capability-slices\.md/g) ?? [];
    assert.equal(links.length, 1, 'the index must link 016-capability-slices.md exactly once');
  });

  it('names every target slice as a table row', async () => {
    const content = await fs.readFile(
      path.join(repoRoot, DEFAULT_CONFIG.paths.decisions, '016-capability-slices.md'),
      'utf8',
    );
    const targetSlices = markdownSection(content, '## Target slices');
    const rows = targetSlices.split('\n').filter((line) => line.startsWith('| '));
    for (const name of TARGET_SLICES) {
      assert.ok(
        rows.includes(`| ${name} | Takes |`) || rows.some((row) => row.startsWith(`| ${name} |`)),
        `the Target slices table must name ${name} as a row`,
      );
    }
  });

  it('names the rejected alternatives', async () => {
    const content = await fs.readFile(
      path.join(repoRoot, DEFAULT_CONFIG.paths.decisions, '016-capability-slices.md'),
      'utf8',
    );
    const rejected = markdownSection(content, '## Rejected');
    for (const term of ['capabilities/', 'ADR 004']) {
      assert.ok(rejected.includes(term), `the Rejected section must name ${term}`);
    }
  });
});
