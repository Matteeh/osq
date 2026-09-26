import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(REPO_ROOT, 'fixture', 'trace', 'pricing');
const TESTING_URL = pathToFileURL(path.join(REPO_ROOT, 'src', 'testing', 'index.ts')).href;
const TSX = import.meta.resolve('tsx');
const TEST_FILE = 'tests/pricing-quote.test.ts';

/** One deliberate break from the vision's "What catches what" table. */
interface Break {
  readonly name: string;
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

const BREAKS: readonly Break[] = [
  {
    name: 'the total then is deleted',
    message: 'No assertion for: the total is 1620.00',
    apply: (root) =>
      edit(testPath(root), (content) =>
        content.replace(/^\s*then\('the total is 1620\.00'[^\n]*\n/m, ''),
      ),
  },
  {
    name: 'the table gains a row the code gets wrong',
    message: 'THEN the unit price follows this table: failed at quantity 1000, unit price 7.00',
    apply: (root) =>
      edit(specPath(root), (content) =>
        content.replace('| 500 | 8.00 |\n', '| 500 | 8.00 |\n| 1000 | 7.00 |\n'),
      ),
  },
  {
    name: 'a number changes in the spec',
    message: '"the total is 1620.00" is not a THEN of this scenario',
    apply: (root) =>
      edit(specPath(root), (content) =>
        content.replace('the total is 1620.00', 'the total is 1600.00'),
      ),
  },
  {
    name: 'the function is called directly instead of through run',
    message: 'THEN the subtotal is 1800.00: checked before quote ran',
    apply: (root) =>
      edit(testPath(root), (content) =>
        content.replace("run(200, 'SAVE10')", "quote(200, 'SAVE10')"),
      ),
  },
  {
    name: 'the code boundary moves',
    message: 'THEN the unit price follows this table: failed at quantity 100, unit price 9.00',
    apply: (root) =>
      edit(quotePath(root), (content) => content.replace('quantity >= 100', 'quantity > 100')),
  },
  {
    name: 'the table is checked with then',
    message: 'THEN the unit price follows this table: has a table, so check it with each',
    apply: (root) =>
      edit(testPath(root), (content) =>
        content
          .replace('{ run, each }', '{ run, then }')
          .replace(
            "each('the unit price follows this table'",
            "then('the unit price follows this table'",
          ),
      ),
  },
  {
    name: 'two scenarios share a name',
    message: 'The pricing spec has two scenarios named "Volume discount tiers"',
    apply: (root) =>
      edit(specPath(root), (content) =>
        content.replace(
          '#### Scenario: A percentage code comes off the tiered subtotal',
          '#### Scenario: Volume discount tiers',
        ),
      ),
  },
];

async function copyFixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-trace-pricing-'));
  await fs.rm(root, { recursive: true, force: true });
  await fs.cp(FIXTURE, root, { recursive: true });
  await edit(testPath(root), (content) =>
    content.replace("'@matteeh/osq/testing'", `'${TESTING_URL}'`),
  );
  return root;
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

describe('pricing fixture through the scenario helper', () => {
  const roots: string[] = [];

  after(async () => {
    while (roots.length > 0) {
      await fs.rm(roots.pop() ?? '', { recursive: true, force: true });
    }
  });

  it('passes the intact fixture', { timeout: 120_000 }, async () => {
    const root = await copyFixture();
    roots.push(root);
    const result = runChild(root);
    assert.equal(result.status, 0, result.output);
  });

  for (const broken of BREAKS) {
    it(`fails when ${broken.name}`, { timeout: 120_000 }, async () => {
      const root = await copyFixture();
      roots.push(root);
      await broken.apply(root);
      const result = runChild(root);
      assert.notEqual(result.status, 0, `expected a failure from ${broken.name}\n${result.output}`);
      assert.ok(
        result.output.includes(broken.message),
        `missing ${JSON.stringify(broken.message)} in:\n${result.output}`,
      );
    });
  }
});
