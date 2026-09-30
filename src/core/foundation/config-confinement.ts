/**
 * Confinement configuration. A project lists the environment variable names
 * each role may inherit in `confinement.roles.<role>.env`. The resolved config
 * always holds all three roles; a role left out defaults to `{ env: [] }`.
 */
export const CONFINEMENT_ROLES = ['prepare', 'agent', 'verify'] as const;

export type ConfinementRole = (typeof CONFINEMENT_ROLES)[number];

export interface ConfinementRoleConfig {
  readonly env: readonly string[];
}

export interface ConfinementConfig {
  readonly roles: Readonly<Record<ConfinementRole, ConfinementRoleConfig>>;
}

export const DEFAULT_CONFINEMENT_CONFIG: ConfinementConfig = {
  roles: {
    prepare: { env: [] },
    agent: { env: [] },
    verify: { env: [] },
  },
};

/**
 * The environment variable names each harness reads for its model provider and
 * its own configuration. The agent role copies these; prepare and verify never
 * do. A harness need beyond this list is listed by the project in
 * `confinement.roles.agent.env`.
 */
export const HARNESS_AGENT_ENV: Readonly<Record<string, readonly string[]>> = {
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

/** An environment variable name: a letter or underscore, then word characters. */
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Validate an optional `confinement` block over the defaults. Missing fields
 * keep the defaults; an unknown key, unknown role, unsupported role key, and
 * an environment name that is not a valid variable name are rejected.
 */
export function validateConfinementConfig(confinement: unknown): ConfinementConfig {
  if (confinement === undefined) return DEFAULT_CONFINEMENT_CONFIG;
  if (!isPlainObject(confinement)) {
    throw new Error('confinement must be an object');
  }
  const record = confinement as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== 'roles') throw new Error(`confinement.${key} is not supported`);
  }
  const roles = record.roles;
  if (roles !== undefined && !isPlainObject(roles)) {
    throw new Error('confinement.roles must be an object');
  }
  const roleRecord = (roles ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(roleRecord)) {
    if (!isRole(key)) {
      throw new Error(`confinement.roles.${key} is not a role; use prepare, agent, or verify`);
    }
  }
  return {
    roles: {
      prepare: validateRole(roleRecord.prepare, 'prepare'),
      agent: validateRole(roleRecord.agent, 'agent'),
      verify: validateRole(roleRecord.verify, 'verify'),
    },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRole(key: string): key is ConfinementRole {
  return (CONFINEMENT_ROLES as readonly string[]).includes(key);
}

function validateRole(value: unknown, role: ConfinementRole): ConfinementRoleConfig {
  if (value === undefined) return { env: [] };
  if (!isPlainObject(value)) {
    throw new Error(`confinement.roles.${role} must be an object`);
  }
  for (const key of Object.keys(value)) {
    if (key !== 'env') throw new Error(`confinement.roles.${role}.${key} is not supported`);
  }
  return { env: validateNames(value.env, role) };
}

function validateNames(value: unknown, role: ConfinementRole): readonly string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    !value.every((name) => typeof name === 'string' && ENV_NAME_PATTERN.test(name))
  ) {
    throw new Error(`confinement.roles.${role}.env must be a list of environment variable names`);
  }
  return value as string[];
}
