import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'node:test';
import { scenario } from '@matteeh/osq/testing';
import type { TraceabilityConfig } from '../src/core/foundation/config.js';
import { buildImportGraph } from '../src/core/spec/import-graph.js';
import { hashFunctionRange } from '../src/core/trace/function-ranges.js';
import { pickMutations } from '../src/core/trace/mutation-pick.js';
import { buildScenarioIndex } from '../src/core/trace/scenario-index.js';

const roots: string[] = [];

/** Create a temporary project holding `files` keyed by relative POSIX path. */
async function makeProject(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-scenarios-picks-'));
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

/** Assembled at runtime so this file holds no extra call token of its own. */
const CALL = `${['scen', 'ario'].join('')}(`;
const TESTING_PACKAGE = '@matteeh/osq/' + 'testing';

/** A scenario test file importing `quote` and naming the scenario. */
function quoteTest(capability: string, name: string): string {
  return [
    `import { scenario } from '${TESTING_PACKAGE}';`,
    "import { quote } from '../src/pricing/quote.js';",
    `${CALL}${JSON.stringify(capability)}, ${JSON.stringify(name)}, { covers: quote }, () => {});`,
    '',
  ].join('\n');
}

/** The scenario index for a project. */
async function indexOf(root: string) {
  const graph = await buildImportGraph(root, { skip: ['openspec'] });
  return buildScenarioIndex(root, graph);
}

scenario(
  'traceability',
  'Two scenarios, one run',
  { covers: pickMutations },
  async ({ run, then }) => {
    const root = await makeProject({
      [QUOTE_FILE]: QUOTE_SOURCE,
      'tests/pricing-quote.test.ts': quoteTest('pricing', 'Volume discount tiers'),
      'tests/pricing-codes.test.ts': quoteTest(
        'pricing',
        'A percentage code comes off the tiered subtotal',
      ),
    });
    const index = await indexOf(root);
    const picks = await run({
      projectRoot: root,
      index,
      traceability: PRICING,
      scope: [QUOTE_FILE],
      start: { functionHashes: {} },
      end: null,
    });
    await then('one pick for `quote` holds both test files', () => {
      assert.equal(picks.length, 1);
      assert.deepEqual(picks[0]?.tests, [
        'tests/pricing-codes.test.ts',
        'tests/pricing-quote.test.ts',
      ]);
    });
  },
);

scenario(
  'traceability',
  'New test for an unchanged function',
  { covers: pickMutations },
  async ({ run, then }) => {
    const root = await makeProject({
      [QUOTE_FILE]: QUOTE_SOURCE,
      'tests/pricing-bulk.test.ts': quoteTest('pricing', 'Volume discount tiers'),
    });
    const index = await indexOf(root);
    const picks = await run({
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
    await then('`quote` is picked', () => {
      assert.deepEqual(
        picks.map((pick) => `${pick.file}#${pick.function}`),
        ['src/pricing/quote.ts#quote'],
      );
    });
  },
);

scenario(
  'traceability',
  'Unchanged and untested',
  { covers: pickMutations },
  async ({ run, then }) => {
    const root = await makeProject({
      [QUOTE_FILE]: QUOTE_SOURCE,
      'tests/pricing-quote.test.ts': quoteTest('pricing', 'Volume discount tiers'),
    });
    const index = await indexOf(root);
    const own = hashFunctionRange(QUOTE_FILE, QUOTE_SOURCE, 'quote');
    const picks = await run({
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
    await then('`quote` is not picked', () => {
      assert.deepEqual(picks, []);
    });
  },
);
