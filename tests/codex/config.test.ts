import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  resolveCodexBinary,
  resolveCodexEffort,
  resolveCodexModel,
  resolveHarnessEffort,
  resolveHarnessModel,
} from '../../src/core/config-codex.js';
import {
  type CodexConfig,
  DEFAULT_CONFIG,
  defineConfig,
  loadConfig,
} from '../../src/core/config.js';
import * as publicApi from '../../src/index.js';

const SAVED_ENV = { CODEX_PATH: process.env.CODEX_PATH, OSQ_MODEL: process.env.OSQ_MODEL };

function restoreEnv(): void {
  for (const [key, value] of Object.entries(SAVED_ENV)) {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
}

describe('Codex configuration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-codex-config-'));
  });

  afterEach(async () => {
    restoreEnv();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('exports CodexConfig and resolution helpers from the public entry point', () => {
    const settings: CodexConfig = { bin: 'codex', model: 'm', effort: 'high' };
    assert.equal(settings.effort, 'high');
    assert.equal(typeof publicApi.resolveCodexBinary, 'function');
    assert.equal(typeof publicApi.resolveCodexModel, 'function');
    assert.equal(typeof publicApi.resolveCodexEffort, 'function');
  });

  it('centrally defaults preflight and kill-grace timeouts while preserving old timeout literals', () => {
    assert.equal(DEFAULT_CONFIG.timeouts.harnessPreflightSeconds, 10);
    assert.equal(DEFAULT_CONFIG.timeouts.harnessKillGracePeriodMs, 5000);

    // Legacy timeout literals without the new optional fields remain valid.
    const legacy = defineConfig({
      timeouts: {
        staleLockSeconds: 1,
        taskTimeoutSeconds: 2,
        verifyTimeoutSeconds: 3,
      },
    });
    assert.equal(legacy.timeouts.harnessPreflightSeconds, 10);
    assert.equal(legacy.timeouts.harnessKillGracePeriodMs, 5000);
  });

  it('validateCodex settings via defineConfig and preserve native defaults', () => {
    const defined = defineConfig({ harness: 'codex', codex: { model: 'gpt-5-codex' } });
    assert.equal(defined.codex?.model, 'gpt-5-codex');
    assert.equal(defined.codex?.effort, undefined);

    assert.throws(
      () => defineConfig({ codex: { bin: '  ' } }),
      /codex\.bin must be a non-empty string/,
    );
    assert.throws(
      () => defineConfig({ codex: { model: 42 as unknown as string } }),
      /codex\.model must be a non-empty string/,
    );
    assert.throws(
      () => defineConfig({ codex: { effort: '' } }),
      /codex\.effort must be a non-empty string/,
    );
  });

  it('resolves the Codex binary as codex.bin, then CODEX_PATH, then codex', () => {
    Reflect.deleteProperty(process.env, 'CODEX_PATH');
    const explicit = defineConfig({ codex: { bin: '/opt/codex' } });
    assert.equal(resolveCodexBinary(explicit), '/opt/codex');

    process.env.CODEX_PATH = '/env/codex';
    const withoutExplicit = defineConfig({ harness: 'codex' });
    assert.equal(resolveCodexBinary(withoutExplicit), '/env/codex');
    assert.equal(resolveCodexBinary(explicit), '/opt/codex', 'explicit bin still wins');

    Reflect.deleteProperty(process.env, 'CODEX_PATH');
    assert.equal(resolveCodexBinary(withoutExplicit), 'codex');
  });

  it('resolves the Codex model as codex.model, then OSQ_MODEL only for a Codex executor', () => {
    Reflect.deleteProperty(process.env, 'OSQ_MODEL');
    assert.equal(resolveCodexModel(defineConfig({ harness: 'codex' })), undefined);

    process.env.OSQ_MODEL = 'env-model';
    assert.equal(resolveCodexModel(defineConfig({ harness: 'codex' })), 'env-model');
    assert.equal(
      resolveCodexModel(defineConfig({ harness: 'agy' })),
      undefined,
      'OSQ_MODEL must not leak into a non-Codex harness',
    );

    const explicit = defineConfig({ harness: 'codex', codex: { model: 'explicit' } });
    assert.equal(resolveCodexModel(explicit), 'explicit');
  });

  it('resolves effort and harness attribution with a default sentinel', () => {
    Reflect.deleteProperty(process.env, 'OSQ_MODEL');
    const config = defineConfig({ harness: 'codex', codex: { effort: 'xhigh' } });
    assert.equal(resolveCodexEffort(config), 'xhigh');
    assert.equal(resolveHarnessModel('codex', config), 'default');
    assert.equal(resolveHarnessEffort('codex', config), 'xhigh');

    const agy = defineConfig({});
    assert.equal(resolveHarnessModel('agy', agy), DEFAULT_CONFIG.agy?.model);
    assert.equal(resolveHarnessEffort('agy', agy), null);
  });

  it('accepts a Codex planner with a model and rejects planner.agent', () => {
    const planner = defineConfig({
      planner: { harness: 'codex', model: 'gpt-5-codex' },
    });
    assert.deepEqual(planner.planner, { harness: 'codex', model: 'gpt-5-codex' });

    assert.throws(
      () => defineConfig({ planner: { harness: 'codex', model: 'm', agent: 'osq-planner' } }),
      /planner\.agent is unsupported for the codex harness/,
    );
    assert.throws(
      () => defineConfig({ planner: { harness: 'codex', model: '' } }),
      /planner\.model must be a non-empty string/,
    );
    assert.throws(
      () => defineConfig({ planner: { harness: 'unknown', model: 'm' } }),
      /Unsupported planner harness: "unknown"/,
    );
  });

  it('loadConfig merges codex settings and applies OSQ_MODEL only to a Codex executor', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      "export default { harness: 'codex', codex: { bin: '/config/codex', effort: 'high' } };\n",
      'utf8',
    );
    const config = await loadConfig(tmpDir);
    assert.equal(config.harness, 'codex');
    assert.equal(config.codex?.bin, '/config/codex');
    assert.equal(config.codex?.effort, 'high');

    process.env.OSQ_MODEL = 'from-env';
    const withEnv = await loadConfig(tmpDir);
    assert.equal(withEnv.codex?.model, 'from-env');

    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      "export default { harness: 'agy' };\n",
      'utf8',
    );
    const agy = await loadConfig(tmpDir);
    assert.equal(agy.codex?.model, undefined, 'OSQ_MODEL must not populate codex for agy');
  });
});
