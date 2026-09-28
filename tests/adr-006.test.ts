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
const decisionsDir = path.join(repoRoot, DEFAULT_CONFIG.paths.decisions);

describe('the decisions index', () => {
  it('links every ADR file exactly once and links only files that exist', async () => {
    const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
    const readme = await fs.readFile(path.join(decisionsDir, 'README.md'), 'utf8');
    const links = [...readme.matchAll(/\]\(([^)]+\.md)\)/g)].map((match) => match[1]);

    for (const adr of records.adrs) {
      const fileName = path.basename(adr.path);
      assert.equal(
        links.filter((link) => link === fileName).length,
        1,
        `the index must link ${fileName} exactly once`,
      );
    }

    for (const link of links) {
      await fs
        .access(path.join(decisionsDir, link))
        .catch(() => assert.fail(`the index link ${link} must name an existing file`));
    }
  });
});

describe('ADR 006: osq is the deterministic core', () => {
  it('is accepted, applies to all, and reaches the project rules block', async () => {
    const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
    const living = await readLivingCapabilityNames(repoRoot, DEFAULT_CONFIG.paths.openspecRoot);
    const adr = records.adrs.find((entry) => entry.number === '006');

    assert.ok(adr, 'ADR 006 must be read');
    assert.equal(adr.status, 'accepted');
    assert.equal(adr.appliesTo, 'all');

    const problems = validateDecisions(records, living, DEFAULT_CONFIG);
    assert.deepEqual(problems.errors, []);
    assert.deepEqual(problems.warnings, []);

    const block = renderRulesBlock(records);
    assert.ok(block, 'the rules block must render');
    assert.match(block, / ADR 006$/m, 'the rules block must hold a line for ADR 006');
    assert.deepEqual(await checkProjectRules(repoRoot, DEFAULT_CONFIG), []);
  });
});
