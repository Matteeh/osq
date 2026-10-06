import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildImportGraph } from '../src/core/spec/import-graph.js';
import { buildScenarioIndex } from '../src/core/trace/scenario-index.js';
import { scanSource } from '../src/core/trace/tag-scan.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MAX_LINES = 250;

/** The three scenario test files task 6 adds or converts. */
const SCENARIO_TESTS = [
  'tests/trace-pricing.test.ts',
  'tests/trace-helper.test.ts',
  'tests/trace-scenarios-own.test.ts',
];

/** The ten tags the change adds above `scenario`, in order. */
const TAGS = [
  'Every outcome asserted',
  'Every row checked',
  'Deleted then',
  'Number changed in the spec',
  'Function called directly',
  'Boundary moved in the code',
  'Table checked with then',
  'AND line added',
  'Property test inside then',
  'Check before an async function settles',
];

/** Every traceability scenario the three files must name. */
const SCENARIOS = [
  ...TAGS,
  'Duplicate scenario names',
  'Tag read',
  'Source checks outside scenario tests',
];

test('scanSource reads each added tag for scenario', () => {
  const file = 'src/testing/scenario.ts';
  const scan = scanSource(file, readFileSync(path.join(ROOT, file), 'utf8'));
  const fn = scan.functions.find((candidate) => candidate.name === 'scenario');
  assert.ok(fn, `${file} does not declare scenario`);
  assert.deepEqual(
    fn.scenarios,
    TAGS.map((name) => ({ capability: 'traceability', name })),
  );
});

test('the three scenario test files name every scenario and read cleanly', async () => {
  const graph = await buildImportGraph(ROOT, { skip: ['openspec'] });
  const index = buildScenarioIndex(ROOT, graph);

  for (const name of SCENARIOS) {
    const naming = index.testsNaming('traceability', name);
    assert.ok(
      SCENARIO_TESTS.some((file) => naming.includes(file)),
      `no scenario test names "${name}"; got ${naming.join(', ')}`,
    );
  }

  for (const form of index.unreadable) {
    assert.ok(
      !SCENARIO_TESTS.includes(form.file),
      `${form.file}:${form.line} is unreadable: ${form.reason}`,
    );
  }
});

test('src/testing/scenario.ts stays within the line budget', () => {
  const lines = readFileSync(path.join(ROOT, 'src/testing/scenario.ts'), 'utf8').split('\n').length;
  assert.ok(lines <= MAX_LINES, `src/testing/scenario.ts has ${lines} lines (max ${MAX_LINES})`);
});
