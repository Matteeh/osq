import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { appliesToGroup, resolveGoverns } from '../src/core/foundation/decisions-groups.js';
import {
  type DecisionRecords,
  governingAdrs,
  readDecisions,
  validateDecisions,
} from '../src/core/foundation/decisions.js';

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    await fs.rm(roots.pop() ?? '', { recursive: true, force: true });
  }
});

async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-decisions-groups-'));
  roots.push(root);
  return root;
}

async function write(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

function adrFile(appliesTo: string, rule = 'Sales share one rule.'): string {
  return `---\nstatus: accepted\napplies_to: ${appliesTo}\nrule: ${rule}\n---\n# 009. Sales\n\n`;
}

const LIVING_SPEC = '# Capability Specification\n\n## Purpose\nA fixture capability.\n';

/** Living pricing and invoices in group `sales`, ledger in `books`, and a change creating quotes in `sales`. */
async function groupProject(): Promise<string> {
  const root = await makeRoot();
  for (const [capability, group] of [
    ['pricing', 'sales'],
    ['invoices', 'sales'],
    ['ledger', 'books'],
  ]) {
    await write(root, `openspec/specs/${capability}/spec.md`, LIVING_SPEC);
    await write(root, `openspec/specs/${capability}/osq.yml`, `group: ${group}\n`);
  }
  await write(root, 'openspec/changes/001-quotes/specs/quotes/osq.yml', 'group: sales\n');
  return root;
}

describe('ADR applying to a group', () => {
  const rows = [
    {
      appliesTo: '[group:sales]',
      kept: ['group:sales'],
      governs: ['invoices', 'pricing', 'quotes'],
    },
    {
      appliesTo: '[group:sales, ledger]',
      kept: ['group:sales', 'ledger'],
      governs: ['invoices', 'ledger', 'pricing', 'quotes'],
    },
    {
      appliesTo: '[group:sales, pricing]',
      kept: ['group:sales', 'pricing'],
      governs: ['invoices', 'pricing', 'quotes'],
    },
    { appliesTo: '[group:empty]', kept: ['group:empty'], governs: [] },
    { appliesTo: 'all', kept: 'all', governs: 'all' },
  ];

  for (const row of rows) {
    it(`resolves ${row.appliesTo}`, async () => {
      const root = await groupProject();
      await write(root, 'decisions/009-sales.md', adrFile(row.appliesTo));

      const records = await readDecisions(root, DEFAULT_CONFIG);
      assert.equal(records.adrs.length, 1);
      assert.deepEqual(records.adrs[0].appliesTo, row.kept);
      assert.deepEqual(records.adrs[0].governs, row.governs);
    });
  }
});

describe('Group ADR governs a change', () => {
  it('lists a group ADR for a capability the change sidecar gives that group', async () => {
    const root = await groupProject();
    await write(root, 'decisions/009-sales.md', adrFile('[group:sales]'));

    const records = await readDecisions(root, DEFAULT_CONFIG);
    assert.deepEqual(
      governingAdrs(records, ['quotes']).map((adr) => adr.number),
      ['009'],
    );
    assert.deepEqual(
      governingAdrs(records, ['ledger']).map((adr) => adr.number),
      [],
    );
  });
});

describe('Group validation', () => {
  const rows = [
    { appliesTo: '[group:sales]', warnings: [] },
    {
      appliesTo: '[group:drafts]',
      warnings: ['decisions/009-sales.md: applies_to group "drafts" has no living capability'],
    },
    {
      appliesTo: '[group:empty]',
      warnings: ['decisions/009-sales.md: applies_to group "empty" has no living capability'],
    },
  ];

  /** Living pricing in group `sales`, and only an active change sidecar in `drafts`. */
  async function validationProject(appliesTo: string): Promise<DecisionRecords> {
    const root = await makeRoot();
    await write(root, 'openspec/specs/pricing/spec.md', LIVING_SPEC);
    await write(root, 'openspec/specs/pricing/osq.yml', 'group: sales\n');
    await write(root, 'openspec/changes/001-drafts/specs/drafts/osq.yml', 'group: drafts\n');
    await write(root, 'decisions/009-sales.md', adrFile(appliesTo));
    return readDecisions(root, DEFAULT_CONFIG);
  }

  for (const row of rows) {
    it(`warns for ${row.appliesTo}`, async () => {
      const records = await validationProject(row.appliesTo);
      const problems = validateDecisions(records, ['pricing'], DEFAULT_CONFIG);
      assert.deepEqual(problems.errors, []);
      assert.deepEqual(problems.warnings, row.warnings);
    });
  }
});

describe('group helpers', () => {
  it('reads an entry as a group name or a capability name', () => {
    assert.equal(appliesToGroup('group:sales'), 'sales');
    assert.equal(appliesToGroup('ledger'), null);
  });

  it('resolves a null applies_to to no capabilities', () => {
    assert.deepEqual(resolveGoverns(null, new Map([['pricing', 'sales']])), []);
  });
});
