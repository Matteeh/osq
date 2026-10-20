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
const readme = await fs.readFile(path.join(decisionsDir, 'README.md'), 'utf8');

/** One row of the "Rust ADRs are accepted" table. */
interface RustAdrRow {
  readonly number: string;
  readonly file: string;
  readonly checks: readonly string[];
}

const ROWS: readonly RustAdrRow[] = [
  {
    number: '022',
    file: '022-rust-feature-crates.md',
    checks: ['tests/rust-adrs.test.ts', 'crates/core/tests/no_io.rs'],
  },
  {
    number: '023',
    file: '023-rust-code-style.md',
    checks: ['tests/rust-adrs.test.ts'],
  },
  {
    number: '024',
    file: '024-rust-link-enforcement.md',
    checks: [
      'tests/rust-adrs.test.ts',
      'crates/kernel/linter/tests/link_gates.rs',
      'crates/kernel/linter/tests/link_gates_corpus.rs',
    ],
  },
  {
    number: '025',
    file: '025-rust-on-disk-format.md',
    checks: ['tests/rust-adrs.test.ts', 'crates/core/tests/event_corpus.rs'],
  },
  {
    number: '026',
    file: '026-openspec-in-rust.md',
    checks: [
      'tests/rust-adrs.test.ts',
      'crates/kernel/specs/tests/golden_corpus.rs',
      'crates/kernel/specs/tests/validate_corpus.rs',
      'crates/kernel/specs/tests/replay_corpus.rs',
      'crates/kernel/specs/tests/openspec_validate_parity_corpus.rs',
      'crates/kernel/specs/tests/openspec_archive_parity_corpus.rs',
      'crates/kernel/linter/tests/node_spawn_corpus.rs',
    ],
  },
];

/** The number of times the decisions index links `file`. */
function linkCount(file: string): number {
  return (readme.match(new RegExp(file.replace(/\./g, '\\.'), 'g')) ?? []).length;
}

describe('rust-core: Rust ADRs are accepted', () => {
  for (const row of ROWS) {
    it(`lists ADR ${row.number} accepted, scoped to rust-core, with its checks and no problem`, async () => {
      const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
      const living = await readLivingCapabilityNames(repoRoot, DEFAULT_CONFIG.paths.openspecRoot);
      const adr = records.adrs.find((entry) => entry.number === row.number);

      assert.ok(adr, `ADR ${row.number} must be read`);
      assert.equal(
        records.ignored.includes(adr.path),
        false,
        `ADR ${row.number} must not be ignored`,
      );
      assert.equal(adr.status, 'accepted');
      assert.equal(adr.path, `${DEFAULT_CONFIG.paths.decisions}/${row.file}`);
      assert.deepEqual(adr.appliesTo, ['group:rust']);
      assert.equal(adr.governs === 'all', false, 'a group ADR must not govern all');
      assert.ok(
        adr.governs !== 'all' && adr.governs.includes('rust-core'),
        `ADR ${row.number} must govern rust-core`,
      );
      assert.deepEqual([...adr.checks], [...row.checks]);

      const problems = validateDecisions(records, living, DEFAULT_CONFIG);
      assert.deepEqual(problems.errors, []);
      assert.deepEqual(problems.warnings, []);

      assert.equal(linkCount(row.file), 1, `the index must link ${row.file} exactly once`);
    });
  }
});

describe('rust-core: Rules block without the Rust ADRs', () => {
  it('renders no line ending in a Rust ADR number and reports no project rule problem', async () => {
    const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
    const block = renderRulesBlock(records);
    assert.ok(block, 'the rules block must render');
    const lines = block.split('\n');
    for (const row of ROWS) {
      assert.equal(
        lines.some((line) => line.endsWith(`ADR ${row.number}`)),
        false,
        `the rules block must not name ADR ${row.number}`,
      );
    }
    assert.deepEqual(await checkProjectRules(repoRoot, DEFAULT_CONFIG), []);
  });
});

describe('rust-core: Rust ADR check files exist', () => {
  it('has every check file named by ADRs 022 to 026', async () => {
    const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
    for (const row of ROWS) {
      const adr = records.adrs.find((entry) => entry.number === row.number);
      assert.ok(adr, `ADR ${row.number} must be read`);
      for (const check of adr.checks) {
        const exists = await fs
          .stat(path.join(repoRoot, check))
          .then(() => true)
          .catch(() => false);
        assert.equal(exists, true, `${check} must exist`);
      }
    }
  });
});
