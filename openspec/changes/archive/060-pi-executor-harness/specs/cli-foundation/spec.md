# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Pi configuration and resolution
<!-- source: src/core/foundation/config*.ts, src/core/foundation/harness-catalog.ts, src/index.ts, tests/pi/** -->
Configuration SHALL accept harness `pi` and a publicly exported `PiConfig` with
optional non-empty `bin`, `provider`, `model`, and `thinking` strings, and SHALL
reject blank or non-string values naming the key. The binary SHALL resolve from
`pi.bin`, then `OSQ_PI_PATH`, then `pi`. The model SHALL resolve from
`pi.model`, then `OSQ_MODEL` only when Pi is the executor, then Pi's native
default. Effort SHALL be `pi.thinking` or null. The catalog entry SHALL declare
`planner.agent` unsupported.

#### Scenario: Explicit settings win
- **WHEN** `pi.bin` and `pi.model` are set and `OSQ_PI_PATH` and `OSQ_MODEL` are also set
- **THEN** osq uses `pi.bin` and `pi.model`

#### Scenario: Blank setting
- **WHEN** `pi.provider` is an empty string
- **THEN** configuration fails with a message naming `pi.provider`

### Requirement: Pi diagnostics
<!-- source: src/core/foundation/doctor.ts, src/core/foundation/harness-catalog.ts, src/core/foundation/config-pi.ts, tests/pi/** -->
A catalog entry MAY declare an optional `diagnose` hook, and doctor SHALL run
it after a passing `harness` check without naming any harness. For Pi it SHALL
add a `harness-version` check that warns, without failing, outside
`>=0.87.0 <0.88.0`, and, when `pi.provider` is set, a `harness-auth` check that
runs `pi auth check --provider <name> --json` and fails unless the status is
`ready`, printing the provider and reason.

#### Scenario: Not ready
- **WHEN** doctor runs with `pi.provider: 'deepseek'` and the auth check prints `not_ready` with reason `credentials_not_configured`
- **THEN** the `harness-auth` check fails naming `deepseek` and `credentials_not_configured`

#### Scenario: Untested version
- **WHEN** `pi --version` prints `0.88.0`
- **THEN** the `harness-version` check passes with a warning naming `0.88.0` and the tested range

#### Scenario: No provider
- **WHEN** `pi.provider` is not set
- **THEN** doctor runs no auth check

### Requirement: Pi consumer guidance
<!-- source: README.md -->
The README SHALL describe the Pi harness: its settings and their precedence,
installation, the tested version range, credentials and `pi auth check`, that
setup writes no Pi files because Pi reads `AGENTS.md`, the flags osq passes,
that Pi has no sandbox or permission prompts, and that Pi cannot plan.

#### Scenario: Reading the Pi section
- **WHEN** a consumer reads the README's Pi section
- **THEN** it finds a config example with placeholder provider and model, and an honest statement that task scope is a protocol, not confinement
