import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG, type OsqConfig, defineConfig, loadConfig } from '../src/core/config.js';
import { OpencodeAdapter, getHarnessAdapter } from '../src/harness/index.js';

describe('OpenCode Configuration and Adapter Registration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-opencode-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('OsqConfig interface defines opencode config with bin, model, agent, optional variant', () => {
    const customConfig: OsqConfig = {
      harness: 'opencode',
      maxConcurrency: 1,
      limits: DEFAULT_CONFIG.limits,
      paths: DEFAULT_CONFIG.paths,
      timeouts: DEFAULT_CONFIG.timeouts,
      opencode: {
        bin: '/custom/bin/opencode',
        model: 'anthropic/claude-3-5-sonnet',
        agent: 'custom-agent',
        variant: 'high',
      },
    };

    assert.equal(customConfig.opencode?.bin, '/custom/bin/opencode');
    assert.equal(customConfig.opencode?.model, 'anthropic/claude-3-5-sonnet');
    assert.equal(customConfig.opencode?.agent, 'custom-agent');
    assert.equal(customConfig.opencode?.variant, 'high');

    // Verify variant is optional
    const configWithoutVariant: OsqConfig = {
      ...customConfig,
      opencode: {
        bin: 'opencode',
        model: 'deepseek/deepseek-flash',
        agent: 'osq-coder',
      },
    };
    assert.equal(configWithoutVariant.opencode?.variant, undefined);
  });

  it('DEFAULT_CONFIG provides opencode defaults bin "opencode", model "deepseek/deepseek-flash", agent "osq-coder"', () => {
    assert.ok(DEFAULT_CONFIG.opencode, 'DEFAULT_CONFIG.opencode should be defined');
    assert.equal(DEFAULT_CONFIG.opencode.bin, 'opencode');
    assert.equal(DEFAULT_CONFIG.opencode.model, 'deepseek/deepseek-flash');
    assert.equal(DEFAULT_CONFIG.opencode.agent, 'osq-coder');
    assert.equal(DEFAULT_CONFIG.opencode.variant, undefined);
  });

  it('loadConfig and defineConfig permit harness setting "opencode"', async () => {
    // Test defineConfig with harness "opencode"
    const defined = defineConfig({
      harness: 'opencode',
      opencode: {
        model: 'openai/gpt-4o',
      },
    });

    assert.equal(defined.harness, 'opencode');
    assert.equal(defined.opencode?.bin, 'opencode');
    assert.equal(defined.opencode?.model, 'openai/gpt-4o');
    assert.equal(defined.opencode?.agent, 'osq-coder');

    // Test loadConfig with osq.config.ts setting harness to "opencode"
    const configCode = `export default {
      harness: 'opencode',
      opencode: {
        variant: 'thinking'
      }
    };`;
    await fs.writeFile(path.join(tmpDir, 'osq.config.ts'), configCode, 'utf8');

    const loaded = await loadConfig(tmpDir);
    assert.equal(loaded.harness, 'opencode');
    assert.equal(loaded.opencode?.bin, 'opencode');
    assert.equal(loaded.opencode?.model, 'deepseek/deepseek-flash');
    assert.equal(loaded.opencode?.agent, 'osq-coder');
    assert.equal(loaded.opencode?.variant, 'thinking');

    // Test loadConfig with OSQ_HARNESS environment variable in .env
    const envDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-opencode-env-test-'));
    try {
      await fs.writeFile(path.join(envDir, '.env'), 'OSQ_HARNESS=opencode\n', 'utf8');
      const loadedEnv = await loadConfig(envDir);
      assert.equal(loadedEnv.harness, 'opencode');
    } finally {
      await fs.rm(envDir, { recursive: true, force: true });
    }
  });

  it('getHarnessAdapter resolves "opencode" returning OpencodeAdapter instance', () => {
    const adapter = getHarnessAdapter('opencode');
    assert.ok(adapter instanceof OpencodeAdapter);
    assert.equal(adapter.name, 'opencode');

    // Case-insensitive lookup
    const upperAdapter = getHarnessAdapter('OpenCode');
    assert.ok(upperAdapter instanceof OpencodeAdapter);
    assert.equal(upperAdapter.name, 'opencode');
  });

  it('README documents opencode in harness list with sample configuration block', async () => {
    const readmePath = path.resolve(import.meta.dirname, '..', 'README.md');
    const readmeContent = await fs.readFile(readmePath, 'utf8');

    // Check that opencode is documented under Harnesses
    assert.ok(
      readmeContent.includes('opencode') || readmeContent.includes('OpenCode'),
      'README should mention opencode harness',
    );

    // Check for sample configuration block for opencode
    assert.ok(
      readmeContent.includes("harness: 'opencode'") ||
        readmeContent.includes('harness: "opencode"') ||
        readmeContent.includes("harness: 'opencode'") ||
        readmeContent.includes('opencode: {'),
      'README should include sample configuration block for opencode',
    );
  });
});
