import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_CONFIG, defineConfig } from '../src/core/config.js';

describe('OsqConfig', () => {
  it('provides specification-compliant default limits and paths', () => {
    assert.equal(DEFAULT_CONFIG.maxConcurrency, 1);
    assert.equal(DEFAULT_CONFIG.limits.maxScopeFiles, 8);
    assert.equal(DEFAULT_CONFIG.limits.maxFeatureWrites, 2);
    assert.equal(DEFAULT_CONFIG.limits.maxContractTables, 1);
    assert.equal(DEFAULT_CONFIG.limits.maxAcceptanceLines, 7);

    assert.equal(DEFAULT_CONFIG.paths.specs, 'specs');
    assert.equal(DEFAULT_CONFIG.paths.archive, 'specs/archive');
    assert.equal(DEFAULT_CONFIG.paths.features, 'features');
    assert.equal(DEFAULT_CONFIG.paths.decisions, 'decisions');
    assert.equal(DEFAULT_CONFIG.paths.templates, 'templates');

    assert.equal(DEFAULT_CONFIG.timeouts.staleLockSeconds, 300);
    assert.equal(DEFAULT_CONFIG.timeouts.taskTimeoutSeconds, 1800);
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
    assert.equal(config.paths.specs, 'specs');
    assert.equal(config.timeouts.staleLockSeconds, 300);
  });
});
