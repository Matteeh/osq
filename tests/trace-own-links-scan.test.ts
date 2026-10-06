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

/** The two new scenario test files this task adds. */
const SCENARIO_TESTS = [
  'tests/trace-scenarios-scan.test.ts',
  'tests/trace-scenarios-paths.test.ts',
];

/** Every scenario the two files must name, as the task lists them. */
const SCENARIOS = [
  'Tagged arrow const',
  'Tag above an unread form',
  'Non-literal name',
  'Test covers the tagged function',
  'Test and source paths',
  'One definition',
  'Show uses it',
  'Codebase ownership boundaries',
  'Only built-ins',
];

/** Each added tag line, under the function whose doc comment carries it. */
const TAGS: ReadonlyArray<{
  readonly file: string;
  readonly name: string;
  readonly scenarios: readonly string[];
}> = [
  {
    file: 'src/core/trace/tag-scan.ts',
    name: 'scanSource',
    scenarios: ['Tagged arrow const', 'Tag above an unread form', 'Non-literal name'],
  },
  {
    file: 'src/core/trace/scenario-index.ts',
    name: 'buildScenarioIndex',
    scenarios: ['Test covers the tagged function'],
  },
  {
    file: 'src/core/trace/test-path.ts',
    name: 'isTestPath',
    scenarios: ['Test and source paths'],
  },
];

test('scanSource reads each added tag for its function', () => {
  for (const entry of TAGS) {
    const text = readFileSync(path.join(ROOT, entry.file), 'utf8');
    const scan = scanSource(entry.file, text);
    const fn = scan.functions.find((candidate) => candidate.name === entry.name);
    assert.ok(fn, `${entry.file} does not declare ${entry.name}`);
    assert.deepEqual(
      fn.scenarios,
      entry.scenarios.map((name) => ({ capability: 'traceability', name })),
    );
  }
});

test('the two scenario test files name every scenario and read cleanly', async () => {
  const graph = await buildImportGraph(ROOT, { skip: ['openspec'] });
  const index = buildScenarioIndex(ROOT, graph);

  for (const name of SCENARIOS) {
    const naming = index.testsNaming('traceability', name);
    assert.ok(
      SCENARIO_TESTS.some((file) => naming.includes(file)),
      `no new scenario test names "${name}"; got ${naming.join(', ')}`,
    );
  }

  for (const form of index.unreadable) {
    assert.ok(
      !SCENARIO_TESTS.includes(form.file),
      `${form.file}:${form.line} is unreadable: ${form.reason}`,
    );
  }
});

test('the tagged source files stay within the line budget', () => {
  for (const entry of TAGS) {
    const lines = readFileSync(path.join(ROOT, entry.file), 'utf8').split('\n').length;
    assert.ok(lines <= MAX_LINES, `${entry.file} has ${lines} lines (max ${MAX_LINES})`);
  }
});
