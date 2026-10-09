import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { readDecisions, validateDecisions } from '../src/core/foundation/decisions.js';
import { readLivingCapabilityNames } from '../src/core/spec/digest-capability.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RULE =
  'osq serve binds only loopback; writes need an allowed host, a matching origin and the per-server token, one at a time, through the CLI command functions.';

describe('ADR 013: remote access', () => {
  it('is accepted for web-inspection, names its rule and checks, and supersedes ADR 009', async () => {
    const records = await readDecisions(REPO_ROOT, DEFAULT_CONFIG);
    const adr = records.adrs.find((entry) => entry.number === '013');

    assert.ok(adr, 'ADR 013 must be read');
    assert.equal(records.ignored.includes(adr.path), false);
    assert.equal(adr.status, 'accepted');
    assert.deepEqual(adr.appliesTo, ['web-inspection']);
    assert.equal(adr.rule, RULE);
    assert.deepEqual([...adr.checks], ['tests/web-actions.test.ts', 'tests/hosts-guard.test.ts']);

    const adr009 = records.adrs.find((entry) => entry.number === '009');
    assert.ok(adr009, 'ADR 009 must be read');
    assert.equal(adr009.status, 'superseded');
    assert.equal(adr009.supersededBy, '013');
  });

  it('validates with no error and no warning', async () => {
    const records = await readDecisions(REPO_ROOT, DEFAULT_CONFIG);
    const living = await readLivingCapabilityNames(REPO_ROOT, DEFAULT_CONFIG.paths.openspecRoot);
    const problems = validateDecisions(records, living, DEFAULT_CONFIG);

    assert.deepEqual(problems.errors, []);
    assert.deepEqual(problems.warnings, []);
  });

  it('is linked exactly once in the decisions index', async () => {
    const readme = await fs.readFile(
      path.join(REPO_ROOT, DEFAULT_CONFIG.paths.decisions, 'README.md'),
      'utf8',
    );
    const links = readme.match(/\]\(013-remote-access\.md\)/g) ?? [];

    assert.equal(links.length, 1);
  });
});
