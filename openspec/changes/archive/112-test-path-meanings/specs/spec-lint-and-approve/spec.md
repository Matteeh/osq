## MODIFIED Requirements

### Requirement: Test modification declaration validation
The linter SHALL validate that tasks altering existing tests explicitly declare
`tests.modify: true`. It SHALL identify existing test files through the shared
deterministic scope resolver without maintaining another glob matcher or tree
walker. A test file is one that `isGatedTestPath` accepts, as
watcher-and-harness's "Test gate paths" says. The frozen test reach warning and
the approval digest's existing tests SHALL use the same function.

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

#### Scenario: Named test outside tests
- **WHEN** a task's scope resolves to an existing `src/quote.test.ts` and `tests.modify` is false
- **THEN** linter raises no `tests.modify` finding for it
