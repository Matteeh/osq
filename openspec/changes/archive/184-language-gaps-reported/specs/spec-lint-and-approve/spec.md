## ADDED Requirements

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
- **THEN** its notices include `language_gap`, amber, label `gates miss a language`, detail `Rust in task 2, task 3: no test-modification gate, denied-dependency gate`

#### Scenario: TypeScript only
- **WHEN** every task of a fixture change scopes only `.ts` files and `package.json`
- **THEN** its notices hold no `language_gap`
