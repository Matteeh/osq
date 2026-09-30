## ADDED Requirements

### Requirement: Confinement configuration
`osq.config.ts` MAY set `confinement`, an object whose only key is `roles`.
`roles` MAY set `prepare`, `agent`, and `verify`, each an object whose only
key is `env`, a list of environment variable names. The resolved config SHALL
always hold `confinement.roles` with all three roles, and a role the config
leaves out SHALL default to `{ env: [] }`. Validation SHALL fail with:

- `confinement must be an object` when `confinement` is not an object
- `confinement.<key> is not supported` for any key other than `roles`
- `confinement.roles must be an object` when `roles` is not an object
- `confinement.roles.<key> is not a role; use prepare, agent, or verify` for
  any other role key
- `confinement.roles.<role>.<key> is not supported` for any key other than
  `env`
- `confinement.roles.<role>.env must be a list of environment variable names`
  when `env` is not an array of strings each matching
  `^[A-Za-z_][A-Za-z0-9_]*$`

The block lives in `src/core/foundation/config-confinement.ts`, which exports
the `ConfinementRole` type, `CONFINEMENT_ROLES`, `ConfinementConfig`,
`DEFAULT_CONFINEMENT_CONFIG`, and `validateConfinementConfig`.
`OsqUserConfig` SHALL accept a partial `confinement` block.

#### Scenario: Default
- **WHEN** a project's config sets no `confinement`
- **THEN** the resolved `confinement.roles` is `{ prepare: { env: [] }, agent: { env: [] }, verify: { env: [] } }`

#### Scenario: One role
- **WHEN** it sets `confinement: { roles: { verify: { env: ['DATABASE_URL'] } } }`
- **THEN** the resolved verify role's `env` is `['DATABASE_URL']`, and prepare's and agent's are empty

#### Scenario: Unknown role
- **WHEN** it sets `confinement: { roles: { planner: { env: [] } } }`
- **THEN** defining the config fails with `confinement.roles.planner is not a role; use prepare, agent, or verify`

#### Scenario: Flat key
- **WHEN** it sets `confinement: { verifyEnv: ['X'] }`
- **THEN** defining the config fails with `confinement.verifyEnv is not supported`

#### Scenario: Bad name
- **WHEN** it sets `confinement: { roles: { verify: { env: ['NOT A NAME'] } } }`
- **THEN** defining the config fails with `confinement.roles.verify.env must be a list of environment variable names`

### Requirement: Harness agent environment names
Every harness catalog entry SHALL declare `agentEnv`, the environment
variable names its harness reads for its model provider and its own
configuration:

- `agy`: `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT`
- `opencode`: `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, `OPENCODE_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY`, `MISTRAL_API_KEY`
- `mock`: none
- `codex`: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `CODEX_HOME`
- `pi`: `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_OAUTH_TOKEN`, `OPENAI_API_KEY`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_BASE_URL`, `AZURE_OPENAI_RESOURCE_NAME`, `AZURE_OPENAI_API_VERSION`, `AZURE_OPENAI_DEPLOYMENT_NAME_MAP`, `DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `XAI_API_KEY`, `FIREWORKS_API_KEY`, `TOGETHER_API_KEY`, `OPENROUTER_API_KEY`, `AI_GATEWAY_API_KEY`, `ZAI_API_KEY`, `MISTRAL_API_KEY`, `MINIMAX_API_KEY`, `MOONSHOT_API_KEY`, `OPENCODE_API_KEY`, `KIMI_API_KEY`, `PI_CODING_AGENT_DIR`
- `claude`: `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CONFIG_DIR`

A variable a harness needs beyond these, such as cloud credentials for a
hosted model, is listed by the project in `confinement.roles.agent.env`.

#### Scenario: Every entry declares names
- **WHEN** the catalog is read
- **THEN** every entry has an `agentEnv` array, `mock`'s is empty, and `claude`'s holds `ANTHROPIC_API_KEY`
