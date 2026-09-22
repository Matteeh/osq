---
title: Immediate task breakage attribution
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - watcher-and-harness
---
## Goal

Make a task die for the breakage it caused, at the moment it caused it. After a
task's own verification passes, optionally run the change-level verifier before
completion. Independently, freeze every preexisting test file not authorized
by both `tests.modify: true` and the task's resolved scope.

## Verify

`pnpm verify`

The complete suite proves configuration and doctor validation, per-task change
verification, failure artifacts and events, scope-aware test freezing, lint
warnings, archive-time isolation, prompt retention, golden events, import
boundaries, and source line budgets without a network service, TTY, or real
model.

## Non-goals

- Changing archive-time verification behavior in `src/watcher/archiver.ts`.
- Changing the meanings of `verify_red` or `scope_regression`.
- Making the harness-event-fixture lint finding an error.
- Changing `PLANNER.md` or its template.
- Restricting creation of brand-new test files under the existing contract.

## Contract

### Requirement: Per-task change verification gate

After a task's own verification succeeds, the runner SHALL, when
`gates.changeVerifyAfterTask` is enabled, run the proposal's change-level
`verify` using `timeouts.verifyTimeoutSeconds` before writing the task's done
marker. The run SHALL use the shared watcher verification entrypoint and the
established change-level event target.

A failed or timed-out result SHALL prevent completion and kill the current task
with `change_verify_red`. This gate intentionally requires every completed task
to leave the full change verifier green. Work that breaks behavior intended to
be repaired only by a later task must be combined into one coherent task.

#### Scenario: Both verification gates pass
- **WHEN** task verification and the enabled change-level verification both exit successfully
- **THEN** the runner writes the done marker and completes the task normally

#### Scenario: Change verification fails after task verification
- **WHEN** task verification passes but the enabled change-level verification exits non-zero or times out
- **THEN** the current task dies with `change_verify_red` before any done marker or checkbox update

#### Scenario: Incremental change verification is disabled
- **WHEN** `gates.changeVerifyAfterTask` is false and task verification passes
- **THEN** the runner proceeds to completion without running the proposal verifier at that task boundary

#### Scenario: Coupled task sequence
- **WHEN** one proposed task would leave the change verifier red until a later task executes
- **THEN** those changes must be represented as one task whose final tree passes both gates

### Requirement: Dead letter recording and failure handling

The system SHALL treat `change_verify_red` as a task failure reason handled
through the existing dead-marker and dead-event lifecycle.

#### Scenario: Change verification dead letter
- **WHEN** incremental change-level verification fails or times out
- **THEN** the task's dead marker records `reason: change_verify_red`, command, exit code, timeout state when applicable, and captured failing output, while its task event stream records the matching dead reason

#### Scenario: Verification event attribution
- **WHEN** the runner executes the proposal verifier after a task
- **THEN** the existing verification event path records the run under the established change-level target

### Requirement: Incremental verification configuration

Public configuration SHALL provide `gates.changeVerifyAfterTask` as a boolean
defaulting to `true`. Configuration loading and doctor diagnostics SHALL reject
a missing or non-boolean resolved value. The gate SHALL reuse
`timeouts.verifyTimeoutSeconds`.

#### Scenario: Default gate configuration
- **WHEN** no gate override is declared
- **THEN** resolved configuration enables change-level verification after every passing task verification

#### Scenario: Explicit opt-out
- **WHEN** `osq.config.ts` declares `gates.changeVerifyAfterTask: false`
- **THEN** configuration and doctor accept the value and the runner skips only the incremental change-level gate

### Requirement: Scope-aware test modification gating

The runner SHALL snapshot every preexisting file under `tests/**` before
spawning, regardless of `tests.modify`, and SHALL resolve task scope against
that pre-spawn tree. A changed or deleted preexisting test is authorized only
when `tests.modify: true` and the resolved scope contains that file.
Unauthorized diagnostics SHALL be deterministic and name each file plus the
literal file scope entry that would authorize it.

#### Scenario: Scoped test modification
- **WHEN** `tests.modify: true` and a changed or deleted preexisting test was resolved from the task's declared scope before spawning
- **THEN** test modification gating permits that file and verification continues

#### Scenario: Out-of-scope test modification
- **WHEN** a preexisting test changes or is deleted without being resolved from the task's scope
- **THEN** the task dies with `undeclared_test_change`, even when `tests.modify: true`, and the marker names the file and required scope entry

#### Scenario: Test modification disabled
- **WHEN** `tests.modify` is false or absent
- **THEN** every changed or deleted preexisting test causes `undeclared_test_change`

#### Scenario: Brand-new test file
- **WHEN** an agent creates a test file that was absent from the pre-spawn snapshot
- **THEN** the existing new-test behavior remains unchanged

### Requirement: Harness event fixture scope warning

The linter SHALL emit a non-failing warning when a task's resolved scope
contains a file under `src/harness/` but no declared scope entry covers
`tests/fixtures/events/`. The warning SHALL name `tests/fixtures/events/`.

#### Scenario: Harness implementation without event fixtures
- **WHEN** task scope resolves a file under `src/harness/` and no scope declaration covers `tests/fixtures/events/`
- **THEN** lint remains valid but warns that the event-fixture folder is omitted

#### Scenario: Event fixtures are covered
- **WHEN** the task declares scope covering `tests/fixtures/events/`
- **THEN** the harness-event-fixture warning is absent

## Human steps

- Review the authored proposal, three capability deltas, and three task bodies,
  then run `pnpm osq approve 046` yourself. Neither the planner nor an executor
  approves the change.

## Delta

- `specs/watcher-and-harness/spec.md` defines the incremental change gate,
  `change_verify_red`, change-target verification events, and scope-aware test
  modification gating.
- `specs/cli-foundation/spec.md` defines default-on, validated
  `gates.changeVerifyAfterTask` configuration and doctor behavior.
- `specs/spec-lint-and-approve/spec.md` defines the non-failing harness event
  fixture scope warning.

Task 2 intentionally extends `src/watcher/runner.ts` and
`tests/runner-test-gating.test.ts` after task 1. No other production or test
file is intentionally shared. Golden event fixtures remain frozen because the
change adds a reason value and event target usage without changing an event
shape. Task 3 owns the two archive-oriented test files omitted from the first
plan; it aligns their configuration and event expectations with the default-on
task gate without changing archive runtime behavior.
