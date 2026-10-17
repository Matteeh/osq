import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateAutopilotConfig } from '../src/core/foundation/config-autopilot.js';
import { type OsqUserConfig, defineConfig } from '../src/core/foundation/config.js';

/** Resolve a raw `autopilot` value the way `osq.config.ts` reaches `defineConfig`. */
function resolveAutopilot(autopilot: unknown) {
  return defineConfig({ autopilot } as unknown as OsqUserConfig).autopilot;
}

describe('autopilot configuration', () => {
  it('leaves autopilot out when the block is unset', () => {
    assert.equal('autopilot' in defineConfig({}), false);
    assert.equal(validateAutopilotConfig(undefined), undefined);
  });

  it('defaults enabled to false for an empty block', () => {
    assert.deepEqual(resolveAutopilot({}), { enabled: false });
  });

  it('keeps an explicit enabled', () => {
    assert.deepEqual(resolveAutopilot({ enabled: true }), { enabled: true });
    assert.deepEqual(resolveAutopilot({ enabled: false }), { enabled: false });
  });

  it('rejects an enabled that is not a boolean', () => {
    assert.throws(
      () => resolveAutopilot({ enabled: 'yes' }),
      /^Error: autopilot\.enabled must be a boolean$/,
    );
  });

  it('rejects any key besides enabled', () => {
    assert.throws(
      () => resolveAutopilot({ maxSteers: 2 }),
      /^Error: autopilot\.maxSteers is not supported$/,
    );
  });

  it('rejects a block that is not an object', () => {
    assert.throws(() => resolveAutopilot(true), /^Error: autopilot must be an object$/);
  });

  it('rejects a non-object block', () => {
    for (const bad of [null, [], true, 7, 'on']) {
      assert.throws(() => validateAutopilotConfig(bad), /^Error: autopilot must be an object$/);
    }
  });
});
