import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { buildImportGraph } from '../src/core/spec/import-graph.js';
import { buildScenarioIndex } from '../src/core/trace/scenario-index.js';
import { scanSource } from '../src/core/trace/tag-scan.js';

const roots: string[] = [];

/** Create a temporary repository holding `files` keyed by relative POSIX path. */
async function makeRepo(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-trace-scan-'));
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

/** The pricing sample's source and test, written by this test rather than read from the fixture. */
const PRICING_QUOTE = [
  '/** Percentage codes, as whole percentages. */',
  'export const CODES: Readonly<Record<string, number>> = { SAVE10: 10 };',
  '',
  '/** Round half up to a whole number of cents. */',
  'function roundHalfUp(value: number): number {',
  '  return Math.floor(value + 0.5);',
  '}',
  '',
  '/** The unit price in cents for a quantity tier. */',
  'function tierPrice(quantity: number): number {',
  '  return quantity >= 500 ? 800 : 1000;',
  '}',
  '',
  '/**',
  ' * Price one quote, in integer cents.',
  ' *',
  ' * @scenario pricing: Volume discount tiers',
  ' * @scenario pricing: A percentage code comes off the tiered subtotal',
  ' * @adr 001',
  ' */',
  'export function quote(quantity: number, code?: string): number {',
  '  return roundHalfUp(quantity * tierPrice(quantity)) + (code === undefined ? 0 : 1);',
  '}',
].join('\n');

const PRICING_TEST = [
  "import assert from 'node:assert/strict';",
  "import { scenario } from '@matteeh/osq/testing';",
  "import { quote } from '../src/pricing/quote.js';",
  '',
  "scenario('pricing', 'Volume discount tiers', { covers: quote }, ({ run, each }) => {",
  "  each('the unit price follows this table', (row) => {",
  '    run(Number(row.quantity));',
  '    assert.ok(true);',
  '  });',
  '});',
  '',
  'scenario(',
  "  'pricing',",
  "  'A percentage code comes off the tiered subtotal',",
  '  { covers: quote },',
  '  ({ run, then }) => {',
  '    run(200, "SAVE10");',
  "    then('the total is 1620.00', () => assert.ok(true));",
  '  },',
  ');',
].join('\n');

describe('traceability tags', () => {
  it('reads every documented declaration form and its tags', () => {
    const declarations: Record<string, string> = {
      function: 'export function quote(x: number): number { return x; }',
      'async function': 'export async function quote(x: number): Promise<number> { return x; }',
      arrow: 'export const quote = (x: number) => x;',
      'async arrow': 'export const quote = async (x: number) => x;',
      'annotated arrow': 'export const quote: (x: number) => number = (x) => x;',
      'function expression': 'export const quote = function (x: number) { return x; };',
      'async function expression': 'export const quote = async function (x: number) { return x; };',
      'single-parameter arrow': 'export const quote = x => x;',
    };

    for (const [label, declaration] of Object.entries(declarations)) {
      const text = [
        '/**',
        ' * @scenario pricing: Volume discount tiers',
        ' * @adr 001',
        ' */',
        declaration,
      ].join('\n');
      const scan = scanSource('src/pricing/quote.ts', text);

      assert.equal(scan.functions.length, 1, label);
      assert.equal(scan.functions[0]?.name, 'quote', label);
      assert.deepEqual(
        scan.functions[0]?.scenarios,
        [{ capability: 'pricing', name: 'Volume discount tiers' }],
        label,
      );
      assert.deepEqual(scan.functions[0]?.adrs, ['001'], label);
      assert.deepEqual(scan.unreadable, [], label);
    }
  });

  it('records quote serving its scenario and ADR above an arrow const', () => {
    const text = [
      '/**',
      ' * @scenario pricing: Volume discount tiers',
      ' * @adr 001',
      ' */',
      'export const quote = (quantity: number) => quantity;',
    ].join('\n');

    const scan = scanSource('src/pricing/quote.ts', text);

    assert.deepEqual(scan.functions, [
      {
        file: 'src/pricing/quote.ts',
        line: 5,
        name: 'quote',
        scenarios: [{ capability: 'pricing', name: 'Volume discount tiers' }],
        adrs: ['001'],
      },
    ]);
  });

  it('records a tag above an unread form as unreadable', () => {
    const text = [
      '/**',
      ' * @scenario pricing: Volume discount tiers',
      ' */',
      'export default function (quantity: number) { return quantity; }',
    ].join('\n');

    const scan = scanSource('src/pricing/quote.ts', text);

    assert.deepEqual(scan.functions, []);
    assert.equal(scan.unreadable.length, 1);
    assert.equal(scan.unreadable[0]?.file, 'src/pricing/quote.ts');
    assert.equal(scan.unreadable[0]?.line, 2);
  });

  it('carries several tags on one function', () => {
    const text = [
      '/**',
      ' * @scenario pricing: Volume discount tiers',
      ' * @scenario pricing: A percentage code comes off the tiered subtotal',
      ' * @adr 001',
      ' * @adr 002',
      ' */',
      'export function quote(): void {}',
    ].join('\n');

    const scan = scanSource('src/pricing/quote.ts', text);

    assert.deepEqual(scan.functions[0]?.scenarios, [
      { capability: 'pricing', name: 'Volume discount tiers' },
      { capability: 'pricing', name: 'A percentage code comes off the tiered subtotal' },
    ]);
    assert.deepEqual(scan.functions[0]?.adrs, ['001', '002']);
    assert.deepEqual(scan.unreadable, []);
  });

  it('records every exported function, tagged or not', () => {
    const text = 'export const quote = () => 1;\nexport function other(): void {}\n';

    const scan = scanSource('src/pricing/quote.ts', text);

    assert.deepEqual(
      scan.functions.map((fn) => fn.name),
      ['quote', 'other'],
    );
    assert.deepEqual(scan.functions[0]?.scenarios, []);
    assert.deepEqual(scan.functions[1]?.adrs, []);
  });

  it('records a tag in a // comment as unreadable', () => {
    const text = [
      '// @scenario pricing: Volume discount tiers',
      'export function quote(): void {}',
    ].join('\n');

    const scan = scanSource('src/pricing/quote.ts', text);

    assert.deepEqual(scan.functions[0]?.scenarios, []);
    assert.equal(scan.unreadable[0]?.line, 1);
    assert.match(scan.unreadable[0]?.reason ?? '', /attached/);
  });

  it('records a blank line between the comment and the declaration as unreadable', () => {
    const text = [
      '/**',
      ' * @scenario pricing: Volume discount tiers',
      ' */',
      '',
      'export function quote(): void {}',
    ].join('\n');

    const scan = scanSource('src/pricing/quote.ts', text);

    assert.deepEqual(scan.functions[0]?.scenarios, []);
    assert.equal(scan.unreadable.length, 1);
    assert.equal(scan.unreadable[0]?.line, 2);
  });

  it('records an @adr without digits as unreadable', () => {
    const text = [
      '/**',
      ' * @scenario pricing: Volume discount tiers',
      ' * @adr abc',
      ' */',
      'export function quote(): void {}',
    ].join('\n');

    const scan = scanSource('src/pricing/quote.ts', text);

    assert.deepEqual(scan.functions[0]?.adrs, []);
    assert.equal(scan.unreadable.length, 1);
    assert.equal(scan.unreadable[0]?.line, 3);
    assert.match(scan.unreadable[0]?.reason ?? '', /adr/i);
  });

  it('records a @scenario without a capability and name as unreadable', () => {
    const text = ['/**', ' * @scenario pricing', ' */', 'export function quote(): void {}'].join(
      '\n',
    );

    const scan = scanSource('src/pricing/quote.ts', text);

    assert.deepEqual(scan.functions[0]?.scenarios, []);
    assert.equal(scan.unreadable.length, 1);
    assert.match(scan.unreadable[0]?.reason ?? '', /scenario/);
  });
});

describe('scenario calls', () => {
  /** A scenario test file holding one call after the testing import. */
  function callFile(call: string): string {
    return `import { scenario } from '@matteeh/osq/testing';\n${call}\n`;
  }

  it('reads every call to scenario with literal capability, name, and covers', () => {
    const scan = scanSource(
      'tests/pricing-quote.test.ts',
      callFile("scenario('pricing', 'Volume discount tiers', { covers: quote });"),
    );

    assert.equal(scan.scenarioTestFile, true);
    assert.deepEqual(scan.calls, [
      {
        file: 'tests/pricing-quote.test.ts',
        line: 2,
        capability: 'pricing',
        name: 'Volume discount tiers',
        covers: 'quote',
      },
    ]);
    assert.deepEqual(scan.unreadable, []);
  });

  it('reads a call spanning three lines', () => {
    const scan = scanSource(
      'tests/pricing-quote.test.ts',
      callFile(
        [
          'scenario(',
          "  'pricing',",
          "  'A percentage code comes off the tiered subtotal',",
          '  { covers: quote },',
          '  () => {},',
          ');',
        ].join('\n'),
      ),
    );

    assert.equal(scan.calls[0]?.line, 2);
    assert.equal(scan.calls[0]?.name, 'A percentage code comes off the tiered subtotal');
    assert.equal(scan.calls[0]?.covers, 'quote');
  });

  it('reads double-quoted literals', () => {
    const scan = scanSource(
      'tests/pricing-quote.test.ts',
      callFile('scenario("pricing", "Volume discount tiers", { covers: quote });'),
    );

    assert.equal(scan.calls[0]?.capability, 'pricing');
    assert.equal(scan.calls[0]?.name, 'Volume discount tiers');
  });

  it('records a non-literal name as unreadable', () => {
    const scan = scanSource(
      'tests/pricing-quote.test.ts',
      callFile("scenario('pricing', NAME, { covers: quote }, () => {});"),
    );

    assert.deepEqual(scan.calls, []);
    assert.equal(scan.unreadable.length, 1);
    assert.match(scan.unreadable[0]?.reason ?? '', /name/);
  });

  it('records a template literal name as unreadable', () => {
    const scan = scanSource(
      'tests/pricing-quote.test.ts',
      callFile("scenario('pricing', `Volume discount tiers`, { covers: quote });"),
    );

    assert.deepEqual(scan.calls, []);
    assert.match(scan.unreadable[0]?.reason ?? '', /name/);
  });

  it('records covers bound to a member expression as unreadable', () => {
    const scan = scanSource(
      'tests/pricing-quote.test.ts',
      callFile("scenario('pricing', 'Volume discount tiers', { covers: pricing.quote });"),
    );

    assert.deepEqual(scan.calls, []);
    assert.match(scan.unreadable[0]?.reason ?? '', /covers/);
  });

  it('records a non-literal capability as unreadable', () => {
    const scan = scanSource(
      'tests/pricing-quote.test.ts',
      callFile("scenario(NAME, 'Volume discount tiers', { covers: quote });"),
    );

    assert.deepEqual(scan.calls, []);
    assert.match(scan.unreadable[0]?.reason ?? '', /capability/);
  });

  it('records an aliased scenario import as unreadable', () => {
    const text = [
      "import { scenario as prove } from '@matteeh/osq/testing';",
      "prove('pricing', 'Volume discount tiers', { covers: quote });",
    ].join('\n');

    const scan = scanSource('tests/pricing-quote.test.ts', text);

    assert.equal(scan.scenarioTestFile, true);
    assert.deepEqual(scan.calls, []);
    assert.equal(scan.unreadable.length, 1);
    assert.equal(scan.unreadable[0]?.line, 1);
    assert.match(scan.unreadable[0]?.reason ?? '', /another name/);
  });

  it('does not scan calls when the file imports no testing helper', () => {
    const text = [
      "import { scenario } from 'somewhere-else';",
      "scenario('pricing', 'Volume discount tiers', { covers: quote });",
    ].join('\n');

    const scan = scanSource('src/pricing/quote.ts', text);

    assert.equal(scan.scenarioTestFile, false);
    assert.deepEqual(scan.calls, []);
    assert.deepEqual(scan.unreadable, []);
  });
});

describe('scenario index', () => {
  it('says the test covers the tagged function', async () => {
    const root = await makeRepo({
      'src/pricing/quote.ts': [
        '/**',
        ' * @scenario pricing: Volume discount tiers',
        ' */',
        'export function quote(quantity: number): number {',
        '  return quantity;',
        '}',
      ].join('\n'),
      'tests/pricing-quote.test.ts': [
        "import { scenario } from '@matteeh/osq/testing';",
        "import { quote } from '../src/pricing/quote.js';",
        "scenario('pricing', 'Volume discount tiers', { covers: quote }, () => {});",
      ].join('\n'),
    });
    const graph = await buildImportGraph(root);

    const index = buildScenarioIndex(root, graph);

    assert.ok(index.covers('tests/pricing-quote.test.ts', 'src/pricing/quote.ts', 'quote'));
    assert.deepEqual(index.testsNaming('pricing', 'Volume discount tiers'), [
      'tests/pricing-quote.test.ts',
    ]);
    assert.deepEqual(index.coveringTests('src/pricing/quote.ts', 'quote'), [
      'tests/pricing-quote.test.ts',
    ]);
    assert.deepEqual(index.unreadable, []);
  });

  it('does not cover a function the test file does not import directly', async () => {
    const root = await makeRepo({
      'src/pricing/quote.ts': 'export function quote(): number { return 1; }\n',
      'src/pricing/index.ts': "export { quote } from './quote.js';\n",
      'tests/pricing-quote.test.ts': [
        "import { scenario } from '@matteeh/osq/testing';",
        "import { quote } from '../src/pricing/index.js';",
        "scenario('pricing', 'Volume discount tiers', { covers: quote }, () => {});",
      ].join('\n'),
    });
    const graph = await buildImportGraph(root);

    const index = buildScenarioIndex(root, graph);

    assert.equal(
      index.covers('tests/pricing-quote.test.ts', 'src/pricing/quote.ts', 'quote'),
      false,
    );
    assert.deepEqual(index.coveringTests('src/pricing/quote.ts', 'quote'), []);
  });

  it('does not cover a differently named function', async () => {
    const root = await makeRepo({
      'src/pricing/quote.ts': [
        'export function quote(): number { return 1; }',
        'export function tierPrice(): number { return 1; }',
      ].join('\n'),
      'tests/pricing-quote.test.ts': [
        "import { scenario } from '@matteeh/osq/testing';",
        "import { quote } from '../src/pricing/quote.js';",
        "scenario('pricing', 'Volume discount tiers', { covers: quote }, () => {});",
      ].join('\n'),
    });
    const graph = await buildImportGraph(root);

    const index = buildScenarioIndex(root, graph);

    assert.ok(index.covers('tests/pricing-quote.test.ts', 'src/pricing/quote.ts', 'quote'));
    assert.equal(
      index.covers('tests/pricing-quote.test.ts', 'src/pricing/quote.ts', 'tierPrice'),
      false,
    );
  });

  it('indexes the written pricing sample with the test covering quote and nothing unreadable', async () => {
    const root = await makeRepo({
      'src/pricing/quote.ts': `${PRICING_QUOTE}\n`,
      'tests/pricing-quote.test.ts': `${PRICING_TEST}\n`,
    });
    const graph = await buildImportGraph(root);

    const index = buildScenarioIndex(root, graph);

    assert.ok(index.covers('tests/pricing-quote.test.ts', 'src/pricing/quote.ts', 'quote'));
    assert.deepEqual(index.testsNaming('pricing', 'Volume discount tiers'), [
      'tests/pricing-quote.test.ts',
    ]);
    assert.deepEqual(
      index.testsNaming('pricing', 'A percentage code comes off the tiered subtotal'),
      ['tests/pricing-quote.test.ts'],
    );
    assert.deepEqual(index.scenariosInFile('tests/pricing-quote.test.ts'), [
      { capability: 'pricing', name: 'A percentage code comes off the tiered subtotal' },
      { capability: 'pricing', name: 'Volume discount tiers' },
    ]);
    assert.deepEqual(index.unreadable, []);
    assert.deepEqual(index.scenarioTestFiles, ['tests/pricing-quote.test.ts']);
    assert.deepEqual(index.files, graph.files);
  });
});
