# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Explicit retry command
<!-- source: src/cli/retry.ts, src/core/retry.ts, src/cli/index.ts, tests/retry*.test.ts -->
The CLI SHALL provide `osq retry <id> <target>` for an active change, where the
target is a numeric task or the literal `change`. Retry SHALL require matching
approval, an active dead or regressed marker, and no running marker for the
target. It SHALL refuse all invalid states without mutation and SHALL direct a
missing or stale approval to `osq approve <id>` without approving on the
caller's behalf.

#### Scenario: Retrying a failed task
- **WHEN** a user retries an approved dead or regressed numeric task that is not running
- **THEN** the CLI performs the retry transition and reports its next execution attempt

#### Scenario: Retrying a change-level regression
- **WHEN** a user runs `osq retry <id> change` for an approved change with `.run/regressed/change.md` and nothing running
- **THEN** the CLI clears the active regression through the preserving retry transition

#### Scenario: Approval remediation
- **WHEN** the approval marker is missing or its hash differs from the authored change folder
- **THEN** retry exits non-zero without mutation and names `osq approve <id>` as the next step

### Requirement: Explicit rejection command
<!-- source: src/cli/reject.ts, src/core/reject.ts, src/cli/index.ts, tests/reject.test.ts -->
The CLI SHALL provide `osq reject <id> --reason <text>` for moving an eligible
active change intact to
`openspec/changes/rejected/<original-folder-name>/`. A non-empty reason is
required. An unapproved change is eligible; an approved change is eligible only
with an active dead or regressed target and no running task. The command SHALL
refuse healthy approved, complete, running, archived, already rejected, missing,
or destination-colliding changes.

#### Scenario: Rejecting an unapproved change
- **WHEN** a user rejects an unapproved active change with a non-empty reason
- **THEN** its complete folder moves to the canonical rejected directory

#### Scenario: Rejecting an approved failed change
- **WHEN** a user rejects an approved change with an active dead or regressed target and nothing running
- **THEN** its complete folder moves without applying deltas or changing task checkboxes

#### Scenario: Rejecting an ineligible change
- **WHEN** a user targets a healthy approved, complete, running, archived, already rejected, missing, or colliding change
- **THEN** rejection exits non-zero and does not move or overwrite a folder

## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: osq.config.ts, src/cli/**, src/core/config*.ts, src/core/doctor.ts, src/core/harness-catalog.ts, src/core/init.ts, src/core/logger.ts, src/core/retry.ts, src/core/reject.ts, src/index.ts, templates/**, README.md, .env.example -->
The CLI Foundation capability SHALL own CLI entrypoints, retry and rejection
commands, configuration and shared harness capability resolution, doctor
diagnostics, logger, initialization, public configuration exports, templates,
and consumer guidance.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for CLI or configuration files
- **THEN** system maps `osq.config.ts`, `src/cli/**`, `src/core/config*.ts`, `src/core/doctor.ts`, `src/core/harness-catalog.ts`, `src/core/init.ts`, `src/core/logger.ts`, `src/core/retry.ts`, `src/core/reject.ts`, `src/index.ts`, `templates/**`, `README.md`, and `.env.example` to cli-foundation
