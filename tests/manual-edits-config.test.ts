import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_VCS_CONFIG } from '../src/core/foundation/config-vcs.js';
import { defineConfig } from '../src/core/foundation/config.js';

const ERROR = /vcs\.manualEdits must be "keep" or "block"/;

describe('Manual edits modes', () => {
  it('Manual edits modes: { enabled: false } resolves vcs { enabled: false }', () => {
    assert.deepEqual(defineConfig({ vcs: { enabled: false } }).vcs, { enabled: false });
  });

  it('Manual edits modes: manualEdits keep is kept', () => {
    const vcs = defineConfig({ vcs: { enabled: false, manualEdits: 'keep' } }).vcs;
    assert.equal(vcs?.manualEdits, 'keep');
  });

  it('Manual edits modes: manualEdits block is kept', () => {
    const vcs = defineConfig({ vcs: { enabled: false, manualEdits: 'block' } }).vcs;
    assert.equal(vcs?.manualEdits, 'block');
  });

  it('Manual edits modes: any other manualEdits value fails loading', () => {
    assert.throws(
      () => defineConfig({ vcs: { enabled: false, manualEdits: 'never' } } as never),
      ERROR,
    );
  });

  it('Manual edits modes: the default vcs config stays { enabled: false }', () => {
    assert.deepEqual(DEFAULT_VCS_CONFIG, { enabled: false });
    assert.deepEqual(defineConfig({}).vcs, { enabled: false });
  });
});
