## ADDED Requirements

### Requirement: Agy permissions
`DEFAULT_CONFIG.agy.dangerouslySkipPermissions` SHALL be `false`. The agy
adapter SHALL pass `--dangerously-skip-permissions` to a task or an
interactive session only when `agy.dangerouslySkipPermissions` is `true`. A
headless agy run denies every tool call it cannot prompt for, so the agy
adapter's `preflight` SHALL reject, before any task spawns, when that setting
is not `true`, with an error naming `agy.dangerouslySkipPermissions`.

#### Scenario: Bypass not set
- **WHEN** the agy adapter builds a task's argv and runs its preflight with `agy.dangerouslySkipPermissions` unset
- **THEN** the argv has no `--dangerously-skip-permissions`, and the preflight rejects naming `agy.dangerouslySkipPermissions`

#### Scenario: Bypass set on purpose
- **WHEN** `agy.dangerouslySkipPermissions` is `true`
- **THEN** the task argv and the interactive argv carry `--dangerously-skip-permissions`, and the preflight resolves

#### Scenario: Interactive planning without the bypass
- **WHEN** `AgyAdapter.spawnInteractive` runs with `agy.dangerouslySkipPermissions` unset
- **THEN** its argv has no `--dangerously-skip-permissions`, and agy prompts the human as usual
