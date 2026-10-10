import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { readDecisions, validateDecisions } from '../src/core/foundation/decisions.js';
import { readLivingCapabilityNames } from '../src/core/spec/digest-capability.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RULE =
  'osq mcp speaks MCP over stdio itself in both protocol eras, with no SDK, and its tools write only inside one unapproved change folder.';

/** The README section from its `## ` heading to the next same-level heading. */
function readmeSection(readme: string, heading: string): string {
  const lines = readme.split('\n');
  const start = lines.findIndex((line) => line === heading);
  assert.notEqual(start, -1, `README must contain a \`${heading}\` section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

describe('ADR 015: MCP transport', () => {
  it('is accepted for cli-foundation with the requirement rule and checks', async () => {
    const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
    const living = await readLivingCapabilityNames(repoRoot, DEFAULT_CONFIG.paths.openspecRoot);
    const adr = records.adrs.find((entry) => entry.number === '015');

    assert.ok(adr, 'ADR 015 must be read');
    assert.equal(records.ignored.includes(adr.path), false, 'ADR 015 must not be ignored');
    assert.equal(adr.status, 'accepted');
    assert.deepEqual(adr.appliesTo, ['cli-foundation']);
    assert.equal(adr.rule, RULE);
    assert.deepEqual(
      [...adr.checks],
      [
        'tests/mcp-protocol.test.ts',
        'tests/mcp-files.test.ts',
        'tests/mcp-tools.test.ts',
        'tests/mcp-cli.test.ts',
      ],
    );

    const problems = validateDecisions(records, living, DEFAULT_CONFIG);
    assert.deepEqual(problems.errors, []);
    assert.deepEqual(problems.warnings, []);
  });

  it('names the MCP SDK in its Rejected section with when to revisit it', async () => {
    const content = await fs.readFile(
      path.join(repoRoot, DEFAULT_CONFIG.paths.decisions, '015-mcp-transport.md'),
      'utf8',
    );
    const rejected = readmeSection(content, '## Rejected');
    assert.ok(
      rejected.includes('@modelcontextprotocol'),
      'Rejected must name @modelcontextprotocol',
    );
    assert.ok(rejected.includes('zod'), 'Rejected must name zod');
    assert.ok(rejected.includes('2026-07-28'), 'Rejected must name the 2026-07-28 era');
    assert.ok(rejected.includes('mcp-protocol.ts'), 'Rejected must name the one file that changes');
  });

  it('follows the ADR 014 body shape', async () => {
    const content = await fs.readFile(
      path.join(repoRoot, DEFAULT_CONFIG.paths.decisions, '015-mcp-transport.md'),
      'utf8',
    );

    assert.match(content, /^# 015\. MCP transport$/m);
    assert.match(content, /^Date: 2026-10-09$/m);
    for (const heading of [
      '## Status',
      '## Context',
      '## Decision',
      '## Consequences',
      '## Rejected',
    ]) {
      assert.ok(content.includes(`${heading}\n`), `ADR 015 must have a ${heading} section`);
    }
  });

  it('is linked exactly once from the decisions index', async () => {
    const readme = await fs.readFile(
      path.join(repoRoot, DEFAULT_CONFIG.paths.decisions, 'README.md'),
      'utf8',
    );
    const links = readme.match(/015-mcp-transport\.md/g) ?? [];
    assert.equal(links.length, 1, 'the index must link 015-mcp-transport.md exactly once');
    assert.match(
      readme,
      /- \[015\. MCP transport\]\(015-mcp-transport\.md\)\n/,
      'the index must link ADR 015 by its title',
    );
  });
});
