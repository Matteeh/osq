import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scenario } from '@matteeh/osq/testing';
import { loadConfig } from '../src/core/foundation/config.js';
import { collectTraceabilityGaps } from '../src/core/report/report-traceability.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FOCUSED_TESTS =
  'node --import tsx --import ./tests/git-test-env.ts --test --test-reporter=tap {files}';

describe('osq traces its own traceability capability', () => {
  it('opts the traceability capability in under warn mode', async () => {
    const config = await loadConfig(REPO_ROOT);

    assert.deepEqual(config.traceability, {
      capabilities: ['traceability'],
      mode: 'warn',
      focusedTests: FOCUSED_TESTS,
      mutation: { command: 'npx stryker run', budgetSeconds: 300 },
    });
  });

  it('resolves the scenario helper by package name and by relative path', async () => {
    const relative = await import('../src/testing/index.js');

    assert.equal(scenario, relative.scenario);
  });

  it('reports one traceability gap entry for the traceability capability', async () => {
    const config = await loadConfig(REPO_ROOT);
    const gaps = await collectTraceabilityGaps(REPO_ROOT, config);

    assert.ok(gaps);
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].capability, 'traceability');
  });

  it('keeps the Stryker sandbox beside the report', async () => {
    const keys = ['OSQ_MUTATE', 'OSQ_MUTATION_TESTS', 'OSQ_MUTATION_REPORT'] as const;
    const previous = new Map(keys.map((key) => [key, process.env[key]]));
    const url = pathToFileURL(path.join(REPO_ROOT, 'stryker.config.mjs')).href;
    try {
      process.env.OSQ_MUTATE = JSON.stringify(['src/a.ts:1-3']);
      process.env.OSQ_MUTATION_TESTS = JSON.stringify(['tests/a.test.ts']);
      process.env.OSQ_MUTATION_REPORT = '/tmp/x/mutation.json';

      const loaded = (await import(`${url}?case=report`)) as {
        default: {
          mutate: string[];
          commandRunner: { command: string };
          jsonReporter: { fileName: string };
          tempDirName: string;
          thresholds?: unknown;
        };
      };
      const config = loaded.default;

      assert.deepEqual(config.mutate, ['src/a.ts:1-3']);
      assert.ok(config.commandRunner.command.endsWith("--test 'tests/a.test.ts'"));
      assert.equal(config.jsonReporter.fileName, '/tmp/x/mutation.json');
      assert.equal(config.tempDirName, '/tmp/x/stryker');
      assert.equal(config.thresholds, undefined);
    } finally {
      for (const key of keys) {
        const value = previous.get(key);
        if (value === undefined) Reflect.deleteProperty(process.env, key);
        else process.env[key] = value;
      }
    }
  });

  it('puts the Stryker sandbox in the OS temp folder without a report', async () => {
    const key = 'OSQ_MUTATION_REPORT';
    const previous = process.env[key];
    const url = pathToFileURL(path.join(REPO_ROOT, 'stryker.config.mjs')).href;
    try {
      Reflect.deleteProperty(process.env, key);
      const loaded = (await import(`${url}?case=no-report`)) as {
        default: { tempDirName: string };
      };
      assert.match(loaded.default.tempDirName, /osq-stryker$/);
    } finally {
      if (previous === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = previous;
    }
  });
});
