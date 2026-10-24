## MODIFIED Requirements

### Requirement: Command dispatch
`run_cli` SHALL run a command only through rust-loop `run_command`, with
`Invocation::new(root, name, <the other arguments>)`, so its events are
delivered as ADR 030 says. An `Output` gives its `text` on stdout and its
`code`. A `FeatureError` gives its display and `\n` on stderr and code 1. A name
no feature lists gives `unknown command: <name>\n` on stderr and code 1 and
calls no feature. After any error, each delivery warning then adds its text
and `\n` on stderr and leaves the code as it is, and each `ReactionFailure`
then adds its display and `\n` on stderr and makes the code 1, whichever
change it names. A stream with nothing to show is empty.

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

#### Scenario: Reaction failure through the CLI
- **WHEN** `run_cli` runs the argument `make` on a scratch root holding an active change `001-a`, with a test feature `make` whose `run` appends a `rejected` line to `001-a`'s `.run/events/change.jsonl` and returns `Output::text("made")`, and a test feature `watch` reacting to `rejected` whose `react` returns `FeatureError::failed("watch", "no")`
- **THEN** stdout is `made`, stderr is `watch could not handle rejected for 001-a: watch failed: no\n`, and the code is 1

#### Scenario: Delivery warning through the CLI
- **WHEN** `run_cli` runs the argument `make` on a scratch root holding an active change `001-a`, with a test feature `make` whose `run` appends the line `not json` and `\n` to `001-a`'s `.run/events/change.jsonl` and returns `Output::text("made")`, and a test feature `watch` reacting to `rejected`
- **THEN** stdout is `made`, stderr is `watch passed over byte 0 of change.jsonl in 001-a: line is not one JSON object\n`, and the code is 0
