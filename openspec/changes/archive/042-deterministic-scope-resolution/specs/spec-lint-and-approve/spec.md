# Spec Delta: Spec Lint and Approve

## ADDED Requirements

### Requirement: Resolved task scope overlap warning
<!-- source: src/core/scope.ts, src/core/linter.ts, tests/scope-lint.test.ts -->
The linter SHALL compare the existing files produced by the shared scope
resolver for every pair of tasks in one change. Every shared file SHALL emit a
deterministic warning naming both task numbers and the project-relative POSIX
path. Warnings SHALL NOT make an otherwise valid change fail.

Duplicate declarations within one task SHALL not warn. Missing exact paths and
unmatched globs SHALL not count as shared files. Pair and path ordering SHALL be
stable regardless of task directory or filesystem enumeration order.

#### Scenario: Two tasks resolve one file
- **WHEN** two task scopes resolve to the same existing file
- **THEN** lint warns with both task numbers and the file while remaining valid when no error exists

#### Scenario: Three tasks resolve one file
- **WHEN** three task scopes resolve to the same existing file
- **THEN** lint emits one warning for each deterministic task pair without a self-warning

#### Scenario: Declarations have no existing overlap
- **WHEN** repeated scope text names only missing exact paths or unmatched globs
- **THEN** lint emits no overlap warning

## MODIFIED Requirements

### Requirement: Test modification declaration validation
<!-- source: src/core/scope.ts, src/core/linter.ts, tests/linter.test.ts, tests/scope-lint.test.ts -->
The linter SHALL validate that tasks altering existing tests explicitly declare
`tests.modify: true`. It SHALL identify existing test files through the shared
deterministic scope resolver without maintaining another glob matcher or tree
walker.

#### Scenario: Valid test modification declaration
- **WHEN** task frontmatter declares `tests.modify: true` as a boolean
- **THEN** linter accepts the declaration and permits exact or glob-resolved existing test paths in task scope

#### Scenario: Existing test lacks declaration
- **WHEN** an exact path or glob resolves to an existing test file and `tests.modify` is false
- **THEN** linter rejects the task and identifies the resolved test file

#### Scenario: New exact test path
- **WHEN** task scope names an exact test path that does not yet exist
- **THEN** lint does not treat that null resolver entry as modification of an existing test

#### Scenario: Invalid test modification type
- **WHEN** task frontmatter provides a non-boolean value for `tests.modify`
- **THEN** linter rejects the task with a schema validation error

### Requirement: Specification lint rules and limits
<!-- source: src/core/linter.ts, tests/linter.test.ts, tests/scope-lint.test.ts -->
The system SHALL validate change folders against configured operational limits.
`maxScopeFiles` SHALL retain its established declaration-pattern meaning even
though runtime measures count resolved files. Resolved overlap SHALL remain a
warning rather than a limit or approval error.

#### Scenario: Enforcing limits
- **WHEN** a change folder is linted
- **THEN** system rejects folders exceeding declared scope-pattern, acceptance-line, contract-table, or other configured limits while reporting resolved overlaps separately as warnings
