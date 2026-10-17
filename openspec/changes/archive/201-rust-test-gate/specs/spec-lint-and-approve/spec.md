## MODIFIED Requirements

### Requirement: Test modification declaration validation
The linter SHALL validate that tasks altering existing tests explicitly declare
`tests.modify: true`. It SHALL identify existing test files through the shared
deterministic scope resolver without maintaining another glob matcher or tree
walker. A test file is one that `gatedTestPathFilter` accepts for the
project's language map, which lint reads once with `readLanguageMap`, as
watcher-and-harness's "Test gate paths" says. The frozen test reach warning and
the approval digest's existing tests SHALL use `isGatedTestPath`.

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

#### Scenario: Existing crate test lacks declaration
- **WHEN** a temporary git project tracks `Cargo.toml`, `crates/core/Cargo.toml`, `crates/core/src/lib.rs` and `crates/core/tests/api.rs`, and a task's scope names the file in the row with `tests.modify` false
- **THEN** lint gives the row's `tests.modify` error, or none

| scope | error |
| --- | --- |
| `crates/core/tests/api.rs` | `Task in 1.md scope touches existing test files (crates/core/tests/api.rs) without tests.modify: true` |
| `crates/core/src/lib.rs` | (none) |

### Requirement: Language gap notice
Besides the notices "Approval notices" lists, `buildApprovalNotices` SHALL
add a `language_gap` notice, amber, when a task's resolved scope holds a path
whose language some gate does not cover. It reads languages from
`readLanguageMap` with every task's resolved paths as `extra`, so a manifest
the change scopes counts, and gates from `uncoveredBy`. Its label is
`gates miss a language`. Its detail has one part per such language, in the
map's language order, joined by `; `:
`<language> in task <n>, task <n>: no <gate>, <gate>`, naming the tasks in
task-number order and the gates in list order. In the notice order of "Notice
order and folding", `language_gap` comes right after
`uncovered_requirement`. The `osq approve` output and the dashboard's approve
view show it as they show every notice.

#### Scenario: Rust file in scope
- **WHEN** a fixture change's task 2 scopes `crates/core/src/lib.rs` and task 3 scopes `crates/core/Cargo.toml`, both existing
- **THEN** its notices include `language_gap`, amber, label `gates miss a language`, detail `Rust in task 2, task 3: no denied-dependency gate`

#### Scenario: TypeScript only
- **WHEN** every task of a fixture change scopes only `.ts` files and `package.json`
- **THEN** its notices hold no `language_gap`
