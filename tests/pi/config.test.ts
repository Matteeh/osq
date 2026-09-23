import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  DEFAULT_CONFIG,
  type PiConfig,
  defineConfig,
  loadConfig,
} from '../../src/core/foundation/config.js';
import {
  resolveExecutorIdentity,
  resolvePiBinary,
  resolvePiEffort,
  resolvePiModel,
} from '../../src/index.js';
import * as publicApi from '../../src/index.js';
import { envScope } from './support.js';

const env = envScope(['OSQ_PI_PATH', 'OSQ_MODEL']);

describe('Pi configuration and resolution', () => {
  let tmpDir: string;

  beforeEach(async () => {
    env.save();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-pi-config-'));
  });

  afterEach(async () => {
    env.restore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('exports PiConfig and the Pi resolution helpers from the public entry point', () => {
    const settings: PiConfig = { bin: 'pi', provider: 'deepseek', model: 'm', thinking: 'high' };
    assert.equal(settings.thinking, 'high');
    assert.equal(typeof publicApi.validatePiConfig, 'function');
    assert.equal(typeof publicApi.resolvePiBinary, 'function');
    assert.equal(typeof publicApi.resolvePiModel, 'function');
    assert.equal(typeof publicApi.resolvePiEffort, 'function');
    assert.equal(publicApi.PI_TESTED_RANGE, '>=0.87.0 <0.88.0');
  });

  it('validates pi settings and rejects blank or non-string values naming the key', () => {
    const defined = defineConfig({
      harness: 'pi',
      pi: { bin: '/opt/pi', provider: 'deepseek', model: 'deepseek-flash', thinking: 'high' },
    });
    assert.deepEqual(defined.pi, {
      bin: '/opt/pi',
      provider: 'deepseek',
      model: 'deepseek-flash',
      thinking: 'high',
    });

    for (const key of ['bin', 'provider', 'model', 'thinking'] as const) {
      assert.throws(
        () => defineConfig({ pi: { [key]: '   ' } as Partial<PiConfig> }),
        new RegExp(`pi\\.${key} must be a non-empty string`),
      );
      assert.throws(
        () => defineConfig({ pi: { [key]: 42 } as unknown as Partial<PiConfig> }),
        new RegExp(`pi\\.${key} must be a non-empty string`),
      );
    }
  });

  it('declares pi with planner.agent unsupported', () => {
    assert.equal(publicApi.lookupHarness('pi').planner.agent, false);
    assert.equal(publicApi.lookupHarness('pi').planner.briefModelWhenNative, 'default');
    assert.throws(
      () => defineConfig({ planner: { harness: 'pi', model: 'm', agent: 'osq-planner' } }),
      /planner\.agent is unsupported for the pi harness/,
    );
  });

  it('resolves the binary from pi.bin, then OSQ_PI_PATH, then pi', () => {
    Reflect.deleteProperty(process.env, 'OSQ_PI_PATH');
    assert.equal(resolvePiBinary(defineConfig({})), 'pi');

    process.env.OSQ_PI_PATH = '/env/pi';
    assert.equal(resolvePiBinary(defineConfig({ harness: 'pi' })), '/env/pi');
    assert.equal(
      resolvePiBinary(defineConfig({ harness: 'pi', pi: { bin: '/opt/pi' } })),
      '/opt/pi',
      'explicit pi.bin wins',
    );
  });

  it('resolves the model from pi.model, then OSQ_MODEL only for a Pi executor', () => {
    Reflect.deleteProperty(process.env, 'OSQ_MODEL');
    assert.equal(resolvePiModel(defineConfig({ harness: 'pi' })), undefined);

    process.env.OSQ_MODEL = 'env-model';
    assert.equal(resolvePiModel(defineConfig({ harness: 'pi' })), 'env-model');
    assert.equal(
      resolvePiModel(defineConfig({ harness: 'agy' })),
      undefined,
      'OSQ_MODEL must not leak into a non-Pi harness',
    );
    assert.equal(
      resolvePiModel(defineConfig({ harness: 'pi', pi: { model: 'explicit' } })),
      'explicit',
    );
  });

  it('resolves effort and executor identity with a default sentinel', () => {
    Reflect.deleteProperty(process.env, 'OSQ_MODEL');
    const config = defineConfig({
      harness: 'pi',
      pi: { model: 'deepseek-flash', thinking: 'high' },
    });
    assert.equal(resolvePiEffort(config), 'high');
    assert.equal(resolvePiEffort(defineConfig({ harness: 'pi' })), null);
    assert.deepEqual(resolveExecutorIdentity(config), {
      harness: 'pi',
      model: 'deepseek-flash',
      effort: 'high',
    });
    assert.deepEqual(resolveExecutorIdentity(defineConfig({ harness: 'pi' })), {
      harness: 'pi',
      model: 'default',
      effort: null,
    });
    assert.equal(DEFAULT_CONFIG.harness, 'agy');
  });

  it('loadConfig merges pi and applies OSQ_MODEL only to a Pi executor', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      "export default { harness: 'pi', pi: { bin: '/config/pi', thinking: 'medium' } };\n",
      'utf8',
    );
    const config = await loadConfig(tmpDir);
    assert.equal(config.harness, 'pi');
    assert.equal(config.pi?.bin, '/config/pi');
    assert.equal(config.pi?.thinking, 'medium');

    process.env.OSQ_MODEL = 'from-env';
    const withEnv = await loadConfig(tmpDir);
    assert.equal(withEnv.pi?.model, 'from-env');

    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      "export default { harness: 'agy' };\n",
      'utf8',
    );
    const agy = await loadConfig(tmpDir);
    assert.equal(agy.pi?.model, undefined, 'OSQ_MODEL must not populate pi for agy');
  });
});
