# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Focused test command
<!-- source: src/core/foundation/config-traceability.ts, tests/focused-config.test.ts -->
`traceability.focusedTests` in `osq.config.ts` MAY hold a command containing
`{files}`. It is unset by default, and the resolved `traceability` block SHALL
leave it out when unset. Any other value SHALL make `defineConfig` throw
`traceability.focusedTests must be a command containing {files}`. osq documents
`node --test --test-reporter=tap {files}` as the reference command.

#### Scenario: Unset by default
- **WHEN** `osq.config.ts` sets `traceability.capabilities` but not `focusedTests`
- **THEN** the resolved `traceability` block has no `focusedTests`

#### Scenario: Missing placeholder
- **WHEN** `traceability.focusedTests` is `node --test`
- **THEN** `defineConfig` throws `traceability.focusedTests must be a command containing {files}`
