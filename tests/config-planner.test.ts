import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, defineConfig, loadConfig } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { buildManifest } from '../src/core/manifest.js';
import { createNewSpec } from '../src/core/new.js';
import { installFakeValidator } from './helpers.js';

describe('planner configuration and manifest attribution', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-config-planner-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('defineConfig accepts valid planner configurations', () => {
    const config1 = defineConfig({
      planner: {
        harness: 'agy',
        model: 'gemini-3.8-flash-high',
      },
    });
    assert.deepEqual(config1.planner, {
      harness: 'agy',
      model: 'gemini-3.8-flash-high',
    });

    const config2 = defineConfig({
      planner: {
        harness: 'opencode',
        model: 'deepseek/deepseek-flash',
        agent: 'osq-planner',
      },
    });
    assert.deepEqual(config2.planner, {
      harness: 'opencode',
      model: 'deepseek/deepseek-flash',
      agent: 'osq-planner',
    });

    const config3 = defineConfig({
      planner: {
        harness: 'mock',
        model: 'mock-model',
      },
    });
    assert.equal(config3.planner?.harness, 'mock');
    assert.equal(config3.planner?.model, 'mock-model');
  });

  it('defineConfig rejects invalid planner configurations', () => {
    assert.throws(
      () => defineConfig({ planner: null as unknown as { harness: string; model: string } }),
      /planner configuration must be an object/,
    );

    assert.throws(
      () => defineConfig({ planner: {} as unknown as { harness: string; model: string } }),
      /planner\.harness must be a non-empty string/,
    );

    assert.throws(
      () => defineConfig({ planner: { harness: ' ', model: 'm' } }),
      /planner\.harness must be a non-empty string/,
    );

    assert.throws(
      () => defineConfig({ planner: { harness: 'invalid-harness', model: 'm' } }),
      /Unsupported planner harness: "invalid-harness"/,
    );

    assert.throws(
      () => defineConfig({ planner: { harness: 'agy', model: '' } }),
      /planner\.model must be a non-empty string/,
    );

    assert.throws(
      () => defineConfig({ planner: { harness: 'agy', model: 'm', agent: '  ' } }),
      /planner\.agent must be a non-empty string if provided/,
    );
  });

  it('loadConfig loads planner block from config file', async () => {
    const configPath = path.join(tmpDir, 'osq.config.ts');
    await fs.writeFile(
      configPath,
      'export default { planner: { harness: "opencode", model: "test-model", agent: "test-agent" } };\n',
      'utf8',
    );

    const config = await loadConfig(tmpDir);
    assert.deepEqual(config.planner, {
      harness: 'opencode',
      model: 'test-model',
      agent: 'test-agent',
    });
  });

  it('buildManifest populates manifest.planner from config', async () => {
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Planner Manifest Probe');

    // Without planner in config
    const manifestWithoutPlanner = await buildManifest(tmpDir, spec.folderPath, DEFAULT_CONFIG);
    assert.equal(manifestWithoutPlanner.planner, null);

    // With planner configured
    const configWithPlanner = defineConfig({
      planner: {
        harness: 'opencode',
        model: 'deepseek/deepseek-planner',
      },
    });
    const manifestWithPlanner = await buildManifest(tmpDir, spec.folderPath, configWithPlanner);
    assert.equal(manifestWithPlanner.planner, 'deepseek/deepseek-planner');
  });
});
