## ADDED Requirements

### Requirement: Validator configuration
`osq.config.ts` MAY hold a `validator` block with `enabled`, `harness`,
`model`, and `timeoutSeconds`. `validateValidatorConfig` in
`src/core/foundation/config-validator.ts` SHALL resolve it. `enabled` is a
boolean that defaults to true. `timeoutSeconds` is a positive number that
defaults to `DEFAULT_VALIDATOR_TIMEOUT_SECONDS`, 900. `harness` and `model`
are trimmed strings. While enabled, `harness` SHALL be a name in the harness
catalog and `model` SHALL be non-empty. The model SHALL never fall back to the
executor's model or to `OSQ_MODEL`. While disabled, a missing `harness` or
`model` resolves to an empty string, and a given one is checked as when
enabled. The resolved config SHALL leave `validator` out when the block is
unset. `defineConfig` SHALL throw `validator must be an object`,
`validator.<key> is not supported`, `validator.enabled must be a boolean`,
`validator.harness must be one of: <catalog names joined by ", ">`,
`validator.model must be a non-empty string`, or
`validator.timeoutSeconds must be a positive number` for any other value.

`validatorRunConfig(config, validator)` SHALL return the config the
validator's adapter runs with: `harness` set to the validator's harness and,
when that harness's catalog entry has a `configKey`, that section's `model`
set to the validator's model. Every other field SHALL be unchanged.

#### Scenario: Validator unset
- **WHEN** `defineConfig` gets no `validator` block
- **THEN** the resolved config has no `validator` key

#### Scenario: Validator defaults
- **WHEN** `defineConfig` gets `validator: { harness: 'claude', model: 'claude-opus-5-5' }`
- **THEN** the resolved `validator` is `{ enabled: true, harness: 'claude', model: 'claude-opus-5-5', timeoutSeconds: 900 }`

#### Scenario: Model never borrowed
- **WHEN** `defineConfig` gets `harness: 'claude'`, `claude: { model: 'claude-sonnet-5-5' }`, and `validator: { harness: 'claude' }`
- **THEN** it throws `validator.model must be a non-empty string`

#### Scenario: Validator off
- **WHEN** `defineConfig` gets `validator: { enabled: false }`
- **THEN** the resolved `validator` is `{ enabled: false, harness: '', model: '', timeoutSeconds: 900 }`

#### Scenario: Unknown validator harness
- **WHEN** `defineConfig` gets `validator: { harness: 'nope', model: 'm' }`
- **THEN** it throws `validator.harness must be one of: ` followed by the catalog names

#### Scenario: Run config
- **WHEN** `validatorRunConfig` gets a config with harness `pi` and `pi.model` `deepseek-flash`, and the validator `claude` with model `claude-opus-5-5`
- **THEN** the result has harness `claude` and `claude.model` `claude-opus-5-5`, and its `pi.model` is still `deepseek-flash`

### Requirement: Validator model doctor check
When the resolved config's `validator` is enabled, `osq doctor` SHALL add a
`validator-model` check after every other check. It passes with the message
`validator <harness>/<model>, executor <harness>/<model>`, where the
executor's harness and model are those `resolveExecutorIdentity` returns.
When the validator's harness and model both equal the executor's, the check
SHALL be a warning with the message
`validator uses the executor's harness and model (<harness>/<model>); its findings share the executor's blind spots`.
A missing or disabled validator SHALL add no check.

#### Scenario: Same model warns
- **WHEN** the config's harness is `claude` with `claude.model` `claude-opus-5-5` and the validator is `claude` with `claude-opus-5-5`
- **THEN** `osq doctor` prints `[warn] validator-model: validator uses the executor's harness and model (claude/claude-opus-5-5); its findings share the executor's blind spots` and its exit code is unchanged

#### Scenario: Different model passes
- **WHEN** the config's harness is `pi` with `pi.model` `deepseek-flash` and the validator is `claude` with `claude-opus-5-5`
- **THEN** the `validator-model` check passes with `validator claude/claude-opus-5-5, executor pi/deepseek-flash`

#### Scenario: No validator, no check
- **WHEN** the config has no `validator` block, or one with `enabled: false`
- **THEN** the doctor report has no `validator-model` check

### Requirement: Validator scaffold
`osq init` SHALL write the `validator` block in `osq.config.ts` commented
out, right after `maxConcurrency: 1,`, as these four lines:

```
  // A validator judges each change against its delta specs at archive and
  // records what it finds without stopping the change. Pick a model other
  // than the executor's.
  // validator: { harness: 'claude', model: '<a-different-model>' },
```

#### Scenario: Scaffolded validator is a comment
- **WHEN** `osq init` runs in an empty directory and `loadConfig` reads the result
- **THEN** `osq.config.ts` holds `  // validator: { harness: 'claude', model: '<a-different-model>' },` and the loaded config has no `validator` key

### Requirement: osq validates its own changes
osq's own `osq.config.ts` SHALL set
`validator: { harness: 'claude', model: 'claude-opus-5-5' }`, the model that
plans osq's changes, so a model other than the `pi` executor's judges them.
README SHALL describe the validator in a `### Validator` section after
`### Mutation checks`: the config block, when it runs, what it is given, the
three problems a finding names, the `validator_ran` outcomes, the `osq show`
and `osq report` sections, the `validator-model` doctor warning, and that it
never stops a change (ADR 010).

#### Scenario: Own validator
- **WHEN** `loadConfig` reads osq's own repository
- **THEN** its `validator` is `{ enabled: true, harness: 'claude', model: 'claude-opus-5-5', timeoutSeconds: 900 }`

#### Scenario: README section
- **WHEN** README is read
- **THEN** it has a `### Validator` heading after `### Mutation checks` and before `## What the watcher guarantees`, and that section names `validator_ran` and `validator-model`
