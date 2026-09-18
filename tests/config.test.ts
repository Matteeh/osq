import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, defineConfig, loadConfig } from '../src/core/config.js';

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
});
