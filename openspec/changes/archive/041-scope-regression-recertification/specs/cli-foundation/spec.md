# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Verification placeholder guidance
<!-- source: AGENTS.md, README.md, fixture/**, tests/fixtures/** -->
Consumer guidance SHALL identify the generated
`node -e "process.exit(0)"` verify value as a planning sentinel that must be
replaced before approval. Checked-in executable fixtures SHALL use deterministic
local verification commands backed by their own fixture files rather than the
sentinel, network access, a TTY, or the repository's full verification suite.

#### Scenario: Generated placeholder is documented
- **WHEN** a planner or consumer reads repository guidance after creating a change
- **THEN** the guidance states that placeholder verification is rejected by lint and must be replaced with a final-tree command

#### Scenario: Checked-in fixture verification
- **WHEN** fixture change artifacts are inspected or executed from their fixture root
- **THEN** every verify command invokes real deterministic local behavior available within that fixture

## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: osq.config.ts, src/cli/**, src/core/config*.ts, src/core/doctor.ts, src/core/harness-catalog.ts, src/core/init.ts, src/core/logger.ts, src/core/retry.ts, src/core/reject.ts, src/index.ts, templates/**, AGENTS.md, PLANNER.md, README.md, .env.example -->
The CLI Foundation capability SHALL own CLI entrypoints, retry and rejection
commands, configuration and shared harness capability resolution, doctor
diagnostics, logger, initialization, public configuration exports, managed
agent and planner instructions, templates, and consumer guidance.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for CLI, configuration, retry, scaffolding, or managed guidance files
- **THEN** system maps `osq.config.ts`, `src/cli/**`, `src/core/config*.ts`, `src/core/doctor.ts`, `src/core/harness-catalog.ts`, `src/core/init.ts`, `src/core/logger.ts`, `src/core/retry.ts`, `src/core/reject.ts`, `src/index.ts`, `templates/**`, `AGENTS.md`, `PLANNER.md`, `README.md`, and `.env.example` to cli-foundation

### Requirement: Planner protocol rules in documentation and templates
<!-- source: PLANNER.md, templates/PLANNER.md, src/core/init.ts, tests/init-planner.test.ts -->
The managed planner block in `PLANNER.md`, `templates/PLANNER.md`, and
`src/core/init.ts` SHALL encode slicing, detail, file tool, change-level verify,
final-tree verification, and task file-ownership rules.

Every task verify SHALL exercise its complete slice through a real entrypoint
and remain safely re-runnable against the final tree of the completed change.
A file SHALL belong to one task unless a later task must extend it; that later
task SHALL be ordered after the first owner and the proposal SHALL identify the
shared file.

#### Scenario: Managed block encodes planner discipline
- **WHEN** `PLANNER.md` or `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it requires complete real-entrypoint and final-tree verifies, forbids out-of-scope executor excuses, mandates acceptance lines and reuse names without signatures or numbered steps, requires single-task file ownership with ordered documented extensions, requires file tool usage, and places change-level verify immediately after the goal

#### Scenario: Byte-equality test for planner templates
- **WHEN** `tests/init-planner.test.ts` executes
- **THEN** it asserts byte-for-byte equality between the `PLANNER.md` managed block, `templates/PLANNER.md`, and `MANAGED_PLANNER_BLOCK` in `src/core/init.ts`

### Requirement: Explicit retry command
<!-- source: src/cli/retry.ts, src/core/retry.ts, src/cli/index.ts, tests/retry*.test.ts -->
The CLI SHALL provide `osq retry <id> <target>` for an active change, where the
target is a numeric task or literal `change`. Retry SHALL require matching
approval, an active dead or regressed marker, and no running marker for the
target. It SHALL refuse invalid states without mutation and direct missing or
stale approval to `osq approve <id>` without approving for the caller.

A numeric task carrying `reason: scope_regression` and an automated done marker
SHALL be recertified by running its verify command without spawning an agent.
A pass SHALL refresh canonical done and report recertification without advancing
execution attempts. A failure SHALL requeue the task and report that agent work
is pending. Dead tasks, other regression reasons, and change-level regressions
SHALL retain their established retry behavior. No new retry flag SHALL exist.

#### Scenario: Retrying a failed task
- **WHEN** a user retries an approved dead or non-scope-regressed numeric task that is not running
- **THEN** the CLI performs the existing preserving retry transition and reports its next execution attempt

#### Scenario: Recertifying a scope-regressed task
- **WHEN** a user retries an approved numeric task with an active scope regression and automated done marker
- **THEN** the CLI reports either successful human recertification or requeue after running verification under the configured timeout

#### Scenario: Retrying another task regression
- **WHEN** a user retries an approved numeric task with a non-scope regression
- **THEN** the CLI performs the existing preserving retry transition without recertification verification

#### Scenario: Retrying a change-level regression
- **WHEN** a user runs `osq retry <id> change` for an approved change with `.run/regressed/change.md` and nothing running
- **THEN** the CLI clears the active regression through the preserving retry transition

#### Scenario: Approval remediation
- **WHEN** the approval marker is missing or its hash differs from the authored change folder
- **THEN** retry exits non-zero without mutation and names `osq approve <id>` as the next step
