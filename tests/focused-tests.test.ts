import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  DEFAULT_CONFIG,
  type OsqConfig,
  type TraceabilityConfig,
} from '../src/core/foundation/config.js';
import { collectFocusedTests, runFocusedTests } from '../src/core/run/focused-tests.js';

const roots: string[] = [];
const COMMAND = 'node tap.cjs {files}';

/** Create a temporary project holding `files` keyed by relative POSIX path. */
async function makeProject(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-focused-'));
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

/** A scenario test file that imports the helper and names each scenario. */
function scenarioTestFile(capability: string, names: readonly string[]): string {
  return [
    "import { scenario } from '@matteeh/osq/testing';",
    ...names.map(
      (name) =>
        `scenario(${JSON.stringify(capability)}, ${JSON.stringify(name)}, { covers: quote }, () => {});`,
    ),
    '',
  ].join('\n');
}

function configWith(
  traceability: TraceabilityConfig,
  verifyTimeoutSeconds = DEFAULT_CONFIG.timeouts.verifyTimeoutSeconds,
): OsqConfig {
  return {
    ...DEFAULT_CONFIG,
    traceability,
    timeouts: { ...DEFAULT_CONFIG.timeouts, verifyTimeoutSeconds },
  };
}

function allIn(): OsqConfig {
  return configWith({ capabilities: 'all', mode: 'warn', focusedTests: COMMAND });
}

/** Collect `tests/a.test.ts` and run the focused command for the project. */
async function collectAndRun(
  root: string,
  config: OsqConfig,
  scope: readonly string[] = ['tests/a.test.ts'],
  changeFolder = path.join(root, 'openspec', 'changes', '001-focused'),
): ReturnType<typeof runFocusedTests> {
  const collection = await collectFocusedTests(root, config, scope);
  return runFocusedTests(collection, root, changeFolder, config);
}

function projectWith(script: string, name = 'Volume discount tiers'): Promise<string> {
  return makeProject({
    'tests/a.test.ts': scenarioTestFile('pricing', [name]),
    'tap.cjs': script,
  });
}

describe('focused file collection', () => {
  it('collects scoped scenarios and every file naming them', async () => {
    const root = await makeProject({
      'tests/pricing-quote.test.ts': scenarioTestFile('pricing', [
        'Volume discount tiers',
        'A percentage code comes off the tiered subtotal',
      ]),
      'tests/pricing-bulk.test.ts': scenarioTestFile('pricing', ['Volume discount tiers']),
    });

    const collection = await collectFocusedTests(root, allIn(), ['tests/pricing-quote.test.ts']);

    assert.deepEqual(collection.scenarios, [
      { capability: 'pricing', name: 'A percentage code comes off the tiered subtotal' },
      { capability: 'pricing', name: 'Volume discount tiers' },
    ]);
    assert.deepEqual(collection.files, [
      'tests/pricing-bulk.test.ts',
      'tests/pricing-quote.test.ts',
    ]);
  });

  it('collects nothing when the scoped scenario capability is not opted in', async () => {
    const root = await makeProject({
      'tests/shipping.test.ts': scenarioTestFile('shipping', ['Flat rate']),
    });
    const config = configWith({ capabilities: ['pricing'], mode: 'warn', focusedTests: COMMAND });

    const collection = await collectFocusedTests(root, config, ['tests/shipping.test.ts']);

    assert.deepEqual(collection, { scenarios: [], files: [] });
  });

  it('collects nothing when the focused command is unset', async () => {
    const root = await makeProject({
      'tests/a.test.ts': scenarioTestFile('pricing', ['Volume discount tiers']),
    });
    const config = configWith({ capabilities: 'all', mode: 'warn' });

    const collection = await collectFocusedTests(root, config, ['tests/a.test.ts']);

    assert.deepEqual(collection, { scenarios: [], files: [] });
  });

  it('quotes a collected path holding a space and a quote', async () => {
    const relative = 'tests/with space and "quote".test.ts';
    const root = await makeProject({
      [relative]: scenarioTestFile('pricing', ['Volume discount tiers']),
      'tap.cjs': "console.log('ok 1');\n",
    });

    const result = await collectAndRun(root, allIn(), [relative]);

    assert.equal(result?.command, `node tap.cjs '${relative}'`);
  });
});

describe('focused run classification', () => {
  it('passes when no scenario test fails', async () => {
    const root = await projectWith("console.log('ok 1 - Scenario: Volume discount tiers');\n");

    const result = await collectAndRun(root, allIn());

    assert.equal(result?.outcome, 'passed');
    assert.equal(result?.exitCode, 0);
    assert.deepEqual(result?.files, ['tests/a.test.ts']);
    assert.deepEqual(result?.scenarios, ['pricing: Volume discount tiers']);
  });

  it('fails a collected scenario even when the command exits zero', async () => {
    const root = await projectWith("console.log('not ok 3 - Scenario: Volume discount tiers');\n");

    const result = await collectAndRun(root, allIn());

    assert.equal(result?.outcome, 'failed');
  });

  it('fails an indented nested not ok line', async () => {
    const root = await projectWith(
      "console.log('    not ok 2 - Scenario: Volume discount tiers');\n",
    );

    const result = await collectAndRun(root, allIn());

    assert.equal(result?.outcome, 'failed');
  });

  it('fails a title with an escaped hash', async () => {
    const root = await projectWith(
      "console.log('not ok 1 - Scenario: A weird \\\\# hash');\n",
      'A weird # hash',
    );

    const result = await collectAndRun(root, allIn());

    assert.equal(result?.outcome, 'failed');
  });

  it('fails a title with a trailing TODO directive', async () => {
    const root = await projectWith(
      "console.log('not ok 2 - Scenario: Volume discount tiers # TODO');\n",
    );

    const result = await collectAndRun(root, allIn());

    assert.equal(result?.outcome, 'failed');
  });

  it('calls a non-scenario failure a problem even on a nonzero exit', async () => {
    const root = await projectWith(
      "console.log('not ok 1 - tests/a.test.ts');\nprocess.exit(1);\n",
    );

    const result = await collectAndRun(root, allIn());

    assert.equal(result?.outcome, 'problem');
    assert.equal(result?.exitCode, 1);
  });

  it('calls a timed-out run a problem', async () => {
    const root = await projectWith('setInterval(() => {}, 1000);\n');
    const config = configWith({ capabilities: 'all', mode: 'warn', focusedTests: COMMAND }, 0.5);

    const result = await collectAndRun(root, config);

    assert.equal(result?.outcome, 'problem');
    assert.equal(result?.timedOut, true);
  });

  it('runs with the change folder as OSQ_CHANGE', async () => {
    const root = await projectWith('console.log(process.env.OSQ_CHANGE);\n');
    const changeFolder = path.join(root, 'openspec', 'changes', '001-focused');

    const result = await collectAndRun(root, allIn(), ['tests/a.test.ts'], changeFolder);

    assert.equal(result?.outcome, 'passed');
    assert.equal(result?.output.trim(), changeFolder);
  });
});
