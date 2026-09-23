# Spec Delta: CLI Foundation

## MODIFIED Requirements

### Requirement: Configuration loading and schema validation
<!-- source: src/core/config.ts, src/core/config-gates.ts, tests/config.test.ts, tests/pre-spawn-config.test.ts -->
The system SHALL load operational configuration from `osq.config.ts` merged
over `DEFAULT_CONFIG` using the `defineConfig` helper. Public configuration
SHALL contain `gates.changeVerifyAfterTask`, a boolean defaulting to `true`,
and `gates.preSpawnVerify`, one of `warn`, `fail`, or `off`, defaulting to
`warn`. Partial gate configuration SHALL merge over those defaults and invalid
gate values SHALL be rejected.

#### Scenario: Default configuration resolution
- **WHEN** no `osq.config.ts` exists in the project root
- **THEN** system defaults harness to `agy`, maxConcurrency to 1, maxScopeFiles to 8, timeouts to standard limits, `gates.changeVerifyAfterTask` to true, and `gates.preSpawnVerify` to `warn`

#### Scenario: Environment variable overrides
- **WHEN** `OSQ_HARNESS` or `OSQ_MODEL` is set in the process environment or `.env`
- **THEN** system overrides the corresponding configuration values

#### Scenario: Incremental verification opt-out
- **WHEN** configuration declares `gates.changeVerifyAfterTask: false`
- **THEN** resolved configuration retains false while preserving all unrelated gate defaults

#### Scenario: Invalid incremental verification toggle
- **WHEN** `gates.changeVerifyAfterTask` is present with a non-boolean value
- **THEN** configuration validation fails with a diagnostic naming the key

#### Scenario: Pre-spawn verify mode
- **WHEN** configuration declares `gates.preSpawnVerify: fail` or `off`
- **THEN** resolved configuration retains that mode while preserving `gates.changeVerifyAfterTask`

#### Scenario: Invalid pre-spawn verify mode
- **WHEN** `gates.preSpawnVerify` is present with a value other than `warn`, `fail`, or `off`
- **THEN** configuration validation fails with a diagnostic naming the key
