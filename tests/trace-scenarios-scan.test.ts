import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenario } from '@matteeh/osq/testing';
import { buildImportGraph } from '../src/core/spec/import-graph.js';
import { buildScenarioIndex } from '../src/core/trace/scenario-index.js';
import { scanSource } from '../src/core/trace/tag-scan.js';

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixture',
  'trace',
  'pricing',
);

const FILE = 'src/pricing/quote.ts';

/** A doc comment with a scenario and an ADR above an exported arrow const. */
const ARROW_SOURCE = [
  '/**',
  ' * @scenario pricing: Volume discount tiers',
  ' * @adr 001',
  ' */',
  'export const quote = (quantity: number) => quantity;',
].join('\n');

/** The same doc comment above an unreadable default-exported function. */
const UNREADABLE_SOURCE = [
  '/**',
  ' * @scenario pricing: Volume discount tiers',
  ' */',
  'export default function (quantity: number) { return quantity; }',
].join('\n');

/** Built at runtime so this test file holds no scenario call of its own. */
const CALL_TOKEN = ['scen', 'ario'].join('');

/** A scenario test file whose call's name is not a literal. */
const NON_LITERAL_SOURCE = [
  'import { scenario } from "@matteeh/osq/testing";',
  `${CALL_TOKEN}('pricing', NAME, { covers: quote }, () => {});`,
].join('\n');

scenario('traceability', 'Tagged arrow const', { covers: scanSource }, async ({ run, then }) => {
  const scan = run(FILE, ARROW_SOURCE);
  await then('the scanner records `quote` serving that scenario and following ADR 001', () => {
    const fn = scan.functions.find((candidate) => candidate.name === 'quote');
    if (fn === undefined) throw new Error(`no quote in ${FILE}`);
    if (fn.scenarios.length !== 1) {
      throw new Error(`expected one scenario, got ${JSON.stringify(fn.scenarios)}`);
    }
    if (fn.scenarios[0]?.capability !== 'pricing') {
      throw new Error(`wrong capability: ${String(fn.scenarios[0]?.capability)}`);
    }
    if (fn.scenarios[0]?.name !== 'Volume discount tiers') {
      throw new Error(`wrong name: ${String(fn.scenarios[0]?.name)}`);
    }
    if (fn.adrs.join(',') !== '001') throw new Error(`wrong adrs: ${fn.adrs.join(',')}`);
  });
});

scenario(
  'traceability',
  'Tag above an unread form',
  { covers: scanSource },
  async ({ run, then }) => {
    const scan = run(FILE, UNREADABLE_SOURCE);
    await then('the scanner records the tag as unreadable with its file and line', () => {
      if (scan.functions.length !== 0) {
        throw new Error(`unexpected functions: ${JSON.stringify(scan.functions)}`);
      }
      if (scan.unreadable.length !== 1) {
        throw new Error(`expected one unreadable, got ${scan.unreadable.length}`);
      }
      if (scan.unreadable[0]?.file !== FILE) {
        throw new Error(`wrong file: ${String(scan.unreadable[0]?.file)}`);
      }
      if (scan.unreadable[0]?.line !== 2) {
        throw new Error(`wrong line: ${String(scan.unreadable[0]?.line)}`);
      }
    });
  },
);

scenario('traceability', 'Non-literal name', { covers: scanSource }, async ({ run, then }) => {
  const scan = run('tests/pricing-quote.test.ts', NON_LITERAL_SOURCE);
  await then("the scanner records the call as unreadable because its name isn't a literal", () => {
    if (scan.calls.length !== 0) throw new Error(`unexpected calls: ${String(scan.calls.length)}`);
    if (scan.unreadable.length !== 1) {
      throw new Error(`expected one unreadable, got ${scan.unreadable.length}`);
    }
    if (!/name/.test(scan.unreadable[0]?.reason ?? '')) {
      throw new Error(`wrong reason: ${String(scan.unreadable[0]?.reason)}`);
    }
  });
});

scenario(
  'traceability',
  'Test covers the tagged function',
  { covers: buildScenarioIndex },
  async ({ run, then }) => {
    const graph = await buildImportGraph(FIXTURE_ROOT);
    const index = run(FIXTURE_ROOT, graph);
    await then(
      'the index says that test covers `quote` in `src/pricing/quote.ts` for that scenario',
      () => {
        if (!index.covers('tests/pricing-quote.test.ts', 'src/pricing/quote.ts', 'quote')) {
          throw new Error('the index does not say the test covers quote');
        }
        const naming = index.testsNaming('pricing', 'Volume discount tiers');
        if (naming.join(',') !== 'tests/pricing-quote.test.ts') {
          throw new Error(`wrong naming: ${naming.join(',')}`);
        }
      },
    );
  },
);
