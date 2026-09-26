import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { readDecisions, validateDecisions } from '../src/core/foundation/decisions.js';
import { checkProjectRules, writeRulesBlock } from '../src/core/foundation/rules-block.js';
import { readLivingCapabilityNames } from '../src/core/spec/digest-capability.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Reads and validates a project's decisions against its living specs. */
async function problemsAt(root: string) {
  const records = await readDecisions(root, DEFAULT_CONFIG);
  const living = await readLivingCapabilityNames(root, DEFAULT_CONFIG.paths.openspecRoot);
  return { records, problems: validateDecisions(records, living, DEFAULT_CONFIG) };
}

describe("osq's own decision records", () => {
  it('reads and validates the ADRs without error or warning', async () => {
    const { records, problems } = await problemsAt(repoRoot);

    assert.equal(records.adrs.length >= 1, true);
    assert.deepEqual(records.ignored, []);
    assert.deepEqual(problems.errors, []);
    assert.deepEqual(problems.warnings, []);
    assert.deepEqual(await checkProjectRules(repoRoot, DEFAULT_CONFIG), []);
  });

  it('documents the frontmatter format in decisions/README.md', async () => {
    const readme = await fs.readFile(
      path.join(repoRoot, DEFAULT_CONFIG.paths.decisions, 'README.md'),
      'utf8',
    );

    for (const field of ['status', 'applies_to', 'rule']) {
      assert.equal(readme.includes(field), true, `README.md must describe ${field}`);
    }
  });

  it('passes the same checks with one more accepted ADR and a refreshed rules block', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-own-decisions-'));
    try {
      const decisions = path.join(root, DEFAULT_CONFIG.paths.decisions);
      await fs.cp(path.join(repoRoot, DEFAULT_CONFIG.paths.decisions), decisions, {
        recursive: true,
      });
      await fs.cp(path.join(repoRoot, 'AGENTS.md'), path.join(root, 'AGENTS.md'), {
        recursive: true,
      });
      await fs.cp(
        path.join(repoRoot, DEFAULT_CONFIG.paths.openspecRoot, 'specs'),
        path.join(root, DEFAULT_CONFIG.paths.openspecRoot, 'specs'),
        { recursive: true },
      );

      const before = await readDecisions(root, DEFAULT_CONFIG);
      const highest = before.adrs.reduce(
        (max, adr) => Math.max(max, Number.parseInt(adr.number, 10)),
        0,
      );
      const number = String(highest + 1).padStart(3, '0');
      await fs.writeFile(
        path.join(decisions, `${number}-another-decision.md`),
        `---\nstatus: accepted\napplies_to: all\nrule: Another accepted decision governs the project.\n---\n# ${number}. Another decision\n`,
        'utf8',
      );

      assert.equal(await writeRulesBlock(root, DEFAULT_CONFIG), true);

      const { records, problems } = await problemsAt(root);
      assert.equal(records.adrs.length, before.adrs.length + 1);
      assert.deepEqual(records.ignored, []);
      assert.deepEqual(problems.errors, []);
      assert.deepEqual(problems.warnings, []);
      assert.deepEqual(await checkProjectRules(root, DEFAULT_CONFIG), []);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
