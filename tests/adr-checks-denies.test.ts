import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { doctorCommand } from '../src/cli/doctor.js';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { readDecisions, validateDecisions } from '../src/core/foundation/decisions.js';
import { checkDecisions } from '../src/core/foundation/doctor-decisions.js';
import { runDoctorChecks } from '../src/core/foundation/doctor.js';
import { writeRulesBlock } from '../src/core/foundation/rules-block.js';
import { OPENSPEC_EXPECTED_VERSION } from '../src/core/spec/openspec-version.js';

const CONFIG = DEFAULT_CONFIG;

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-adr-checks-'));
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

function hasError(problems: { errors: readonly string[] }, fragment: string): boolean {
  return problems.errors.some((message) => message.includes(fragment));
}

function read(config: OsqConfig = CONFIG) {
  return readDecisions(tmpDir, config);
}

async function problemsFor(frontmatter: string) {
  await write('decisions/009-adr.md', adrFile(frontmatter, '009. ADR'));
  const records = await read();
  return validateDecisions(records, [], CONFIG);
}

async function doctorDecisions(): Promise<string> {
  const report = await runDoctorChecks(tmpDir, {
    loadConfig: async () => CONFIG,
    probeValidator: async () => OPENSPEC_EXPECTED_VERSION,
  });
  const check = report.checks.find((entry) => entry.name === 'decisions');
  assert.ok(check, 'decisions check is present');
  return `${check.ok ? 'ok' : 'fail'}: ${check.message}`;
}

describe('decision checks and denied packages', () => {
  it('reads checks and denies from an accepted ADR', async () => {
    await write(
      'decisions/009-adapter-imports.md',
      adrFile(
        [
          'status: accepted',
          'applies_to: all',
          'rule: Adapter imports stay inside the harness layer.',
          'checks: [./tests/adapter-imports.test.ts]',
          'denies: [vue, "@vue/runtime-core"]',
        ].join('\n'),
        '009. Adapter imports',
      ),
    );

    const records = await read();
    const adr = records.adrs[0];
    assert.deepEqual(adr.checks, ['tests/adapter-imports.test.ts']);
    assert.deepEqual(adr.denies, ['vue', '@vue/runtime-core']);
    assert.deepEqual(adr.malformed, []);
  });

  it('normalizes check paths to forward slashes without a leading ./', async () => {
    await write(
      'decisions/009-adr.md',
      adrFile(
        [
          'status: accepted',
          'applies_to: all',
          'rule: A rule.',
          "checks: ['tests\\win\\x.test.ts', ./tests/b.test.ts]",
        ].join('\n'),
        '009. ADR',
      ),
    );

    const records = await read();
    assert.deepEqual(records.adrs[0].checks, ['tests/win/x.test.ts', 'tests/b.test.ts']);
  });

  it('reads missing fields as empty lists', async () => {
    await write(
      'decisions/009-adr.md',
      adrFile('status: proposed\napplies_to: all\nrule: A rule.', '009. ADR'),
    );

    const records = await read();
    assert.deepEqual(records.adrs[0].checks, []);
    assert.deepEqual(records.adrs[0].denies, []);
    assert.deepEqual(records.adrs[0].malformed, []);
  });

  it('marks a non-list denies and reports an error naming the ADR and field', async () => {
    const problems = await problemsFor(
      'status: accepted\napplies_to: all\nrule: A rule.\ndenies: vue',
    );

    const records = await read();
    assert.deepEqual(records.adrs[0].denies, []);
    assert.deepEqual(records.adrs[0].malformed, ['denies']);
    assert.equal(hasError(problems, 'decisions/009-adr.md'), true);
    assert.equal(hasError(problems, 'denies'), true);
  });

  it('marks a checks entry that is not a non-empty string', async () => {
    const problems = await problemsFor(
      'status: accepted\napplies_to: all\nrule: A rule.\nchecks: [""]',
    );

    const records = await read();
    assert.deepEqual(records.adrs[0].checks, []);
    assert.deepEqual(records.adrs[0].malformed, ['checks']);
    assert.equal(hasError(problems, 'decisions/009-adr.md'), true);
    assert.equal(hasError(problems, 'checks'), true);
  });

  it('reports one error per malformed field', async () => {
    const problems = await problemsFor(
      'status: accepted\napplies_to: all\nrule: A rule.\nchecks: tests/a.test.ts\ndenies: vue',
    );

    const records = await read();
    assert.deepEqual(records.adrs[0].malformed, ['checks', 'denies']);
    const malformedErrors = problems.errors.filter((message) =>
      message.includes('list of non-empty strings'),
    );
    assert.equal(malformedErrors.length, 2);
    assert.equal(
      malformedErrors.some((message) => message.includes('checks')),
      true,
    );
    assert.equal(
      malformedErrors.some((message) => message.includes('denies')),
      true,
    );
  });
});

describe('decision check files in doctor', () => {
  it('fails on a missing check file of an accepted ADR', async () => {
    await write(
      'decisions/009-adapter-imports.md',
      adrFile(
        [
          'status: accepted',
          'applies_to: all',
          'rule: Adapter imports stay inside the harness layer.',
          'checks: [tests/adapter-imports.test.ts]',
        ].join('\n'),
        '009. Adapter imports',
      ),
    );

    const check = await checkDecisions(tmpDir, CONFIG);
    assert.equal(check?.ok, false);
    assert.equal(check?.message.includes('decisions/009-adapter-imports.md'), true);
    assert.equal(check?.message.includes('tests/adapter-imports.test.ts'), true);

    const lines: string[] = [];
    await doctorCommand({
      cwd: tmpDir,
      stdout: (line) => lines.push(line),
      exit: () => {},
      report: await runDoctorChecks(tmpDir, {
        loadConfig: async () => CONFIG,
        probeValidator: async () => OPENSPEC_EXPECTED_VERSION,
      }),
    });
    assert.equal(
      lines.some(
        (line) =>
          line.startsWith('[fail] decisions:') &&
          line.includes('decisions/009-adapter-imports.md') &&
          line.includes('tests/adapter-imports.test.ts'),
      ),
      true,
    );
  });

  it('passes when the accepted ADR check file exists', async () => {
    await write('tests/adapter-imports.test.ts', '// present\n');
    await write(
      'decisions/009-adapter-imports.md',
      adrFile(
        [
          'status: accepted',
          'applies_to: all',
          'rule: Adapter imports stay inside the harness layer.',
          'checks: [tests/adapter-imports.test.ts]',
        ].join('\n'),
        '009. Adapter imports',
      ),
    );
    await writeRulesBlock(tmpDir, CONFIG);

    const check = await checkDecisions(tmpDir, CONFIG);
    assert.equal(check?.ok, true);
  });

  it('names both the ADR path and the file in the failure message', async () => {
    await write(
      'decisions/009-adapter-imports.md',
      adrFile(
        [
          'status: accepted',
          'applies_to: all',
          'rule: Adapter imports stay inside the harness layer.',
          'checks: [tests/adapter-imports.test.ts]',
        ].join('\n'),
        '009. Adapter imports',
      ),
    );

    const message = await doctorDecisions();
    assert.equal(message.startsWith('fail:'), true);
    assert.equal(
      message.includes(
        'decisions/009-adapter-imports.md: check file tests/adapter-imports.test.ts does not exist',
      ),
      true,
    );
  });

  it('does not fail a superseded ADR with a missing check file', async () => {
    await write(
      'decisions/010-current.md',
      adrFile('status: accepted\napplies_to: all\nrule: Current rule.', '010. Current'),
    );
    await write(
      'decisions/009-old.md',
      adrFile(
        [
          'status: superseded',
          'applies_to: all',
          'superseded_by: 010',
          'rule: Old rule.',
          'checks: [tests/missing.test.ts]',
        ].join('\n'),
        '009. Old',
      ),
    );
    await writeRulesBlock(tmpDir, CONFIG);

    const check = await checkDecisions(tmpDir, CONFIG);
    assert.equal(check?.ok, true);
    assert.equal(check?.message, '2 ADRs valid');
  });

  it('does not fail a proposed ADR with a missing check file', async () => {
    await write(
      'decisions/009-draft.md',
      adrFile(
        [
          'status: proposed',
          'applies_to: all',
          'rule: Draft rule.',
          'checks: [tests/missing.test.ts]',
        ].join('\n'),
        '009. Draft',
      ),
    );

    const check = await checkDecisions(tmpDir, CONFIG);
    assert.equal(check?.ok, true);
  });
});
