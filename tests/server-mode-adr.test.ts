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
  'Server mode is an addition; an osq server runs the same command functions on its own clone, and every command keeps working locally exactly as today.';

/** The README section from its `## ` heading to the next same-level heading. */
function readmeSection(readme: string, heading: string): string {
  const lines = readme.split('\n');
  const start = lines.findIndex((line) => line === heading);
  assert.notEqual(start, -1, `README must contain a \`${heading}\` section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

describe('ADR 014: server mode is an addition', () => {
  it('is accepted, applies to all, and reaches the project rules block', async () => {
    const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
    const living = await readLivingCapabilityNames(repoRoot, DEFAULT_CONFIG.paths.openspecRoot);
    const adr = records.adrs.find((entry) => entry.number === '014');

    assert.ok(adr, 'ADR 014 must be read');
    assert.equal(records.ignored.includes(adr.path), false, 'ADR 014 must not be ignored');
    assert.equal(adr.status, 'accepted');
    assert.equal(adr.appliesTo, 'all');
    assert.equal(adr.rule, RULE);
    assert.deepEqual(
      [...adr.checks],
      [
        'tests/serve.test.ts',
        'tests/serve-actions.test.ts',
        'tests/vcs-land-publish.test.ts',
        'tests/server-command.test.ts',
      ],
    );

    const problems = validateDecisions(records, living, DEFAULT_CONFIG);
    assert.deepEqual(problems.errors, []);
    assert.deepEqual(problems.warnings, []);

    const block = renderRulesBlock(records);
    assert.ok(block, 'the rules block must render');
    assert.match(block, / ADR 014$/m, 'the rules block must hold a line for ADR 014');
    assert.deepEqual(await checkProjectRules(repoRoot, DEFAULT_CONFIG), []);
  });

  it('is linked exactly once from the decisions index', async () => {
    const readme = await fs.readFile(
      path.join(repoRoot, DEFAULT_CONFIG.paths.decisions, 'README.md'),
      'utf8',
    );
    const links = readme.match(/014-server-mode\.md/g) ?? [];
    assert.equal(links.length, 1, 'the index must link 014-server-mode.md exactly once');
  });

  it('names the rejected alternatives in its Rejected section', async () => {
    const content = await fs.readFile(
      path.join(repoRoot, DEFAULT_CONFIG.paths.decisions, '014-server-mode.md'),
      'utf8',
    );
    const rejected = readmeSection(content, '## Rejected');
    for (const term of ['systemd', 'GitHub', 'MCP tap tools', 'backend interface']) {
      assert.ok(rejected.includes(term), `the Rejected section must name ${term}`);
    }
  });
});
