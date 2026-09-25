# Spec Delta: Spec Lint and Approve

## ADDED Requirements

### Requirement: ADR check modification flag
<!-- source: src/core/spec/digest-decisions.ts, src/core/spec/digest.ts, tests/adr-check-flag.test.ts -->
The digest SHALL raise one `adr_check_modified` flag for each task with
`tests.modify: true`, each accepted ADR, and each of that ADR's check files
that the task's resolved scope paths include. The label SHALL be
`task <n> may modify a check of ADR <number>` and the excerpt
`<file> enforces ADR <number>: <rule> Record it as Departs from ADR <number>: in ## Decisions.`
These flags SHALL come after the `adr_departure` flags, in task-number, ADR
number, and file order, and SHALL be recorded in the manifest's
`approvalFlags` like the other flags. A task without `tests.modify: true`
SHALL raise none.

#### Scenario: Authorized check edit
- **WHEN** accepted ADR 009 checks `tests/adapter-imports.test.ts` and task 2 declares `tests.modify: true` with that file in scope
- **THEN** one `adr_check_modified` flag labelled `task 2 may modify a check of ADR 009` names the file

#### Scenario: Frozen check stays frozen
- **WHEN** the same task lacks `tests.modify: true`
- **THEN** no `adr_check_modified` flag fires, and an edit to the file kills the task with `undeclared_test_change`
