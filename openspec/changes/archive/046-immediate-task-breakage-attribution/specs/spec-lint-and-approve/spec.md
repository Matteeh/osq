# Spec Delta: Spec Lint and Approve

## ADDED Requirements

### Requirement: Harness event fixture scope warning
<!-- source: src/core/linter.ts, tests/linter.test.ts -->
The linter SHALL use the shared deterministic scope resolution already computed
for each task to detect harness implementation scope without corresponding
event fixture coverage. When resolved scope contains any file below
`src/harness/` but contains no file below `tests/fixtures/events/`, lint SHALL
emit one deterministic non-failing warning for that task naming
`tests/fixtures/events/`.

The warning SHALL be absent when an exact fixture file, the fixture directory,
or a supported glob declaration resolves fixture content. It SHALL NOT add a
second scope matcher or make an otherwise valid change fail.

#### Scenario: Harness scope omits event fixtures
- **WHEN** a task resolves at least one `src/harness/` file and no `tests/fixtures/events/` file
- **THEN** lint remains valid and emits one warning naming the task and `tests/fixtures/events/`

#### Scenario: Harness scope includes event fixtures
- **WHEN** the same task's exact, directory, or glob scope resolves content under `tests/fixtures/events/`
- **THEN** lint emits no harness event fixture warning
