import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import { DEFAULT_CONFIG, defineConfig, loadConfig } from '../src/core/foundation/config.js';

describe('automatic retry configuration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-auto-retry-config-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('defaults the automatic retry count to one', () => {
    assert.equal(DEFAULT_GATES_CONFIG.autoRetries, 1);
    assert.equal(DEFAULT_CONFIG.gates?.autoRetries, 1);
    assert.equal(defineConfig({}).gates?.autoRetries, 1);
  });

  it('retains a declared count while preserving the other gate defaults', () => {
    const config = defineConfig({ gates: { autoRetries: 3 } });
    assert.equal(config.gates?.autoRetries, 3);
    assert.equal(config.gates?.changeVerifyAfterTask, true);
    assert.equal(config.gates?.preSpawnVerify, 'warn');
  });

  it('retains zero to disable automatic retries', () => {
    const config = defineConfig({ gates: { autoRetries: 0 } });
    assert.equal(config.gates?.autoRetries, 0);
    assert.equal(config.gates?.changeVerifyAfterTask, true);
  });

  it('rejects negative, fractional, and non-numeric counts naming the key', () => {
    for (const autoRetries of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 'two']) {
      assert.throws(
        () => defineConfig({ gates: { autoRetries } } as never),
        /gates\.autoRetries/,
        `expected gates.autoRetries to reject ${String(autoRetries)}`,
      );
    }
  });

  it('loads the count from osq.config.ts', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      'export default { gates: { autoRetries: 2 } };\n',
      'utf8',
    );
    const config = await loadConfig(tmpDir);
    assert.equal(config.gates?.autoRetries, 2);
  });
});
