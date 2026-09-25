import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildImportGraph, reachImports } from '../src/core/spec/import-graph.js';
import { scenario } from '../src/testing/index.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTING_URL = pathToFileURL(path.join(REPO_ROOT, 'src', 'testing', 'index.ts')).href;
const TSX = import.meta.resolve('tsx');
const BARE_SPECIFIER = /(?:\bfrom\b|\bimport\b|\brequire\b)\s*(?:\(\s*)?['"]([^'"]+)['"]/g;

/** Compile-time probe: `run` keeps the covered function's parameter types. */
if (process.env.OSQ_TYPE_PROBE === '1') {
  const quote = (quantity: number): number => quantity;
  scenario('pricing', 'Volume discount tiers', { covers: quote }, ({ run }) => {
    // @ts-expect-error run takes the covered function's number parameter
    run('not a number');
  });
}

const roots: string[] = [];

after(async () => {
  while (roots.length > 0) {
    await fs.rm(roots.pop() ?? '', { recursive: true, force: true });
  }
});

async function makeProject(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-trace-helper-'));
  roots.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, relative);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content.replaceAll('__TESTING__', TESTING_URL), 'utf8');
  }
  return root;
}

interface ChildResult {
  readonly status: number;
  readonly output: string;
}

function runChild(root: string, testFile: string, osqChange: string | null): ChildResult {
  const env = { ...process.env };
  Reflect.deleteProperty(env, 'NODE_TEST_CONTEXT');
  if (osqChange === null) Reflect.deleteProperty(env, 'OSQ_CHANGE');
  else env.OSQ_CHANGE = osqChange;
  const result = spawnSync(process.execPath, ['--import', TSX, '--test', testFile], {
    cwd: root,
    encoding: 'utf8',
    env,
  });
  return { status: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

const FAILURE_SPEC = `# pricing Specification

## Purpose
Prices quotes for the scenario helper tests.

## Requirements
### Requirement: Outcomes
The engine SHALL price a quote.

#### Scenario: grown outcomes
- **WHEN** a quote is calculated
- **THEN** the total is 100
- **AND** the quote has no rounding step

#### Scenario: missing text
- **WHEN** a quote is calculated
- **THEN** the total is 100

#### Scenario: tableless
- **WHEN** a quote is calculated
- **THEN** the total is 100

#### Scenario: wrong check
- **WHEN** a quote is calculated
- **THEN** the total is 100

#### Scenario: quiet
- **WHEN** a quote is calculated
- **THEN** the total is 100

#### Scenario: async race
- **WHEN** a quote is calculated
- **THEN** the total is 100
`;

const FAILURE_TEST = `import assert from 'node:assert/strict';
import { scenario } from '__TESTING__';

const quote = (): number => 100;
const slowQuote = async (): Promise<number> => 100;

scenario('pricing', 'grown outcomes', { covers: quote }, ({ run, then }) => {
  const result = run();
  then('the total is 100', () => assert.equal(result, 100));
});

scenario('pricing', 'missing text', { covers: quote }, ({ run, then }) => {
  run();
  then('not an outcome', () => assert.equal(1, 1));
});

scenario('pricing', 'tableless', { covers: quote }, ({ run, each }) => {
  run();
  each('the total is 100', () => assert.equal(1, 1));
});

scenario('pricing', 'wrong check', { covers: quote }, ({ run, then }) => {
  const result = run();
  then('the total is 100', () => assert.equal(result, 999, 'inner boom'));
});

scenario('pricing', 'quiet', { covers: quote }, () => {});

scenario('pricing', 'async race', { covers: slowQuote }, ({ run, then }) => {
  run();
  then('the total is 100', () => assert.equal(1, 1));
});
`;

const PASS_SPEC = `# pricing Specification

## Purpose
Prices quotes for the scenario helper tests.

## Requirements
### Requirement: Outcomes
The engine SHALL price a quote.

#### Scenario: async waits
- **WHEN** a quote is calculated
- **THEN** the total is 100

#### Scenario: property
- **WHEN** a quote is calculated
- **THEN** the total is 100
`;

const PASS_TEST = `import assert from 'node:assert/strict';
import { scenario } from '__TESTING__';

const slowQuote = async (): Promise<number> => 100;
const quote = (seed: number): number => (seed * 37) % 101;

scenario('pricing', 'async waits', { covers: slowQuote }, async ({ run, then }) => {
  const result = await run();
  then('the total is 100', () => assert.equal(result, 100));
});

scenario('pricing', 'property', { covers: quote }, ({ run, then }) => {
  then('the total is 100', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const value = run(seed);
      assert.equal(value, (seed * 37) % 101);
    }
  });
});
`;

const CHANGE_SPEC = `# pricing Specification

## Purpose
Prices quotes for the scenario helper tests.

## Requirements
### Requirement: Outcomes
The engine SHALL price a quote.

#### Scenario: changed
- **WHEN** a quote is calculated
- **THEN** the total is 100
`;

const CHANGE_DELTA = `# Spec Delta: pricing

## MODIFIED Requirements

### Requirement: Outcomes
The engine SHALL price a quote.

#### Scenario: changed
- **WHEN** a quote is calculated
- **THEN** the total is 200
`;

const CHANGE_TEST = `import assert from 'node:assert/strict';
import { scenario } from '__TESTING__';

const quote = (): number => 200;

scenario('pricing', 'changed', { covers: quote }, ({ run, then }) => {
  const result = run();
  then('the total is 200', () => assert.equal(result, 200));
});
`;

describe('scenario helper failures', () => {
  it('fails each scenario with its exact message', { timeout: 120_000 }, async () => {
    const root = await makeProject({
      'openspec/specs/pricing/spec.md': FAILURE_SPEC,
      'tests/helper-cases.test.ts': FAILURE_TEST,
    });
    const result = runChild(root, 'tests/helper-cases.test.ts', null);
    assert.notEqual(result.status, 0, result.output);
    for (const message of [
      'No assertion for: the quote has no rounding step',
      '"not an outcome" is not a THEN of this scenario',
      'THEN the total is 100: has no table',
      'THEN the total is 100: failed',
      'inner boom',
      'quote never ran',
      'THEN the total is 100: checked before slowQuote settled',
    ]) {
      assert.ok(result.output.includes(message), `missing ${message} in:\n${result.output}`);
    }
  });
});

describe('scenario helper passing checks', () => {
  it('passes a settled async check and a property check', { timeout: 120_000 }, async () => {
    const root = await makeProject({
      'openspec/specs/pricing/spec.md': PASS_SPEC,
      'tests/helper-passes.test.ts': PASS_TEST,
    });
    const result = runChild(root, 'tests/helper-passes.test.ts', null);
    assert.equal(result.status, 0, result.output);
  });
});

describe('OSQ_CHANGE effective spec', () => {
  it(
    'proves the delta modified THEN and refuses to guess without it',
    { timeout: 120_000 },
    async () => {
      const root = await makeProject({
        'openspec/specs/pricing/spec.md': CHANGE_SPEC,
        'openspec/changes/001-x/specs/pricing/spec.md': CHANGE_DELTA,
        'tests/change-case.test.ts': CHANGE_TEST,
      });
      const changeFolder = path.join(root, 'openspec', 'changes', '001-x');
      const withChange = runChild(root, 'tests/change-case.test.ts', changeFolder);
      assert.equal(withChange.status, 0, withChange.output);
      const withoutChange = runChild(root, 'tests/change-case.test.ts', null);
      assert.notEqual(withoutChange.status, 0, withoutChange.output);
      assert.ok(withoutChange.output.includes('differs between'), withoutChange.output);
      assert.ok(withoutChange.output.includes('set OSQ_CHANGE'), withoutChange.output);
    },
  );
});

describe('testing entry point', () => {
  it('reaches only node built-ins from src/testing/index.ts', async () => {
    const graph = await buildImportGraph(REPO_ROOT);
    const modules = ['src/testing/index.ts', ...reachImports(graph, ['src/testing/index.ts'])];
    for (const file of modules) {
      const content = await fs.readFile(path.join(REPO_ROOT, file), 'utf8');
      for (const match of content.matchAll(BARE_SPECIFIER)) {
        const specifier = match[1] ?? '';
        if (specifier.startsWith('.')) continue;
        assert.ok(specifier.startsWith('node:'), `${file} imports ${specifier}`);
      }
    }
  });

  it('declares the ./testing subpath in package.json', async () => {
    const manifest = JSON.parse(
      await fs.readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'),
    ) as {
      exports: Record<string, unknown>;
    };
    assert.deepEqual(manifest.exports['./testing'], {
      types: './dist/testing/index.d.ts',
      import: './dist/testing/index.js',
    });
  });

  it('builds the files the ./testing export names', () => {
    if (!existsSync(path.join(REPO_ROOT, 'dist'))) return;
    assert.ok(existsSync(path.join(REPO_ROOT, 'dist', 'testing', 'index.js')));
    assert.ok(existsSync(path.join(REPO_ROOT, 'dist', 'testing', 'index.d.ts')));
  });
});
