import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import {
  type DecisionRecords,
  governingAdrs,
  readDecisions,
  sameAdrNumber,
  systemWideAdrs,
  validateDecisions,
} from '../src/core/foundation/decisions.js';
import { readLivingCapabilityNames } from '../src/core/spec/digest-capability.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-decisions-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const target = path.join(tmpDir, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

function adrFile(frontmatter: string, heading: string, body = ''): string {
  return `---\n${frontmatter}\n---\n# ${heading}\n\n${body}`;
}

function read(config: OsqConfig = DEFAULT_CONFIG): Promise<DecisionRecords> {
  return readDecisions(tmpDir, config);
}

function sha256(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

function hasError(problems: { errors: readonly string[] }, fragment: string): boolean {
  return problems.errors.some((message) => message.includes(fragment));
}

function hasWarning(problems: { warnings: readonly string[] }, fragment: string): boolean {
  return problems.warnings.some((message) => message.includes(fragment));
}

describe('architecture decision records', () => {
  it('reads a frontmatter ADR with its number, title, scope, rule, and hash', async () => {
    const content = adrFile(
      'status: accepted\napplies_to: all\nrule: UI components use React.',
      '007. UI framework',
    );
    await write('decisions/007-ui-framework.md', content);

    const records = await read();
    assert.equal(records.adrs.length, 1);
    const record = records.adrs[0];
    assert.equal(record.number, '007');
    assert.equal(record.title, 'UI framework');
    assert.equal(record.path, 'decisions/007-ui-framework.md');
    assert.equal(record.status, 'accepted');
    assert.equal(record.appliesTo, 'all');
    assert.equal(record.rule, 'UI components use React.');
    assert.equal(record.supersededBy, null);
    assert.equal(record.hash, sha256(content));
    assert.deepEqual(records.ignored, []);
  });

  it('reads capability-scoped applies_to as a list', async () => {
    await write(
      'decisions/009-ingress.md',
      adrFile(
        'status: accepted\napplies_to: [ingress, cli-foundation]\nrule: One adapter serves ingress.',
        '009. Ingress adapter',
      ),
    );

    const records = await read();
    assert.deepEqual(records.adrs[0].appliesTo, ['ingress', 'cli-foundation']);
  });

  it('ignores markdown files without osq frontmatter and never lists README.md', async () => {
    await write(
      'decisions/007-ui-framework.md',
      adrFile('status: accepted\napplies_to: all\nrule: UI uses React.', '007. UI framework'),
    );
    await write('decisions/notes.md', '# Plain notes\n\nNo frontmatter here.\n');
    await write('decisions/README.md', '# Architecture Decision Records\n');
    await write('decisions/README.txt', 'Not markdown.\n');

    const records = await read();
    assert.deepEqual(
      records.adrs.map((adr) => adr.number),
      ['007'],
    );
    assert.deepEqual(records.ignored, ['decisions/notes.md']);
  });

  it('lists a frontmatter file without leading digits as ignored', async () => {
    await write(
      'decisions/ui-framework.md',
      adrFile('status: accepted\napplies_to: all\nrule: UI uses React.', 'UI framework'),
    );

    const records = await read();
    assert.deepEqual(records.adrs, []);
    assert.deepEqual(records.ignored, ['decisions/ui-framework.md']);
  });

  it('reads a missing decisions folder as no ADRs', async () => {
    const records = await read();
    assert.deepEqual(records.adrs, []);
    assert.deepEqual(records.ignored, []);
  });

  it('orders ADRs by numeric value and keeps ignored paths sorted', async () => {
    await write(
      'decisions/010-ten.md',
      adrFile('status: accepted\napplies_to: all\nrule: Ten.', '010. Ten'),
    );
    await write(
      'decisions/007-seven.md',
      adrFile('status: accepted\napplies_to: all\nrule: Seven.', '007. Seven'),
    );
    await write('decisions/zeta.md', '# zeta\n');
    await write('decisions/alpha.md', '# alpha\n');

    const records = await read();
    assert.deepEqual(
      records.adrs.map((adr) => adr.number),
      ['007', '010'],
    );
    assert.deepEqual(records.ignored, ['decisions/alpha.md', 'decisions/zeta.md']);
  });

  it('compares ADR numbers by numeric value', () => {
    assert.equal(sameAdrNumber('7', '007'), true);
    assert.equal(sameAdrNumber('007', '7'), true);
    assert.equal(sameAdrNumber('7', '8'), false);
    assert.equal(sameAdrNumber('7', 'x'), false);
  });

  it('strips the leading number from the title', async () => {
    await write(
      'decisions/012-some-title.md',
      adrFile('status: accepted\napplies_to: all\nrule: Something.', '12. Some title'),
    );

    const records = await read();
    assert.equal(records.adrs[0].title, 'Some title');
  });

  it('takes effect only for accepted ADRs', async () => {
    await write(
      'decisions/003-proposed.md',
      adrFile('status: proposed\napplies_to: all\nrule: Proposed rule.', '003. Proposed'),
    );
    await write(
      'decisions/004-superseded.md',
      adrFile(
        'status: superseded\napplies_to: all\nsuperseded_by: 007\nrule: Old rule.',
        '004. Old',
      ),
    );
    await write(
      'decisions/007-accepted.md',
      adrFile('status: accepted\napplies_to: all\nrule: Accepted rule.', '007. Accepted'),
    );

    const records = await read();
    assert.deepEqual(
      systemWideAdrs(records).map((adr) => adr.number),
      ['007'],
    );
  });

  it('governs a change through all or a written capability', async () => {
    await write(
      'decisions/003-system.md',
      adrFile('status: accepted\napplies_to: all\nrule: System rule.', '003. System'),
    );
    await write(
      'decisions/007-ingress.md',
      adrFile('status: accepted\napplies_to: [ingress]\nrule: Ingress rule.', '007. Ingress'),
    );
    await write(
      'decisions/009-other.md',
      adrFile('status: accepted\napplies_to: [other]\nrule: Other rule.', '009. Other'),
    );
    await write(
      'decisions/011-proposed.md',
      adrFile('status: proposed\napplies_to: [ingress]\nrule: Draft rule.', '011. Draft'),
    );

    const records = await read();
    const governing = governingAdrs(records, ['ingress']);
    assert.deepEqual(
      governing.map((adr) => adr.number),
      ['003', '007'],
    );
  });
});

describe('architecture decision validation', () => {
  async function problemsFor(content: string, config: OsqConfig = DEFAULT_CONFIG) {
    await write('decisions/007-adr.md', content);
    const records = await read(config);
    return validateDecisions(records, [], config);
  }

  it('reports an error for a status outside the three values', async () => {
    const problems = await problemsFor(
      adrFile('status: draft\napplies_to: all\nrule: Draft rule.', '007. Draft'),
    );
    assert.equal(hasError(problems, 'decisions/007-adr.md'), true);
    assert.equal(hasError(problems, 'status'), true);
  });

  it('reports an error for an accepted ADR without a valid applies_to', async () => {
    for (const frontmatter of [
      'status: accepted\nrule: A rule.',
      'status: accepted\napplies_to: []\nrule: A rule.',
      'status: accepted\napplies_to: [""]\nrule: A rule.',
    ]) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      await fs.mkdir(tmpDir, { recursive: true });
      const problems = await problemsFor(adrFile(frontmatter, '007. ADR'));
      assert.equal(hasError(problems, 'decisions/007-adr.md'), true);
      assert.equal(hasError(problems, 'applies_to'), true);
    }
  });

  it('reports an error for an accepted ADR with a missing or multi-line rule', async () => {
    const missing = await problemsFor(adrFile('status: accepted\napplies_to: all', '007. ADR'));
    assert.equal(hasError(missing, 'rule'), true);

    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });
    const multiline = await problemsFor(
      adrFile(
        'status: accepted\napplies_to: all\nrule: |-\n  first line\n  second line',
        '007. ADR',
      ),
    );
    assert.equal(hasError(multiline, 'one line'), true);
  });

  it('reports an error naming the limit for a rule one character too long', async () => {
    const rule = 'x'.repeat(DEFAULT_CONFIG.limits.maxRuleLength + 1);
    const problems = await problemsFor(
      adrFile(`status: accepted\napplies_to: all\nrule: ${rule}`, '007. ADR'),
    );
    assert.equal(hasError(problems, 'decisions/007-adr.md'), true);
    assert.equal(hasError(problems, String(DEFAULT_CONFIG.limits.maxRuleLength)), true);
  });

  it('reports an error for a superseded ADR without superseded_by', async () => {
    const problems = await problemsFor(
      adrFile('status: superseded\napplies_to: all\nrule: Old rule.', '007. Old'),
    );
    assert.equal(hasError(problems, 'superseded_by'), true);
  });

  it('reports an error when superseded_by names no existing ADR', async () => {
    await write(
      'decisions/007-old.md',
      adrFile(
        'status: superseded\napplies_to: all\nsuperseded_by: 042\nrule: Old rule.',
        '007. Old',
      ),
    );
    const records = await read();
    const problems = validateDecisions(records, [], DEFAULT_CONFIG);
    assert.equal(hasError(problems, 'decisions/007-old.md'), true);
    assert.equal(hasError(problems, 'names no existing ADR'), true);
  });

  it('accepts superseded_by that names an existing ADR by numeric value', async () => {
    await write(
      'decisions/007-old.md',
      adrFile('status: superseded\napplies_to: all\nsuperseded_by: 8\nrule: Old rule.', '007. Old'),
    );
    await write(
      'decisions/008-new.md',
      adrFile('status: accepted\napplies_to: all\nrule: New rule.', '008. New'),
    );
    const records = await read();
    const problems = validateDecisions(records, [], DEFAULT_CONFIG);
    assert.deepEqual(problems.errors, []);
  });

  it('warns for each ignored file', async () => {
    await write(
      'decisions/007-adr.md',
      adrFile('status: accepted\napplies_to: all\nrule: A rule.', '007. ADR'),
    );
    await write('decisions/notes.md', '# Notes\n');
    const records = await read();
    const problems = validateDecisions(records, [], DEFAULT_CONFIG);
    assert.equal(hasWarning(problems, 'decisions/notes.md'), true);
    assert.equal(hasError(problems, 'decisions/notes.md'), false);
  });

  it('warns, not errors, for a capability with no living spec', async () => {
    await write(
      'decisions/007-ingress.md',
      adrFile('status: accepted\napplies_to: [ingress]\nrule: Ingress rule.', '007. Ingress'),
    );
    const records = await read();
    const problems = validateDecisions(records, [], DEFAULT_CONFIG);
    assert.deepEqual(problems.errors, []);
    assert.equal(hasWarning(problems, 'ingress'), true);
  });

  it('reports no error or warning for a valid accepted ADR', async () => {
    await write(
      'decisions/007-ingress.md',
      adrFile('status: accepted\napplies_to: [ingress]\nrule: Ingress rule.', '007. Ingress'),
    );
    const records = await read();
    const problems = validateDecisions(records, ['ingress'], DEFAULT_CONFIG);
    assert.deepEqual(problems.errors, []);
    assert.deepEqual(problems.warnings, []);
  });
});

describe('decision limits', () => {
  it('defaults maxRuleLength to 160 and maxProjectRules to 10', () => {
    assert.equal(DEFAULT_CONFIG.limits.maxRuleLength, 160);
    assert.equal(DEFAULT_CONFIG.limits.maxProjectRules, 10);
  });

  it('merges a configured rule length and names it', async () => {
    const config = defineConfig({ limits: { maxRuleLength: 40 } });
    await write(
      'decisions/007-adr.md',
      adrFile(`status: accepted\napplies_to: all\nrule: ${'x'.repeat(41)}`, '007. ADR'),
    );
    const records = await read(config);
    const problems = validateDecisions(records, [], config);
    assert.equal(hasError(problems, '40'), true);
  });

  it('passes a rule exactly at the configured limit', async () => {
    const config = defineConfig({ limits: { maxRuleLength: 40 } });
    await write(
      'decisions/007-adr.md',
      adrFile(`status: accepted\napplies_to: all\nrule: ${'x'.repeat(40)}`, '007. ADR'),
    );
    const records = await read(config);
    const problems = validateDecisions(records, [], config);
    assert.deepEqual(problems.errors, []);
  });
});

describe("osq's own decision records", () => {
  it('reads and validates the five accepted ADRs without error or warning', async () => {
    const records = await readDecisions(repoRoot, DEFAULT_CONFIG);
    const living = await readLivingCapabilityNames(repoRoot, DEFAULT_CONFIG.paths.openspecRoot);
    const problems = validateDecisions(records, living, DEFAULT_CONFIG);

    assert.deepEqual(
      records.adrs.map((adr) => adr.number),
      ['001', '002', '003', '004', '005'],
    );
    assert.equal(
      records.adrs.every((adr) => adr.status === 'accepted'),
      true,
    );
    assert.deepEqual(records.ignored, []);
    assert.deepEqual(problems.errors, []);
    assert.deepEqual(problems.warnings, []);
    assert.deepEqual(
      systemWideAdrs(records).map((adr) => adr.number),
      ['003'],
    );
  });
});
