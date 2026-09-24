import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  CLAUDE_MINIMUM_VERSION,
  type ClaudeConfig,
  claudeContainment,
  resolveClaudeBinary,
  resolveClaudeModel,
  validateClaudeConfig,
} from '../../src/core/foundation/config-claude.js';
import { defineConfig, loadConfig } from '../../src/core/foundation/config.js';
import {
  lookupHarness,
  resolveExecutorIdentity,
} from '../../src/core/foundation/harness-catalog.js';
import * as publicApi from '../../src/index.js';
import { envScope } from './exec-support.js';

const env = envScope(['OSQ_MODEL']);

describe('Claude configuration and resolution', () => {
  let tmpDir: string;

  beforeEach(async () => {
    env.save();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-claude-config-'));
  });

  afterEach(async () => {
    env.restore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('exports ClaudeConfig and the Claude helpers from the public entry point', () => {
    const settings: ClaudeConfig = { bin: 'claude', model: 'haiku', sandbox: true };
    assert.equal(settings.sandbox, true);
    assert.equal(typeof publicApi.validateClaudeConfig, 'function');
    assert.equal(typeof publicApi.resolveClaudeBinary, 'function');
    assert.equal(typeof publicApi.resolveClaudeModel, 'function');
    assert.equal(typeof publicApi.claudeContainment, 'function');
    assert.equal(publicApi.CLAUDE_MINIMUM_VERSION, '2.1.278');
    assert.equal(CLAUDE_MINIMUM_VERSION, '2.1.278');
  });

  it('validates claude settings and rejects invalid values naming the key', () => {
    const defined = defineConfig({
      harness: 'claude',
      claude: { bin: '/opt/claude', model: 'haiku', sandbox: true },
    });
    assert.deepEqual(defined.claude, { bin: '/opt/claude', model: 'haiku', sandbox: true });

    for (const key of ['bin', 'model'] as const) {
      assert.throws(
        () => defineConfig({ claude: { [key]: '   ' } as Partial<ClaudeConfig> }),
        new RegExp(`claude\\.${key} must be a non-empty string`),
      );
      assert.throws(
        () => defineConfig({ claude: { [key]: 42 } as unknown as Partial<ClaudeConfig> }),
        new RegExp(`claude\\.${key} must be a non-empty string`),
      );
    }

    assert.throws(
      () => defineConfig({ claude: { sandbox: 'yes' } as unknown as Partial<ClaudeConfig> }),
      /claude\.sandbox must be a boolean/,
    );
    assert.deepEqual(validateClaudeConfig(undefined), {});
  });

  it('resolves the binary from claude.bin, then claude', () => {
    assert.equal(resolveClaudeBinary(defineConfig({})), 'claude');
    assert.equal(
      resolveClaudeBinary(defineConfig({ claude: { bin: '/opt/claude' } })),
      '/opt/claude',
    );
  });

  it('resolves the model from claude.model, then OSQ_MODEL only for a Claude executor', () => {
    Reflect.deleteProperty(process.env, 'OSQ_MODEL');
    assert.equal(resolveClaudeModel(defineConfig({ harness: 'claude' }), true), undefined);

    process.env.OSQ_MODEL = 'env-model';
    assert.equal(resolveClaudeModel(defineConfig({ harness: 'claude' }), true), 'env-model');
    assert.equal(
      resolveClaudeModel(defineConfig({ harness: 'claude' }), false),
      undefined,
      'OSQ_MODEL must not leak into a non-Claude executor',
    );
    assert.equal(
      resolveClaudeModel(defineConfig({ claude: { model: 'explicit' } }), false),
      'explicit',
    );
  });

  it('reports effort null and a default sentinel for native model selection', () => {
    Reflect.deleteProperty(process.env, 'OSQ_MODEL');
    const native = resolveExecutorIdentity(defineConfig({ harness: 'claude' }));
    assert.deepEqual(native, { harness: 'claude', model: 'default', effort: null });

    const configured = resolveExecutorIdentity(
      defineConfig({ harness: 'claude', claude: { model: 'haiku' } }),
    );
    assert.deepEqual(configured, { harness: 'claude', model: 'haiku', effort: null });
  });

  it('registers claude with a config key, no unselected env model, and no planner agent', () => {
    const entry = lookupHarness('claude');
    assert.equal(entry.configKey, 'claude');
    assert.equal(entry.envModelWhenUnselected, false);
    assert.equal(entry.planner.agent, false);
    assert.equal(entry.planner.briefModelWhenNative, 'default');
    assert.throws(
      () => defineConfig({ planner: { harness: 'claude', model: 'm', agent: 'osq-planner' } }),
      /planner\.agent is unsupported for the claude harness/,
    );
  });

  it('reports the containment text for the configured sandbox setting', () => {
    const containment = lookupHarness('claude').containment;
    assert.equal(typeof containment, 'function');
    if (!containment) throw new Error('claude must declare containment');

    assert.equal(
      containment(defineConfig({ harness: 'claude' })),
      'file tools confined to the project; git denied; Bash unconfined with open network',
    );
    assert.equal(
      containment(defineConfig({ harness: 'claude', claude: { sandbox: true } })),
      'file tools confined to the project; git denied; Bash sandboxed with no network',
    );
    assert.equal(
      claudeContainment(defineConfig({ harness: 'claude', claude: { sandbox: true } })),
      containment(defineConfig({ harness: 'claude', claude: { sandbox: true } })),
    );
  });

  it('loadConfig accepts harness claude and merges its section', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      "export default { harness: 'claude', claude: { bin: '/config/claude', sandbox: true } };\n",
      'utf8',
    );
    const config = await loadConfig(tmpDir);
    assert.equal(config.harness, 'claude');
    assert.equal(config.claude?.bin, '/config/claude');
    assert.equal(config.claude?.sandbox, true);

    process.env.OSQ_MODEL = 'from-env';
    const withEnv = await loadConfig(tmpDir);
    assert.equal(withEnv.claude?.model, 'from-env');

    await fs.writeFile(
      path.join(tmpDir, 'osq.config.ts'),
      "export default { harness: 'claude', claude: { bin: '/config/claude' } };\n",
      'utf8',
    );
    const explicit = await loadConfig(tmpDir);
    assert.equal(explicit.claude?.model, 'from-env');
  });
});
