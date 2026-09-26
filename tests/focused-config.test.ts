import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  DEFAULT_TRACEABILITY_CONFIG,
  validateTraceabilityConfig,
} from '../src/core/foundation/config-traceability.js';
import { DEFAULT_CONFIG, defineConfig, loadConfig } from '../src/core/foundation/config.js';

const PLACEHOLDER_ERROR = /traceability\.focusedTests must be a command containing \{files\}/;
const REFERENCE_COMMAND = 'node --test --test-reporter=tap {files}';

describe('focused test command configuration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-focused-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('leaves focusedTests out when unset', () => {
    assert.equal('focusedTests' in DEFAULT_TRACEABILITY_CONFIG, false);
    assert.deepEqual(defineConfig({ traceability: { capabilities: ['pricing'] } }).traceability, {
      capabilities: ['pricing'],
      mode: 'warn',
    });
    assert.deepEqual(validateTraceabilityConfig({ capabilities: 'all' }), {
      capabilities: 'all',
      mode: 'warn',
    });
    assert.deepEqual(DEFAULT_CONFIG.traceability, { capabilities: [], mode: 'warn' });
  });

  it('keeps a valid command verbatim', () => {
    const config = defineConfig({
      traceability: { capabilities: 'all', focusedTests: REFERENCE_COMMAND },
    });
    assert.equal(config.traceability?.focusedTests, REFERENCE_COMMAND);
    assert.deepEqual(config.traceability, {
      capabilities: 'all',
      mode: 'warn',
      focusedTests: REFERENCE_COMMAND,
    });
    assert.deepEqual(validateTraceabilityConfig({ focusedTests: REFERENCE_COMMAND }), {
      capabilities: [],
      mode: 'warn',
      focusedTests: REFERENCE_COMMAND,
    });
  });

  it('rejects a command without the placeholder', () => {
    assert.throws(
      () => defineConfig({ traceability: { focusedTests: 'node --test' } }),
      PLACEHOLDER_ERROR,
    );
  });

  it('rejects a non-string value', () => {
    assert.throws(
      () => defineConfig({ traceability: { focusedTests: 42 } } as never),
      PLACEHOLDER_ERROR,
    );
    assert.throws(() => validateTraceabilityConfig({ focusedTests: false }), PLACEHOLDER_ERROR);
  });

  it('loads focusedTests from osq.config.ts', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      `export default { traceability: { capabilities: ['pricing'], focusedTests: '${REFERENCE_COMMAND}' } };`,
      'utf8',
    );
    const config = await loadConfig(tmpDir);
    assert.deepEqual(config.traceability, {
      capabilities: ['pricing'],
      mode: 'warn',
      focusedTests: REFERENCE_COMMAND,
    });
  });
});
