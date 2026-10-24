## MODIFIED Requirements

### Requirement: Command dispatch
`run_cli` SHALL call `run` on the first feature whose `commands()` lists
the name, with `Invocation::new(root, name, <the other arguments>)`. An
`Output` gives its `text` on stdout and its `code`. A `FeatureError` gives
its display and `\n` on stderr and code 1. A name no feature lists gives
`unknown command: <name>\n` on stderr and code 1 and calls no feature. The
other stream is empty.

#### Scenario: Commands through the binary
- **WHEN** the built `osq-rs` binary runs in a copy of the crate's fixture project, made in a new folder under `CARGO_TARGET_TMPDIR`, with the row's arguments
- **THEN** its stdout equals the text the row's feature returns from `run` with the same invocation in a second, fresh copy, its stderr is empty, and it exits 0:

| Arguments | Feature |
|---|---|
| `inbox` | `InboxFeature` |
| `queue` | `PlanFeature` |
| `query`, `SELECT 1 AS one` | `ReportFeature` |

#### Scenario: Feature error through the binary
- **WHEN** the built `osq-rs` binary runs in such a copy with the arguments `inbox` and `extra`
- **THEN** its stdout is empty, its stderr is `usage of inbox: takes no arguments\n`, and it exits 1

#### Scenario: Unknown command
- **WHEN** `run_cli` runs with features that list no `nope` and the argument `nope`
- **THEN** it returns an empty stdout, the stderr `unknown command: nope\n` and code 1, and calls no feature's `run`

#### Scenario: First feature wins
- **WHEN** `run_cli` runs with two test features that both list `same`, the first returning `Output::text("first")` and the second `Output::text("second")`, and the argument `same`
- **THEN** stdout is `first`, and the second feature's `run` is not called

#### Scenario: Output code through run_cli
- **WHEN** `run_cli` runs with one test feature listing `check`, whose `run` returns the row's output, and the argument `check`
- **THEN** it returns the row's stdout and code and an empty stderr:

| Output | Stdout | Code |
|---|---|---|
| `Output::text("fine\n")` | `fine\n` | 0 |
| `Output::with_code("bad\n", 1)` | `bad\n` | 1 |
| `Output::with_code("odd\n", 3)` | `odd\n` | 3 |
