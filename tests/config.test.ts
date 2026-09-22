import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, defineConfig, loadConfig } from '../src/core/foundation/config.js';

describe('OsqConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('provides specification-compliant default limits, paths, and timeouts', () => {
    assert.equal(DEFAULT_CONFIG.maxConcurrency, 1);
    assert.equal(DEFAULT_CONFIG.limits.maxScopeFiles, 8);
    assert.equal(DEFAULT_CONFIG.limits.maxFeatureWrites, 2);
    assert.equal(DEFAULT_CONFIG.limits.maxContractTables, 1);
    assert.equal(DEFAULT_CONFIG.limits.maxAcceptanceLines, 7);

    assert.equal(DEFAULT_CONFIG.paths.features, 'openspec/specs');
    assert.equal(DEFAULT_CONFIG.paths.decisions, 'decisions');
    assert.equal(DEFAULT_CONFIG.paths.templates, 'templates');
    assert.equal(DEFAULT_CONFIG.paths.openspecRoot, 'openspec');
    assert.ok(!('specs' in DEFAULT_CONFIG.paths), 'paths.specs must not be part of OsqPaths');
    assert.ok(!('archive' in DEFAULT_CONFIG.paths), 'paths.archive must not be part of OsqPaths');

    assert.equal(DEFAULT_CONFIG.timeouts.taskTimeoutSeconds, 1800);
    assert.equal(DEFAULT_CONFIG.timeouts.verifyTimeoutSeconds, 600);
    assert.equal(DEFAULT_CONFIG.timeouts.staleLockSeconds, 2700);
    assert.ok(
      DEFAULT_CONFIG.timeouts.staleLockSeconds >
        DEFAULT_CONFIG.timeouts.taskTimeoutSeconds + DEFAULT_CONFIG.timeouts.verifyTimeoutSeconds,
    );

    assert.equal(DEFAULT_CONFIG.agy?.model, 'gemini-3.8-flash-high');
    assert.equal(DEFAULT_CONFIG.agy?.dangerouslySkipPermissions, true);
  });

  it('allows overriding specific limits while retaining default paths and timeouts', () => {
    const config = defineConfig({
      harness: 'mock',
      limits: {
        maxScopeFiles: 10,
        maxFeatureWrites: 3,
        maxContractTables: 2,
        maxAcceptanceLines: 5,
      },
    });

    assert.equal(config.harness, 'mock');
    assert.equal(config.limits.maxScopeFiles, 10);
    assert.equal(config.limits.maxFeatureWrites, 3);
    assert.equal(config.paths.openspecRoot, 'openspec');
    assert.ok(!('specs' in config.paths));
    assert.equal(config.timeouts.staleLockSeconds, 2700);
    assert.equal(config.timeouts.verifyTimeoutSeconds, 600);
  });

  it('loadConfig returns DEFAULT_CONFIG if no config file exists', async () => {
    const config = await loadConfig(tmpDir);
    assert.equal(config.harness, 'agy');
    assert.equal(config.timeouts.staleLockSeconds, 2700);
  });

  it('loadConfig reads .env and loads osq.config.ts', async () => {
    // Write .env
    await fs.writeFile(path.join(tmpDir, '.env'), 'OSQ_HARNESS=mock\n', 'utf8');

    // Write osq.config.ts
    const configCode = `export default {
      limits: {
        maxScopeFiles: 12
      }
    };`;
    await fs.writeFile(path.join(tmpDir, 'osq.config.ts'), configCode, 'utf8');

    const config = await loadConfig(tmpDir);
    assert.equal(config.harness, 'mock');
    assert.equal(config.limits.maxScopeFiles, 12);
    assert.equal(config.limits.maxFeatureWrites, 2);
  });

  it('loadConfig reads a serve block from osq.config.ts', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      'export default { serve: { port: 0, eventDebounceMs: 5 } };',
      'utf8',
    );
    const config = await loadConfig(tmpDir);
    assert.deepEqual(config.serve, { port: 0, eventDebounceMs: 5 });
  });
});

describe('serve configuration', () => {
  it('defaults the dashboard port and debounce interval', () => {
    assert.deepEqual(DEFAULT_CONFIG.serve, { port: 4173, eventDebounceMs: 100 });
    assert.deepEqual(defineConfig({}).serve, { port: 4173, eventDebounceMs: 100 });
  });

  it('merges a partial serve block over the defaults', () => {
    assert.deepEqual(defineConfig({ serve: { port: 0 } }).serve, {
      port: 0,
      eventDebounceMs: 100,
    });
    assert.deepEqual(defineConfig({ serve: { eventDebounceMs: 250 } }).serve, {
      port: 4173,
      eventDebounceMs: 250,
    });
  });

  it('rejects non-finite, fractional, negative, and out-of-range ports', () => {
    for (const port of [-1, 1.5, 65536, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => defineConfig({ serve: { port } }), /serve\.port/);
    }
  });

  it('rejects non-finite and negative debounce values', () => {
    for (const eventDebounceMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => defineConfig({ serve: { eventDebounceMs } }), /serve\.eventDebounceMs/);
    }
  });
});

describe('gates configuration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-gates-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('defaults changeVerifyAfterTask to true', () => {
    assert.equal(DEFAULT_CONFIG.gates?.changeVerifyAfterTask, true);
    assert.equal(defineConfig({}).gates?.changeVerifyAfterTask, true);
  });

  it('preserves the incremental verification opt-out while keeping unrelated defaults', () => {
    const config = defineConfig({ gates: { changeVerifyAfterTask: false } });
    assert.equal(config.gates?.changeVerifyAfterTask, false);
    assert.equal(config.timeouts.verifyTimeoutSeconds, 600);
  });

  it('rejects a non-boolean changeVerifyAfterTask', () => {
    assert.throws(
      () => defineConfig({ gates: { changeVerifyAfterTask: 'yes' } } as never),
      /gates\.changeVerifyAfterTask/,
    );
  });

  it('rejects a non-object gates block', () => {
    assert.throws(() => defineConfig({ gates: 42 } as never), /gates configuration/);
  });

  it('loadConfig reads a gates block from osq.config.ts', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      'export default { gates: { changeVerifyAfterTask: false } };',
      'utf8',
    );
    const config = await loadConfig(tmpDir);
    assert.equal(config.gates?.changeVerifyAfterTask, false);
  });
});
