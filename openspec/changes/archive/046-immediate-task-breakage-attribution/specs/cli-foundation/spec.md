# Spec Delta: CLI Foundation

## MODIFIED Requirements

### Requirement: Configuration loading and schema validation
<!-- source: src/core/config.ts, src/core/config-gates.ts, tests/config.test.ts -->
The system SHALL load operational configuration from `osq.config.ts` merged
over `DEFAULT_CONFIG` using the `defineConfig` helper. Public configuration
SHALL contain `gates.changeVerifyAfterTask`, a boolean defaulting to `true`.
Partial gate configuration SHALL merge over that default and invalid gate
values SHALL be rejected.

#### Scenario: Default configuration resolution
- **WHEN** no `osq.config.ts` exists in the project root
- **THEN** system defaults harness to `agy`, maxConcurrency to 1, maxScopeFiles to 8, timeouts to standard limits, and `gates.changeVerifyAfterTask` to true

#### Scenario: Environment variable overrides
- **WHEN** `OSQ_HARNESS` or `OSQ_MODEL` is set in the process environment or `.env`
- **THEN** system overrides the corresponding configuration values

#### Scenario: Incremental verification opt-out
- **WHEN** configuration declares `gates.changeVerifyAfterTask: false`
- **THEN** resolved configuration retains false while preserving all unrelated gate defaults

#### Scenario: Invalid incremental verification toggle
- **WHEN** `gates.changeVerifyAfterTask` is present with a non-boolean value
- **THEN** configuration validation fails with a diagnostic naming the key

### Requirement: Repository health diagnostics
<!-- source: src/cli/doctor.ts, src/core/doctor.ts, src/core/config*.ts, tests/doctor.test.ts -->
The CLI SHALL provide a doctor command that validates configuration, harness binary availability, managed blocks, lock states, archive integrity, and the pinned OpenSpec validator.

#### Scenario: Doctor passes on healthy repository
- **WHEN** user executes `osq doctor` in a properly configured repository with the pinned validator
- **THEN** command prints one status line per check (`config`, `harness`, `managed-blocks`, `locks`, `archives`, `validator`) and exits with code 0

#### Scenario: Doctor fails on check violation
- **WHEN** any diagnostic check fails (invalid config, missing harness binary, drift in managed blocks, orphaned locks, invalid archives, or validator drift)
- **THEN** command reports the failed check line and exits with code 1

#### Scenario: Doctor fails on validator drift
- **WHEN** the installed OpenSpec validator version differs from the pinned version
- **THEN** command reports a failing `validator` line describing version drift and exits with code 1

#### Scenario: Doctor rejects an incomplete gate configuration
- **WHEN** the resolved configuration lacks a boolean `gates.changeVerifyAfterTask`
- **THEN** the doctor config check fails as invalid or incomplete
