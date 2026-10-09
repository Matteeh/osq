import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { readDecisions, validateDecisions } from '../src/core/foundation/decisions.js';
import { checkProjectRules } from '../src/core/foundation/rules-block.js';
import { readLivingCapabilityNames } from '../src/core/spec/digest-capability.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('server ADRs: 013 and 014', () => {
  it('names check files that exist', async () => {
    const records = await readDecisions(REPO_ROOT, DEFAULT_CONFIG);

    for (const number of ['013', '014']) {
      const adr = records.adrs.find((entry) => entry.number === number);
      assert.ok(adr, `ADR ${number} must be read`);
      for (const check of adr.checks) {
        await fs
          .access(path.join(REPO_ROOT, check))
          .catch(() => assert.fail(`ADR ${number} check ${check} must exist`));
      }
    }
  });

  it('validates with no error and no warning', async () => {
    const records = await readDecisions(REPO_ROOT, DEFAULT_CONFIG);
    const living = await readLivingCapabilityNames(REPO_ROOT, DEFAULT_CONFIG.paths.openspecRoot);
    const problems = validateDecisions(records, living, DEFAULT_CONFIG);

    assert.deepEqual(problems.errors, []);
    assert.deepEqual(problems.warnings, []);
  });

  it('leaves the project rules block unchanged', async () => {
    assert.deepEqual(await checkProjectRules(REPO_ROOT, DEFAULT_CONFIG), []);
  });
});
