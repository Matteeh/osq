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

const SCENARIO_TEST = 'tests/trace-scenarios-lookup.test.ts';

/** The nine scenarios of "Effective scenario lookup". */
const LOOKUP_SCENARIOS = [
  'Scenario only in the change',
  'Modified scenario uses the delta',
  'Removed scenario',
  'Places disagree',
  'Active change adds a scenario',
  'Change from the worktree branch',
  'Worktree change already archived',
  'Checkout or other branch',
  'Branch read once',
];

/** Each doc-comment tag line the change adds, under the function it sits above. */
const TAGS: ReadonlyArray<{
  readonly file: string;
  readonly name: string;
  readonly scenarios: readonly string[];
}> = [
  {
    file: 'src/core/trace/scenario-lookup.ts',
    name: 'lookupScenario',
    scenarios: [
      'Scenario only in the change',
      'Modified scenario uses the delta',
      'Removed scenario',
      'Places disagree',
      'Active change adds a scenario',
      'Duplicate scenario names',
    ],
  },
  {
    file: 'src/core/trace/lookup-root.ts',
    name: 'worktreeChangeFolder',
    scenarios: [
      'Change from the worktree branch',
      'Worktree change already archived',
      'Checkout or other branch',
      'Branch read once',
    ],
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

test('the scenario test file names every lookup scenario', async () => {
  const graph = await buildImportGraph(ROOT, { skip: ['openspec'] });
  const index = buildScenarioIndex(ROOT, graph);

  for (const name of LOOKUP_SCENARIOS) {
    assert.ok(
      index.testsNaming('traceability', name).includes(SCENARIO_TEST),
      `${SCENARIO_TEST} does not name "${name}"`,
    );
  }
});

test('both tagged source files stay within the line budget', () => {
  for (const entry of TAGS) {
    const lines = readFileSync(path.join(ROOT, entry.file), 'utf8').split('\n').length;
    assert.ok(lines <= MAX_LINES, `${entry.file} has ${lines} lines (max ${MAX_LINES})`);
  }
});
