import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defineConfig } from '../src/core/foundation/config.js';

describe('Change verify reruns gate key', () => {
  it('defaults changeVerifyReruns to one, including a partial gates block', () => {
    assert.equal(defineConfig({}).gates?.changeVerifyReruns, 1);
    assert.equal(defineConfig({ gates: { preSpawnVerify: 'off' } }).gates?.changeVerifyReruns, 1);
  });

  it('keeps zero while preserving the other gate defaults', () => {
    const config = defineConfig({ gates: { changeVerifyReruns: 0 } });
    assert.equal(config.gates?.changeVerifyReruns, 0);
    assert.equal(config.gates?.changeVerifyAfterTask, true);
    assert.equal(config.gates?.preSpawnVerify, 'warn');
    assert.equal(config.gates?.autoRetries, 1);
    assert.equal(config.gates?.commitRetries, 2);
  });

  it('rejects a negative, fractional, NaN, or non-numeric count', () => {
    for (const changeVerifyReruns of [-1, 1.5, Number.NaN, 'one']) {
      assert.throws(
        () => defineConfig({ gates: { changeVerifyReruns } } as never),
        /gates\.changeVerifyReruns must be a non-negative integer/,
        `expected gates.changeVerifyReruns to reject ${String(changeVerifyReruns)}`,
      );
    }
  });
});
