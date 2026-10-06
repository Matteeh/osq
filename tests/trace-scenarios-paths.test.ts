import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenario } from '@matteeh/osq/testing';
import { readCapabilityOwnership } from '../src/core/spec/capability-impact.js';
import { buildImportGraph, reachImports } from '../src/core/spec/import-graph.js';
import { isTestPath } from '../src/core/trace/test-path.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SHOW_FILE = 'src/core/status/show.ts';

const STATUS_DIR = 'src/core/status';

const TRACEABILITY_GLOBS = [
  'src/testing/**',
  'src/core/trace/**',
  'tests/trace*.test.ts',
  'fixture/trace/**',
];

const DEFINES_TEST_PATH =
  /\b(?:function\s+(?:showIsTestPath|isTestPath)|const\s+(?:showIsTestPath|isTestPath))\b/;

const IMPORTS_IS_TEST_PATH =
  /import\s*\{[^}]*\bisTestPath\b[^}]*\}\s*from\s*['"]\.\.\/trace\/test-path\.js['"]/;

const BARE_SPECIFIER = /(?:\bfrom\b|\bimport\b|\brequire\b)\s*(?:\(\s*)?['"]([^'"]+)['"]/g;

scenario('traceability', 'Test and source paths', { covers: isTestPath }, async ({ run, then }) => {
  const paths = [
    'tests/pricing.ts',
    'src/pricing/quote.test.ts',
    'src/pricing/quote.spec.ts',
    'src/pricing/quote.ts',
  ];
  const results = paths.map((relative) => run(relative));
  await then('it returns true, true, true, and false', () => {
    assert.deepEqual(results, [true, true, true, false]);
  });
});

scenario('traceability', 'One definition', { covers: readFileSync }, async ({ run, then }) => {
  const files = ['src/core/spec/traceability-lint.ts', 'src/core/report/report-traceability.ts'];
  const sources = files.map((file) => ({
    file,
    source: String(run(path.join(ROOT, file), 'utf8')),
  }));
  await then(
    'neither defines a function named `isTestPath`, and both import it from `src/core/trace/test-path.ts`',
    () => {
      for (const { file, source } of sources) {
        assert.doesNotMatch(source, DEFINES_TEST_PATH, `${file} defines isTestPath`);
        assert.match(source, IMPORTS_IS_TEST_PATH, `${file} must import isTestPath`);
      }
    },
  );
});

scenario('traceability', 'Show uses it', { covers: readFileSync }, async ({ run, then }) => {
  const show = String(run(path.join(ROOT, SHOW_FILE), 'utf8'));
  const names = (await fs.readdir(path.join(ROOT, STATUS_DIR)))
    .filter((name) => /^show-model.*\.ts$/.test(name))
    .sort();
  const models = names.map((name) => ({
    file: `${STATUS_DIR}/${name}`,
    source: String(run(path.join(ROOT, STATUS_DIR, name), 'utf8')),
  }));
  const model = models.find((candidate) =>
    /\bfunction\s+attachTaskScenarios\b/.test(candidate.source),
  );
  await then(
    'it defines no test-path function of its own and imports `isTestPath` from `src/core/trace/test-path.ts`',
    () => {
      assert.doesNotMatch(show, DEFINES_TEST_PATH, `${SHOW_FILE} defines a test-path function`);
      assert.ok(model !== undefined, 'no show-model module defines attachTaskScenarios');
      assert.doesNotMatch(model.source, DEFINES_TEST_PATH, `${model.file} defines isTestPath`);
      assert.match(model.source, IMPORTS_IS_TEST_PATH, `${model.file} must import isTestPath`);
    },
  );
});

scenario(
  'traceability',
  'Codebase ownership boundaries',
  { covers: readCapabilityOwnership },
  async ({ run, then }) => {
    const ownerships = await run(ROOT, 'openspec');
    await then(
      'system maps `src/testing/**`, `src/core/trace/**`, `tests/trace*.test.ts`, and `fixture/trace/**` to traceability',
      () => {
        const entry = ownerships.find((candidate) => candidate.capability === 'traceability');
        assert.ok(entry !== undefined, 'traceability has no ownership entry');
        assert.deepEqual([...entry.globs], TRACEABILITY_GLOBS);
      },
    );
  },
);

scenario('traceability', 'Only built-ins', { covers: reachImports }, async ({ run, then }) => {
  const graph = await buildImportGraph(ROOT);
  const modules = ['src/testing/index.ts', ...run(graph, ['src/testing/index.ts'])];
  const violations: string[] = [];
  for (const file of modules) {
    const content = readFileSync(path.join(ROOT, file), 'utf8');
    for (const match of content.matchAll(BARE_SPECIFIER)) {
      const specifier = match[1] ?? '';
      if (specifier.startsWith('.')) continue;
      if (!specifier.startsWith('node:')) violations.push(`${file} imports ${specifier}`);
    }
  }
  await then('each bare import specifier starts with `node:`', () => {
    assert.deepEqual(violations, []);
  });
});
