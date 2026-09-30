import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CONFINEMENT_ROLES,
  DEFAULT_CONFINEMENT_CONFIG,
  validateConfinementConfig,
} from '../src/core/foundation/config-confinement.js';
import { DEFAULT_CONFIG, defineConfig } from '../src/core/foundation/config.js';
import { HARNESS_CATALOG, HARNESS_NAMES } from '../src/core/foundation/harness-catalog.js';
import { BASE_ENV_NAMES, buildRoleEnv } from '../src/core/run/role-env.js';

const EXPECTED_AGENT_ENV: Record<string, readonly string[]> = {
  agy: [
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_CLOUD_PROJECT',
  ],
  opencode: [
    'OPENCODE_CONFIG',
    'OPENCODE_CONFIG_DIR',
    'OPENCODE_API_KEY',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'DEEPSEEK_API_KEY',
    'OPENROUTER_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'GROQ_API_KEY',
    'XAI_API_KEY',
    'MISTRAL_API_KEY',
  ],
  mock: [],
  codex: ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'CODEX_HOME'],
  pi: [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_OAUTH_TOKEN',
    'OPENAI_API_KEY',
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_BASE_URL',
    'AZURE_OPENAI_RESOURCE_NAME',
    'AZURE_OPENAI_API_VERSION',
    'AZURE_OPENAI_DEPLOYMENT_NAME_MAP',
    'DEEPSEEK_API_KEY',
    'GEMINI_API_KEY',
    'GROQ_API_KEY',
    'CEREBRAS_API_KEY',
    'XAI_API_KEY',
    'FIREWORKS_API_KEY',
    'TOGETHER_API_KEY',
    'OPENROUTER_API_KEY',
    'AI_GATEWAY_API_KEY',
    'ZAI_API_KEY',
    'MISTRAL_API_KEY',
    'MINIMAX_API_KEY',
    'MOONSHOT_API_KEY',
    'OPENCODE_API_KEY',
    'KIMI_API_KEY',
    'PI_CODING_AGENT_DIR',
  ],
  claude: [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'CLAUDE_CONFIG_DIR',
  ],
};

describe('confinement configuration', () => {
  it('defaults every role to an empty environment', () => {
    assert.deepEqual([...CONFINEMENT_ROLES], ['prepare', 'agent', 'verify']);
    assert.deepEqual(DEFAULT_CONFIG.confinement, DEFAULT_CONFINEMENT_CONFIG);
    assert.deepEqual(defineConfig({}).confinement, {
      roles: { prepare: { env: [] }, agent: { env: [] }, verify: { env: [] } },
    });
    assert.deepEqual(validateConfinementConfig(undefined), DEFAULT_CONFINEMENT_CONFIG);
    assert.deepEqual(validateConfinementConfig({}), {
      roles: { prepare: { env: [] }, agent: { env: [] }, verify: { env: [] } },
    });
  });

  it('resolves one configured role and leaves the others empty', () => {
    const config = defineConfig({ confinement: { roles: { verify: { env: ['DATABASE_URL'] } } } });
    assert.deepEqual(config.confinement?.roles.verify.env, ['DATABASE_URL']);
    assert.deepEqual(config.confinement?.roles.prepare.env, []);
    assert.deepEqual(config.confinement?.roles.agent.env, []);
  });

  it('rejects an unknown role', () => {
    assert.throws(
      () => defineConfig({ confinement: { roles: { planner: { env: [] } } } } as never),
      /confinement\.roles\.planner is not a role; use prepare, agent, or verify/,
    );
  });

  it('rejects a flat key', () => {
    assert.throws(
      () => defineConfig({ confinement: { verifyEnv: ['X'] } } as never),
      /confinement\.verifyEnv is not supported/,
    );
  });

  it('rejects a bad environment name', () => {
    assert.throws(
      () => defineConfig({ confinement: { roles: { verify: { env: ['NOT A NAME'] } } } } as never),
      /confinement\.roles\.verify\.env must be a list of environment variable names/,
    );
  });
});

describe('harness agent environment names', () => {
  it('declares each harness its model and configuration names in order', () => {
    for (const name of HARNESS_NAMES) {
      const entry = HARNESS_CATALOG.find((candidate) => candidate.name === name);
      assert.ok(entry, `catalog holds ${name}`);
      assert.deepEqual(entry.agentEnv, EXPECTED_AGENT_ENV[name]);
    }
    const mock = HARNESS_CATALOG.find((entry) => entry.name === 'mock');
    assert.deepEqual(mock?.agentEnv, []);
    const claude = HARNESS_CATALOG.find((entry) => entry.name === 'claude');
    assert.ok(claude?.agentEnv.includes('ANTHROPIC_API_KEY'));
  });
});

describe('role environments', () => {
  it('passes base and OSQ variables and drops the secret', () => {
    const source = {
      PATH: '/usr/bin',
      HOME: '/home/osq',
      OSQ_FAKE_MODE: '1',
      AWS_SECRET_ACCESS_KEY: 'secret',
    };
    const before = { ...source };
    const env = buildRoleEnv('verify', { source });
    assert.equal(env.PATH, '/usr/bin');
    assert.equal(env.HOME, '/home/osq');
    assert.equal(env.OSQ_FAKE_MODE, '1');
    assert.equal('AWS_SECRET_ACCESS_KEY' in env, false);
    assert.ok(BASE_ENV_NAMES.includes('PATH'));
    assert.ok(BASE_ENV_NAMES.includes('NODE_EXTRA_CA_CERTS'));
    assert.deepEqual(source, before);
  });

  it('copies a configured verify name into verify only', () => {
    const config = defineConfig({ confinement: { roles: { verify: { env: ['DATABASE_URL'] } } } });
    const source = { DATABASE_URL: 'postgres://db' };
    const before = { ...source };
    assert.equal(buildRoleEnv('verify', { config, source }).DATABASE_URL, 'postgres://db');
    assert.equal('DATABASE_URL' in buildRoleEnv('prepare', { config, source }), false);
    assert.equal('DATABASE_URL' in buildRoleEnv('agent', { config, source }), false);
    assert.deepEqual(source, before);
  });

  it('gives the agent its harness keys and none of the other providers', () => {
    const source = { ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'b' };
    const before = { ...source };
    const env = buildRoleEnv('agent', { harness: 'claude', source });
    assert.equal(env.ANTHROPIC_API_KEY, 'a');
    assert.equal('OPENAI_API_KEY' in env, false);
    assert.deepEqual(source, before);
  });

  it('never gives the harness model key to verify or prepare', () => {
    const config = defineConfig({
      harness: 'claude',
      confinement: {
        roles: {
          verify: { env: ['ANTHROPIC_API_KEY'] },
          prepare: { env: ['ANTHROPIC_API_KEY'] },
        },
      },
    });
    const source = { ANTHROPIC_API_KEY: 'a' };
    assert.equal('ANTHROPIC_API_KEY' in buildRoleEnv('verify', { config, source }), false);
    assert.equal('ANTHROPIC_API_KEY' in buildRoleEnv('prepare', { config, source }), false);
  });

  it('lets extra variables win and adds nothing for an unknown harness', () => {
    const source = { OSQ_TASK_NUMBER: '9', ANTHROPIC_API_KEY: 'a' };
    const env = buildRoleEnv('agent', {
      harness: 'nope',
      source,
      extraEnv: { OSQ_TASK_NUMBER: '1' },
    });
    assert.equal(env.OSQ_TASK_NUMBER, '1');
    assert.equal('ANTHROPIC_API_KEY' in env, false);
  });

  it('builds a new object and never changes the source', () => {
    const source = { PATH: '/bin', SECRET_PROBE: 'x' };
    const before = { ...source };
    const env = buildRoleEnv('verify', { source });
    assert.notEqual(env, source);
    assert.equal('SECRET_PROBE' in env, false);
    assert.deepEqual(source, before);
  });
});
