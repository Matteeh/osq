import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_AUTO_STEER_TIMEOUT_SECONDS,
  plannerRunConfig,
  validateAutoSteerConfig,
} from '../src/core/foundation/config-auto-steer.js';
import { type OsqUserConfig, defineConfig } from '../src/core/foundation/config.js';

/** Resolve a raw `autoSteer` value the way `osq.config.ts` reaches `defineConfig`. */
function resolveAutoSteer(autoSteer: unknown) {
  return defineConfig({ autoSteer } as unknown as OsqUserConfig).autoSteer;
}

describe('autoSteer configuration', () => {
  it('defaults the timeout to 1800 seconds', () => {
    assert.equal(DEFAULT_AUTO_STEER_TIMEOUT_SECONDS, 1800);
  });

  it('leaves autoSteer out when the block is unset', () => {
    const config = defineConfig({});
    assert.equal('autoSteer' in config, false);
    assert.equal(validateAutoSteerConfig(undefined), undefined);
  });

  it('resolves each autoSteer value', () => {
    assert.deepEqual(resolveAutoSteer({}), { enabled: false, timeoutSeconds: 1800 });
    assert.deepEqual(resolveAutoSteer({ enabled: true }), {
      enabled: true,
      timeoutSeconds: 1800,
    });
    assert.deepEqual(resolveAutoSteer({ enabled: true, timeoutSeconds: 600 }), {
      enabled: true,
      timeoutSeconds: 600,
    });
  });

  it('throws for each invalid autoSteer value', () => {
    assert.throws(() => resolveAutoSteer(true), /^Error: autoSteer must be an object$/);
    assert.throws(
      () => resolveAutoSteer({ model: 'x' }),
      /^Error: autoSteer\.model is not supported$/,
    );
    assert.throws(
      () => resolveAutoSteer({ enabled: 'yes' }),
      /^Error: autoSteer\.enabled must be a boolean$/,
    );
    assert.throws(
      () => resolveAutoSteer({ enabled: true, timeoutSeconds: 0 }),
      /^Error: autoSteer\.timeoutSeconds must be a positive number$/,
    );
  });

  it('rejects a non-object block', () => {
    for (const bad of [null, [], true, 7, 'on']) {
      assert.throws(() => validateAutoSteerConfig(bad), /^Error: autoSteer must be an object$/);
    }
  });
});

describe('plannerRunConfig', () => {
  it('sets the planner harness and its section model and agent, leaving the rest', () => {
    const config = defineConfig({
      harness: 'agy',
      planner: { harness: 'opencode', model: 'anthropic/claude-x', agent: 'osq-planner' },
    });
    const run = plannerRunConfig(config);
    assert.equal(run.harness, 'opencode');
    assert.equal(run.opencode?.model, 'anthropic/claude-x');
    assert.equal(run.opencode?.agent, 'osq-planner');
    assert.equal(run.opencode?.bin, 'opencode');
    assert.deepEqual(run.agy, config.agy);
  });

  it('returns a deeply equal config without a planner block', () => {
    const config = defineConfig({ harness: 'mock' });
    assert.deepEqual(plannerRunConfig(config), config);
  });
});
