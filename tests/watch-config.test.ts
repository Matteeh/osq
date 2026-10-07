import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_WATCH_CONFIG, validateWatchConfig } from '../src/core/foundation/config-watch.js';
import { DEFAULT_CONFIG, defineConfig } from '../src/core/foundation/config.js';
import type { WatchConfig } from '../src/index.js';

const DEFAULTS: WatchConfig = {
  restartDelaySeconds: 5,
  restartMaxDelaySeconds: 300,
  buildSettleSeconds: 10,
  stopWaitSeconds: 15,
  logMaxBytes: 10485760,
};

const KEYS = [
  'restartDelaySeconds',
  'restartMaxDelaySeconds',
  'buildSettleSeconds',
  'stopWaitSeconds',
  'logMaxBytes',
] as const;

describe('watch configuration', () => {
  it('defaults every key through defineConfig and DEFAULT_CONFIG', () => {
    assert.deepEqual(DEFAULT_WATCH_CONFIG, DEFAULTS);
    assert.deepEqual(DEFAULT_CONFIG.watch, DEFAULTS);
    assert.deepEqual(defineConfig({}).watch, DEFAULTS);
  });

  it('keeps each missing default for a partial block', () => {
    const config = defineConfig({ watch: { buildSettleSeconds: 3 } });
    assert.equal(config.watch?.buildSettleSeconds, 3);
    for (const key of KEYS) {
      if (key === 'buildSettleSeconds') continue;
      assert.equal(config.watch?.[key], DEFAULTS[key]);
    }
  });

  it('rejects a value that is not a finite number greater than zero naming the key', () => {
    const cases: ReadonlyArray<readonly [keyof WatchConfig, unknown]> = [
      ['restartDelaySeconds', 0],
      ['restartDelaySeconds', -1],
      ['restartDelaySeconds', Number.POSITIVE_INFINITY],
      ['restartDelaySeconds', '5'],
      ['restartMaxDelaySeconds', 0],
      ['restartMaxDelaySeconds', Number.NaN],
      ['buildSettleSeconds', -2],
      ['buildSettleSeconds', false],
      ['stopWaitSeconds', Number.NEGATIVE_INFINITY],
      ['logMaxBytes', -1],
      ['logMaxBytes', 'big'],
    ];
    for (const [key, value] of cases) {
      assert.throws(
        () => defineConfig({ watch: { [key]: value } } as never),
        new RegExp(`watch\\.${key} must be a finite number greater than zero`),
      );
    }
  });

  it('rejects a block that is not an object', () => {
    assert.throws(() => validateWatchConfig(5), /watch configuration must be an object/);
    assert.throws(() => validateWatchConfig([]), /watch configuration must be an object/);
  });

  it('returns the shared defaults for an absent block', () => {
    assert.equal(validateWatchConfig(undefined), DEFAULT_WATCH_CONFIG);
  });
});
