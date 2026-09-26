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

describe('traceability configuration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-traceability-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('defaults to nothing opted in', () => {
    assert.deepEqual(DEFAULT_TRACEABILITY_CONFIG, { capabilities: [], mode: 'warn' });
    assert.deepEqual(DEFAULT_CONFIG.traceability, { capabilities: [], mode: 'warn' });
    assert.deepEqual(defineConfig({}).traceability, { capabilities: [], mode: 'warn' });
  });

  it("accepts 'all'", () => {
    assert.deepEqual(defineConfig({ traceability: { capabilities: 'all' } }).traceability, {
      capabilities: 'all',
      mode: 'warn',
    });
  });

  it('accepts a list of capability names', () => {
    assert.deepEqual(
      defineConfig({ traceability: { capabilities: ['pricing', 'billing'] } }).traceability,
      { capabilities: ['pricing', 'billing'], mode: 'warn' },
    );
  });

  it('keeps each missing default in a partial block', () => {
    assert.deepEqual(defineConfig({ traceability: { mode: 'require' } }).traceability, {
      capabilities: [],
      mode: 'require',
    });
    assert.deepEqual(defineConfig({ traceability: { capabilities: ['pricing'] } }).traceability, {
      capabilities: ['pricing'],
      mode: 'warn',
    });
    assert.deepEqual(validateTraceabilityConfig({ capabilities: 'all' }), {
      capabilities: 'all',
      mode: 'warn',
    });
    assert.deepEqual(validateTraceabilityConfig(undefined), DEFAULT_TRACEABILITY_CONFIG);
  });

  it('rejects an invalid capabilities value', () => {
    assert.throws(
      () => defineConfig({ traceability: { capabilities: 42 } } as never),
      /traceability\.capabilities must be 'all' or a list of capability names/,
    );
    assert.throws(
      () => defineConfig({ traceability: { capabilities: ['pricing', 7] } } as never),
      /traceability\.capabilities must be 'all' or a list of capability names/,
    );
  });

  it('rejects an invalid mode', () => {
    assert.throws(
      () => defineConfig({ traceability: { mode: 'strict' } } as never),
      /traceability\.mode must be one of warn, require/,
    );
  });

  it('loadConfig reads a traceability block from osq.config.ts', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      "export default { traceability: { capabilities: ['pricing'], mode: 'require' } };",
      'utf8',
    );
    const config = await loadConfig(tmpDir);
    assert.deepEqual(config.traceability, { capabilities: ['pricing'], mode: 'require' });
  });
});
