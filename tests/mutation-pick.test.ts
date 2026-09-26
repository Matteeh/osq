import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import type { TraceabilityConfig } from '../src/core/foundation/config.js';
import { buildImportGraph } from '../src/core/spec/import-graph.js';
import { hashFunctionRange } from '../src/core/trace/function-ranges.js';
import { pickMutations } from '../src/core/trace/mutation-pick.js';
import { buildScenarioIndex } from '../src/core/trace/scenario-index.js';

const roots: string[] = [];

/** Create a temporary project holding `files` keyed by relative POSIX path. */
async function makeProject(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-mutation-pick-'));
  roots.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, relative);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf8');
  }
  return root;
}

afterEach(async () => {
  while (roots.length > 0) {
    await fs.rm(roots.pop() ?? '', { recursive: true, force: true });
  }
});

const QUOTE_FILE = 'src/pricing/quote.ts';
const PRICING = { capabilities: 'all', mode: 'warn' } as const satisfies TraceabilityConfig;

const QUOTE_SOURCE = [
  '/** The tier unit price. */',
  'function tierPrice(quantity: number): number {',
  '  return quantity >= 500 ? 800 : 1000;',
  '}',
  '',
  '/**',
  ' * Price one quote.',
  ' *',
  ' * @scenario pricing: Volume discount tiers',
  ' * @scenario pricing: A percentage code comes off the tiered subtotal',
  ' */',
  'export function quote(quantity: number): number {',
  '  return quantity * tierPrice(quantity);',
  '}',
].join('\n');

/** A scenario test file importing `quote` and naming the scenario. */
function quoteTest(capability: string, name: string): string {
  return [
    "import { scenario } from '@matteeh/osq/testing';",
    "import { quote } from '../src/pricing/quote.js';",
    `scenario(${JSON.stringify(capability)}, ${JSON.stringify(name)}, { covers: quote }, () => {});`,
    '',
  ].join('\n');
}

/** The scenario index for a project. */
async function indexOf(root: string) {
  const graph = await buildImportGraph(root, { skip: ['openspec'] });
  return buildScenarioIndex(root, graph);
}

describe('mutation picks', () => {
  it('picks a changed function with both test files of its two scenarios', async () => {
    const root = await makeProject({
      [QUOTE_FILE]: QUOTE_SOURCE,
      'tests/pricing-quote.test.ts': quoteTest('pricing', 'Volume discount tiers'),
      'tests/pricing-codes.test.ts': quoteTest(
        'pricing',
        'A percentage code comes off the tiered subtotal',
      ),
    });
    const index = await indexOf(root);

    const picks = await pickMutations({
      projectRoot: root,
      index,
      traceability: PRICING,
      scope: [QUOTE_FILE],
      start: { functionHashes: {} },
      end: null,
    });

    assert.equal(picks.length, 1);
    assert.deepEqual(picks[0], {
      file: QUOTE_FILE,
      function: 'quote',
      line: 12,
      ranges: [`${QUOTE_FILE}:2-4`, `${QUOTE_FILE}:12-14`],
      scenarios: [
        'pricing: A percentage code comes off the tiered subtotal',
        'pricing: Volume discount tiers',
      ],
      tests: ['tests/pricing-codes.test.ts', 'tests/pricing-quote.test.ts'],
    });
  });

  it('picks an unchanged function a newly changed covering test names', async () => {
    const root = await makeProject({
      [QUOTE_FILE]: QUOTE_SOURCE,
      'tests/pricing-bulk.test.ts': quoteTest('pricing', 'Volume discount tiers'),
    });
    const index = await indexOf(root);

    const picks = await pickMutations({
      projectRoot: root,
      index,
      traceability: PRICING,
      scope: [],
      start: null,
      end: {
        scopeHashes: {
          'tests/pricing-bulk.test.ts': { before: null, after: 'sha256:new' },
        },
      },
    });

    assert.deepEqual(
      picks.map((pick) => `${pick.file}#${pick.function}`),
      ['src/pricing/quote.ts#quote'],
    );
  });

  it('leaves an unchanged function alone when no covering test changed', async () => {
    const root = await makeProject({
      [QUOTE_FILE]: QUOTE_SOURCE,
      'tests/pricing-quote.test.ts': quoteTest('pricing', 'Volume discount tiers'),
    });
    const index = await indexOf(root);
    const own = hashFunctionRange(QUOTE_FILE, QUOTE_SOURCE, 'quote');

    const picks = await pickMutations({
      projectRoot: root,
      index,
      traceability: PRICING,
      scope: [QUOTE_FILE, 'tests/pricing-quote.test.ts'],
      start: { functionHashes: { [`${QUOTE_FILE}#quote`]: own } },
      end: {
        scopeHashes: {
          'tests/pricing-quote.test.ts': { before: 'sha256:a', after: 'sha256:a' },
        },
      },
    });

    assert.deepEqual(picks, []);
  });

  it('does not pick a changed function whose capability is not opted in', async () => {
    const root = await makeProject({
      [QUOTE_FILE]: QUOTE_SOURCE,
      'tests/pricing-quote.test.ts': quoteTest('pricing', 'Volume discount tiers'),
    });
    const index = await indexOf(root);

    const picks = await pickMutations({
      projectRoot: root,
      index,
      traceability: { capabilities: ['shipping'], mode: 'warn' },
      scope: [QUOTE_FILE],
      start: { functionHashes: {} },
      end: null,
    });

    assert.deepEqual(picks, []);
  });

  it('does not pick a tagged function no scenario test names', async () => {
    const root = await makeProject({ [QUOTE_FILE]: QUOTE_SOURCE });
    const index = await indexOf(root);

    const picks = await pickMutations({
      projectRoot: root,
      index,
      traceability: PRICING,
      scope: [QUOTE_FILE],
      start: { functionHashes: {} },
      end: null,
    });

    assert.deepEqual(picks, []);
  });

  it('orders picks by file and then start line', async () => {
    const codes = [
      '/** @scenario pricing: Codes */',
      'export function code(): number {',
      '  return 1;',
      '}',
      '',
      '/** @scenario pricing: Codes */',
      'export function codeTwo(): number {',
      '  return 2;',
      '}',
    ].join('\n');
    const root = await makeProject({
      'src/pricing/codes.ts': codes,
      [QUOTE_FILE]: QUOTE_SOURCE,
      'tests/pricing.test.ts': [
        "import { scenario } from '@matteeh/osq/testing';",
        "import { code, codeTwo } from '../src/pricing/codes.js';",
        "import { quote } from '../src/pricing/quote.js';",
        "scenario('pricing', 'Codes', { covers: code }, () => {});",
        "scenario('pricing', 'Codes', { covers: codeTwo }, () => {});",
        "scenario('pricing', 'Volume discount tiers', { covers: quote }, () => {});",
        '',
      ].join('\n'),
    });
    const index = await indexOf(root);

    const picks = await pickMutations({
      projectRoot: root,
      index,
      traceability: PRICING,
      scope: ['src/pricing/codes.ts', QUOTE_FILE],
      start: { functionHashes: {} },
      end: null,
    });

    assert.deepEqual(
      picks.map((pick) => `${pick.file}#${pick.function}`),
      ['src/pricing/codes.ts#code', 'src/pricing/codes.ts#codeTwo', 'src/pricing/quote.ts#quote'],
    );
  });
});
