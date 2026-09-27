import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  DEFAULT_CAPABILITIES_CONFIG,
  validateCapabilitiesConfig,
} from '../src/core/foundation/config-capability-groups.js';
import { DEFAULT_CONFIG, defineConfig, loadConfig } from '../src/core/foundation/config.js';

describe('capability groups configuration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-capability-groups-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('defaults requireGroups to false', () => {
    assert.deepEqual(DEFAULT_CAPABILITIES_CONFIG, { requireGroups: false });
    assert.deepEqual(DEFAULT_CONFIG.capabilities, { requireGroups: false });
    assert.deepEqual(defineConfig({}).capabilities, { requireGroups: false });
    assert.deepEqual(validateCapabilitiesConfig(undefined), { requireGroups: false });
    assert.deepEqual(validateCapabilitiesConfig({}), { requireGroups: false });
  });

  it('opts in through loadConfig on a temporary project', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      'export default { capabilities: { requireGroups: true } };',
      'utf8',
    );
    const config = await loadConfig(tmpDir);
    assert.deepEqual(config.capabilities, { requireGroups: true });
  });

  it('rejects a non-object capabilities block', () => {
    assert.throws(() => defineConfig({ capabilities: 42 } as never), /capabilities configuration/);
    assert.throws(() => validateCapabilitiesConfig([]), /capabilities configuration/);
  });

  it('rejects a non-boolean requireGroups', () => {
    assert.throws(
      () => defineConfig({ capabilities: { requireGroups: 'yes' } } as never),
      /capabilities\.requireGroups must be a boolean/,
    );
    assert.throws(
      () => validateCapabilitiesConfig({ requireGroups: 'yes' }),
      /capabilities\.requireGroups must be a boolean/,
    );
  });
});
