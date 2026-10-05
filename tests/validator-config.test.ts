import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  DEFAULT_VALIDATOR_TIMEOUT_SECONDS,
  type ValidatorConfig,
  validateValidatorConfig,
  validatorRunConfig,
} from '../src/core/foundation/config-validator.js';
import { defineConfig, loadConfig } from '../src/core/foundation/config.js';

const CATALOG_ERROR = 'validator.harness must be one of: agy, opencode, mock, codex, pi, claude';

describe('validator configuration', () => {
  it('defaults the timeout to 900 seconds', () => {
    assert.equal(DEFAULT_VALIDATOR_TIMEOUT_SECONDS, 900);
  });

  it('leaves validator out when the block is unset', () => {
    const config = defineConfig({});
    assert.equal('validator' in config, false);
    assert.equal(validateValidatorConfig(undefined), undefined);
  });

  it('resolves a given block over the defaults', () => {
    const config = defineConfig({
      validator: { harness: 'claude', model: 'claude-opus-5-5' },
    });
    assert.deepEqual(config.validator, {
      enabled: true,
      harness: 'claude',
      model: 'claude-opus-5-5',
      timeoutSeconds: 900,
    });
  });

  it('never borrows the executor model', () => {
    assert.throws(
      () =>
        defineConfig({
          harness: 'claude',
          claude: { model: 'claude-sonnet-5-5' },
          validator: { harness: 'claude' },
        }),
      /^Error: validator\.model must be a non-empty string$/,
    );
  });

  it('resolves an empty harness and model while disabled', () => {
    const config = defineConfig({ validator: { enabled: false } });
    assert.deepEqual(config.validator, {
      enabled: false,
      harness: '',
      model: '',
      timeoutSeconds: 900,
    });
  });

  it('checks a given harness and model while disabled', () => {
    assert.throws(
      () => defineConfig({ validator: { enabled: false, harness: 'nope' } }),
      new RegExp(`^Error: ${CATALOG_ERROR}$`),
    );
    assert.throws(
      () => defineConfig({ validator: { enabled: false, model: '  ' } }),
      /^Error: validator\.model must be a non-empty string$/,
    );
  });

  it('rejects an unknown validator harness with the catalog names', () => {
    assert.throws(
      () => defineConfig({ validator: { harness: 'nope', model: 'm' } }),
      new RegExp(`^Error: ${CATALOG_ERROR}$`),
    );
  });

  it('trims and canonicalizes the harness and model', () => {
    assert.deepEqual(validateValidatorConfig({ harness: '  CLAUDE ', model: '  m  ' }), {
      enabled: true,
      harness: 'claude',
      model: 'm',
      timeoutSeconds: 900,
    });
  });

  it('accepts a positive timeoutSeconds and rejects the rest', () => {
    assert.equal(
      validateValidatorConfig({ harness: 'claude', model: 'm', timeoutSeconds: 120 })
        ?.timeoutSeconds,
      120,
    );
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '900', null]) {
      assert.throws(
        () => validateValidatorConfig({ harness: 'claude', model: 'm', timeoutSeconds: bad }),
        /^Error: validator\.timeoutSeconds must be a positive number$/,
      );
    }
  });

  it('rejects a non-object block', () => {
    for (const bad of [null, [], 'claude', 7]) {
      assert.throws(() => validateValidatorConfig(bad), /^Error: validator must be an object$/);
    }
  });

  it('rejects an unsupported key', () => {
    assert.throws(
      () => validateValidatorConfig({ harness: 'claude', model: 'm', extra: true }),
      /^Error: validator\.extra is not supported$/,
    );
  });

  it('rejects a non-boolean enabled', () => {
    assert.throws(
      () => validateValidatorConfig({ enabled: 'yes', harness: 'claude', model: 'm' }),
      /^Error: validator\.enabled must be a boolean$/,
    );
  });

  it('rejects a missing or non-string harness while enabled', () => {
    for (const bad of [undefined, 7, null]) {
      assert.throws(
        () => validateValidatorConfig({ harness: bad, model: 'm' }),
        new RegExp(`^Error: ${CATALOG_ERROR}$`),
      );
    }
  });

  it('rejects a missing model while enabled', () => {
    assert.throws(
      () => validateValidatorConfig({ harness: 'claude' }),
      /^Error: validator\.model must be a non-empty string$/,
    );
  });
});

describe('validatorRunConfig', () => {
  const base = defineConfig({
    harness: 'pi',
    pi: { model: 'deepseek-flash' },
    validator: { harness: 'claude', model: 'claude-opus-5-5' },
  });

  it('sets the validator harness and its section model, leaving the rest', () => {
    const validator = base.validator as ValidatorConfig;
    const run = validatorRunConfig(base, validator);
    assert.equal(run.harness, 'claude');
    assert.equal(run.claude?.model, 'claude-opus-5-5');
    assert.equal(run.pi?.model, 'deepseek-flash');
  });

  it('does not add a section for a harness without a configKey', () => {
    const run = validatorRunConfig(base, {
      enabled: true,
      harness: 'mock',
      model: 'anything',
      timeoutSeconds: 900,
    });
    assert.equal(run.harness, 'mock');
    assert.equal(run.pi?.model, 'deepseek-flash');
  });
});

describe('validator config loading', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-validator-config-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('loadConfig resolves a validator from osq.config.ts', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      "export default { harness: 'pi', pi: { model: 'deepseek-flash' }, validator: { harness: 'claude', model: 'claude-opus-5-5' } };",
      'utf8',
    );
    const config = await loadConfig(tmpDir);
    assert.deepEqual(config.validator, {
      enabled: true,
      harness: 'claude',
      model: 'claude-opus-5-5',
      timeoutSeconds: 900,
    });
  });
});
