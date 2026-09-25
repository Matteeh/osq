# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Change folder in verify environment
<!-- source: src/core/run/verification.ts, src/watcher/verify.ts, src/core/lifecycle/verification-record.ts, src/core/lifecycle/retry.ts, tests/osq-change-env.test.ts -->
`runVerificationCommand` SHALL take the change folder as a required argument,
either an absolute path or null. It SHALL run the command with the process
environment plus `OSQ_CHANGE` set to that path. With null, it SHALL run with
`OSQ_CHANGE` removed. Every watcher verify SHALL pass the change folder it runs
for: a task's pre-spawn and post-exit verify, the change-level verify, the
archive-time verifies, and the scope-regression audit. So SHALL the
recertification verify of `osq retry`. The `check` command of an archived
change SHALL run with null, because its deltas are already in the living spec.

#### Scenario: Task verify sees its change
- **WHEN** the watcher runs a task whose verify prints `OSQ_CHANGE`
- **THEN** the recorded `verify_ran` output is the absolute path of the change folder

#### Scenario: Archived check runs without it
- **WHEN** `osq check` runs an archived change's check command while the shell has `OSQ_CHANGE` set
- **THEN** the command sees no `OSQ_CHANGE`
