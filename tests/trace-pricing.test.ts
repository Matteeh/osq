import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scenario } from '@matteeh/osq/testing';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(REPO_ROOT, 'fixture', 'trace', 'pricing');
const TESTING_URL = pathToFileURL(path.join(REPO_ROOT, 'src', 'testing', 'index.ts')).href;
const TSX = import.meta.resolve('tsx');
const TEST_FILE = 'tests/pricing-quote.test.ts';

/** One deliberate break from the vision's "What catches what" table. */
interface Break {
  readonly message: string;
  apply(root: string): Promise<void>;
}

function specPath(root: string): string {
  return path.join(root, 'openspec', 'specs', 'pricing', 'spec.md');
}
function quotePath(root: string): string {
  return path.join(root, 'src', 'pricing', 'quote.ts');
}
function testPath(root: string): string {
  return path.join(root, 'tests', 'pricing-quote.test.ts');
}

async function edit(file: string, replace: (content: string) => string): Promise<void> {
  const content = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, replace(content), 'utf8');
}

/** Each break that proves one scenario of "Scenario helper failures". */
const BREAKS = {
  'Deleted then': {
    message: 'No assertion for: the total is 1620.00',
    apply: (root: string) =>
      edit(testPath(root), (content) =>
        content.replace(/^\s*then\('the total is 1620\.00'[^\n]*\n/m, ''),
      ),
  },
  'Number changed in the spec': {
    message: '"the total is 1620.00" is not a THEN of this scenario',
    apply: (root: string) =>
      edit(specPath(root), (content) =>
        content.replace('the total is 1620.00', 'the total is 1600.00'),
      ),
  },
  'Function called directly': {
    message: 'THEN the subtotal is 1800.00: checked before quote ran',
    apply: (root: string) =>
      edit(testPath(root), (content) =>
        content.replace("run(200, 'SAVE10')", "quote(200, 'SAVE10')"),
      ),
  },
  'Boundary moved in the code': {
    message: 'THEN the unit price follows this table: failed at quantity 100, unit price 9.00',
    apply: (root: string) =>
      edit(quotePath(root), (content) => content.replace('quantity >= 100', 'quantity > 100')),
  },
  'Table checked with then': {
    message: 'THEN the unit price follows this table: has a table, so check it with each',
    apply: (root: string) =>
      edit(testPath(root), (content) =>
        content
          .replace('{ run, each }', '{ run, then }')
          .replace(
            "each('the unit price follows this table'",
            "then('the unit price follows this table'",
          ),
      ),
  },
  'Duplicate scenario names': {
    message: 'The pricing spec has two scenarios named "Volume discount tiers"',
    apply: (root: string) =>
      edit(specPath(root), (content) =>
        content.replace(
          '#### Scenario: A percentage code comes off the tiered subtotal',
          '#### Scenario: Volume discount tiers',
        ),
      ),
  },
  'AND line added': {
    message: 'No assertion for: the quote has no rounding step',
    apply: (root: string) =>
      edit(specPath(root), (content) =>
        content.replace(
          '- **AND** the total is 1620.00',
          '- **AND** the total is 1620.00\n- **AND** the quote has no rounding step',
        ),
      ),
  },
} as const satisfies Record<string, Break>;

/** The break an ordinary test proves, not a scenario. */
const TABLE_ROW_BREAK: Break = {
  message: 'THEN the unit price follows this table: failed at quantity 1000, unit price 7.00',
  apply: (root) =>
    edit(specPath(root), (content) =>
      content.replace('| 500 | 8.00 |\n', '| 500 | 8.00 |\n| 1000 | 7.00 |\n'),
    ),
};

async function copyFixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-trace-pricing-'));
  await fs.rm(root, { recursive: true, force: true });
  await fs.cp(FIXTURE, root, { recursive: true });
  await edit(testPath(root), (content) =>
    content.replace("'@matteeh/osq/testing'", `'${TESTING_URL}'`),
  );
  return root;
}

/** Rewrite the table test to count its `each` checks and print the count. */
async function countEachCalls(root: string): Promise<void> {
  await edit(testPath(root), (content) =>
    content.replace(
      /scenario\('pricing', 'Volume discount tiers'[\s\S]*?\n\}\);\n/,
      [
        "scenario('pricing', 'Volume discount tiers', { covers: quote }, async ({ run, each }) => {",
        '  let checks = 0;',
        "  await each('the unit price follows this table', (row) => {",
        '    checks += 1;',
        '    const result: Quote = run(Number(row.quantity));',
        "    assert.equal(result.unitPrice, cents(row['unit price']));",
        '  });',
        '  console.log(`EACH_CHECKS=${checks}`);',
        '});',
        '',
      ].join('\n'),
    ),
  );
}

/** The data rows of the fixture spec's unit-price table. */
async function specTableRows(root: string): Promise<number> {
  const content = await fs.readFile(specPath(root), 'utf8');
  const table = content.split('the unit price follows this table')[1] ?? '';
  return table.split('\n').filter((line) => /^\|\s*\d/.test(line)).length;
}

interface ChildResult {
  readonly status: number;
  readonly output: string;
}

function runChild(root: string): ChildResult {
  const env = { ...process.env };
  Reflect.deleteProperty(env, 'OSQ_CHANGE');
  Reflect.deleteProperty(env, 'NODE_TEST_CONTEXT');
  const result = spawnSync(process.execPath, ['--import', TSX, '--test', TEST_FILE], {
    cwd: root,
    encoding: 'utf8',
    env,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return { status: result.status ?? 1, output };
}

const roots: string[] = [];

after(async () => {
  while (roots.length > 0) {
    await fs.rm(roots.pop() ?? '', { recursive: true, force: true });
  }
});

scenario('traceability', 'Every outcome asserted', { covers: runChild }, async ({ run, then }) => {
  const root = await copyFixture();
  roots.push(root);
  const result = run(root);
  await then('the test passes', () => {
    assert.equal(result.status, 0, result.output);
  });
});

scenario('traceability', 'Every row checked', { covers: runChild }, async ({ run, then }) => {
  const root = await copyFixture();
  roots.push(root);
  await countEachCalls(root);
  const result = run(root);
  await then('`check` runs once per table row and the test passes', async () => {
    assert.equal(result.status, 0, result.output);
    const count = /EACH_CHECKS=(\d+)/.exec(result.output);
    assert.ok(count, `no count printed:\n${result.output}`);
    assert.equal(count[1], String(await specTableRows(root)));
  });
});

scenario('traceability', 'Deleted then', { covers: runChild }, async ({ run, then }) => {
  const root = await copyFixture();
  roots.push(root);
  await BREAKS['Deleted then'].apply(root);
  const result = run(root);
  await then('it fails with `No assertion for: the total is 1620.00`', () => {
    assert.notEqual(result.status, 0, result.output);
    assert.ok(result.output.includes(BREAKS['Deleted then'].message), result.output);
  });
});

scenario(
  'traceability',
  'Number changed in the spec',
  { covers: runChild },
  async ({ run, then }) => {
    const root = await copyFixture();
    roots.push(root);
    await BREAKS['Number changed in the spec'].apply(root);
    const result = run(root);
    await then('it fails with `"the total is 1620.00" is not a THEN of this scenario`', () => {
      assert.notEqual(result.status, 0, result.output);
      assert.ok(
        result.output.includes(BREAKS['Number changed in the spec'].message),
        result.output,
      );
    });
  },
);

scenario(
  'traceability',
  'Function called directly',
  { covers: runChild },
  async ({ run, then }) => {
    const root = await copyFixture();
    roots.push(root);
    await BREAKS['Function called directly'].apply(root);
    const result = run(root);
    await then('it fails with `THEN the subtotal is 1800.00: checked before quote ran`', () => {
      assert.notEqual(result.status, 0, result.output);
      assert.ok(result.output.includes(BREAKS['Function called directly'].message), result.output);
    });
  },
);

scenario(
  'traceability',
  'Boundary moved in the code',
  { covers: runChild },
  async ({ run, then }) => {
    const root = await copyFixture();
    roots.push(root);
    await BREAKS['Boundary moved in the code'].apply(root);
    const result = run(root);
    await then(
      'the table test fails with `THEN the unit price follows this table: failed at quantity 100, unit price 9.00`',
      () => {
        assert.notEqual(result.status, 0, result.output);
        assert.ok(
          result.output.includes(BREAKS['Boundary moved in the code'].message),
          result.output,
        );
      },
    );
  },
);

scenario('traceability', 'Table checked with then', { covers: runChild }, async ({ run, then }) => {
  const root = await copyFixture();
  roots.push(root);
  await BREAKS['Table checked with then'].apply(root);
  const result = run(root);
  await then(
    'it fails with `THEN the unit price follows this table: has a table, so check it with each`',
    () => {
      assert.notEqual(result.status, 0, result.output);
      assert.ok(result.output.includes(BREAKS['Table checked with then'].message), result.output);
    },
  );
});

scenario(
  'traceability',
  'Duplicate scenario names',
  { covers: runChild },
  async ({ run, then }) => {
    const root = await copyFixture();
    roots.push(root);
    await BREAKS['Duplicate scenario names'].apply(root);
    const result = run(root);
    await then(
      'both pricing tests fail with `The pricing spec has two scenarios named "Volume discount tiers"`',
      () => {
        assert.notEqual(result.status, 0, result.output);
        assert.ok(
          result.output.includes(BREAKS['Duplicate scenario names'].message),
          result.output,
        );
      },
    );
  },
);

scenario('traceability', 'AND line added', { covers: runChild }, async ({ run, then }) => {
  const root = await copyFixture();
  roots.push(root);
  await BREAKS['AND line added'].apply(root);
  const result = run(root);
  await then('the test fails with `No assertion for: the quote has no rounding step`', () => {
    assert.notEqual(result.status, 0, result.output);
    assert.ok(result.output.includes(BREAKS['AND line added'].message), result.output);
  });
});

describe('the table gains a row the code gets wrong', () => {
  it('fails the fixture copy', { timeout: 120_000 }, async () => {
    const root = await copyFixture();
    roots.push(root);
    await TABLE_ROW_BREAK.apply(root);
    const result = runChild(root);
    assert.notEqual(result.status, 0, result.output);
    assert.ok(result.output.includes(TABLE_ROW_BREAK.message), result.output);
  });
});
