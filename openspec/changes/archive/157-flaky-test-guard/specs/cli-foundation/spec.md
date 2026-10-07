## ADDED Requirements

### Requirement: Change verify rerun count
Configuration SHALL accept `gates.changeVerifyReruns`, a non-negative integer
defaulting to 1: the most times the runner reruns a failing change-level
verify at one task boundary when its failing tests are unrelated to the task,
as watcher-and-harness "Change verify rerun after unrelated failures"
describes. `0` SHALL turn reruns off. A partial `gates` block SHALL keep the
default, and any other value SHALL fail validation with an error naming
`gates.changeVerifyReruns`.

README's "Gates and permissions" SHALL describe the rerun in its "Change
verification after every task" bullet: which failures are rerun,
`gates.changeVerifyReruns` with its default of 1 and `0` turning it off, the
`change_verify_rerun` event, and the `Flaky tests:` section of `osq report`.

#### Scenario: Default rerun count
- **WHEN** `defineConfig({})` or `defineConfig({ gates: { preSpawnVerify: 'off' } })` runs
- **THEN** `gates.changeVerifyReruns` is 1

#### Scenario: Reruns off
- **WHEN** configuration declares `gates.changeVerifyReruns: 0`
- **THEN** resolved configuration retains 0 while preserving the other gate defaults

#### Scenario: Invalid rerun count
- **WHEN** `gates.changeVerifyReruns` is -1, 1.5, `NaN`, or `'one'`
- **THEN** configuration validation fails with an error naming `gates.changeVerifyReruns`

#### Scenario: README describes the rerun
- **WHEN** README's "Gates and permissions" section is read
- **THEN** its "Change verification after every task" bullet names `gates.changeVerifyReruns`, its default of 1, `change_verify_rerun`, and `Flaky tests:`
