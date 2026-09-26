import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  DEFAULT_MUTATION_BUDGET_SECONDS,
  DEFAULT_TRACEABILITY_CONFIG,
  validateTraceabilityConfig,
} from '../src/core/foundation/config-traceability.js';
import { defineConfig, loadConfig } from '../src/core/foundation/config.js';

const COMMAND_ERROR = /traceability\.mutation\.command must be a non-empty command/;
const BUDGET_ERROR = /traceability\.mutation\.budgetSeconds must be a positive number/;
const REFERENCE_COMMAND = 'npx stryker run';

describe('mutation configuration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-mutation-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('leaves mutation out when unset', () => {
    assert.equal('mutation' in DEFAULT_TRACEABILITY_CONFIG, false);
    assert.deepEqual(defineConfig({ traceability: { capabilities: ['pricing'] } }).traceability, {
      capabilities: ['pricing'],
      mode: 'warn',
    });
    assert.deepEqual(validateTraceabilityConfig({ capabilities: 'all' }), {
      capabilities: 'all',
      mode: 'warn',
    });
  });

  it('defaults the budget to 300', () => {
    assert.equal(DEFAULT_MUTATION_BUDGET_SECONDS, 300);
    assert.deepEqual(validateTraceabilityConfig({ mutation: { command: REFERENCE_COMMAND } }), {
      capabilities: [],
      mode: 'warn',
      mutation: { command: REFERENCE_COMMAND, budgetSeconds: DEFAULT_MUTATION_BUDGET_SECONDS },
    });
  });

  it('keeps a custom budget', () => {
    assert.deepEqual(
      validateTraceabilityConfig({
        capabilities: 'all',
        mutation: { command: REFERENCE_COMMAND, budgetSeconds: 60 },
      }),
      {
        capabilities: 'all',
        mode: 'warn',
        mutation: { command: REFERENCE_COMMAND, budgetSeconds: 60 },
      },
    );
    const config = defineConfig({
      traceability: {
        capabilities: ['pricing'],
        mutation: { command: REFERENCE_COMMAND, budgetSeconds: 45 },
      },
    });
    assert.equal(config.traceability?.mutation?.budgetSeconds, 45);
  });

  it('rejects an empty or missing command', () => {
    assert.throws(() => validateTraceabilityConfig({ mutation: {} }), COMMAND_ERROR);
    assert.throws(() => validateTraceabilityConfig({ mutation: { command: '' } }), COMMAND_ERROR);
    assert.throws(
      () => validateTraceabilityConfig({ mutation: { command: '   ' } }),
      COMMAND_ERROR,
    );
    assert.throws(() => validateTraceabilityConfig({ mutation: { command: 42 } }), COMMAND_ERROR);
    assert.throws(
      () => defineConfig({ traceability: { mutation: { command: '' } } } as never),
      COMMAND_ERROR,
    );
  });

  it('rejects a non-positive budget', () => {
    assert.throws(
      () =>
        validateTraceabilityConfig({
          mutation: { command: REFERENCE_COMMAND, budgetSeconds: 0 },
        }),
      BUDGET_ERROR,
    );
    assert.throws(
      () =>
        validateTraceabilityConfig({
          mutation: { command: REFERENCE_COMMAND, budgetSeconds: -5 },
        }),
      BUDGET_ERROR,
    );
    assert.throws(
      () =>
        validateTraceabilityConfig({
          mutation: { command: REFERENCE_COMMAND, budgetSeconds: 'soon' },
        }),
      BUDGET_ERROR,
    );
    assert.throws(
      () =>
        defineConfig({
          traceability: { mutation: { command: REFERENCE_COMMAND, budgetSeconds: 0 } },
        } as never),
      BUDGET_ERROR,
    );
  });

  it('loads mutation from osq.config.ts', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      `export default { traceability: { capabilities: ['pricing'], mutation: { command: '${REFERENCE_COMMAND}' } } };`,
      'utf8',
    );
    const config = await loadConfig(tmpDir);
    assert.deepEqual(config.traceability, {
      capabilities: ['pricing'],
      mode: 'warn',
      mutation: { command: REFERENCE_COMMAND, budgetSeconds: 300 },
    });
  });

  it('loads a custom budget from osq.config.ts', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      `export default { traceability: { mutation: { command: '${REFERENCE_COMMAND}', budgetSeconds: 120 } } };`,
      'utf8',
    );
    const config = await loadConfig(tmpDir);
    assert.deepEqual(config.traceability?.mutation, {
      command: REFERENCE_COMMAND,
      budgetSeconds: 120,
    });
  });
});
