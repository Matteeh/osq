# rust-cli Specification

## Purpose
The `osq-rs` binary in the `osq-cli` app crate: it holds the registry of the feature crates, parses a command line, runs the command through the feature that lists it, and prints its output or error. It holds no workflow logic of its own, as ADR 022 and ADR 028 say.

## Requirements

### Requirement: Code ownership
<!-- source: crates/apps/cli/** -->
The rust-cli capability SHALL own the `osq-cli` crate: its manifest, its
source, its tests and their fixtures.

#### Scenario: CLI crate ownership
- **WHEN** file ownership is resolved for the CLI app
- **THEN** system maps `crates/apps/cli/**` to rust-cli

### Requirement: Feature registry
`features()` in `osq-cli` SHALL return one `Box<dyn Feature>` for every
feature crate that implements `Feature`, in this order: `PlanFeature`,
`ApproveFeature`, `RunFeature`, `ArchiveFeature`, `LandFeature`,
`InboxFeature`, `ReportFeature`, `ShowFeature`, `LintFeature`,
`DoctorFeature`, `RetryFeature` and `ManualFeature`, each built with
`new()` where its crate offers one. The registry is the one list of
features; help and dispatch read only it; a crate with no `Feature` is not
in it.

#### Scenario: Registered features
- **WHEN** a test reads `features()`
- **THEN** their names are `plan`, `approve`, `run`, `archive`, `land`, `inbox`, `report`, `show`, `lint`, `doctor`, `retry` and `manual`, in that order

#### Scenario: Run through the registry
- **WHEN** `run_cli` runs with `features()`, a new empty folder under `CARGO_TARGET_TMPDIR` as the root, and the row's arguments
- **THEN** it returns an empty stdout, the row's stderr with `<root>` standing for the root, and code 1, and the root is still empty:

| Arguments | Stderr |
|---|---|
| `run`, `1` | `usage of run: expected <id> <task>\n` |
| `run`, `1`, `1` | `run failed: Spec "1" not found in <root>/openspec/changes\n` |

### Requirement: Command line result
`run_cli(features: &[Box<dyn Feature>], root: &Path, args: &[String]) ->
CliResult` in `osq-cli` SHALL run one command line, `args` without the
program name, and return `CliResult`'s `stdout`, `stderr` and `code`,
writing nothing. No arguments, or `--help` or `-h` first, give the
top-level help; `--help` or `-h` second gives that command's help, both with
code 0; anything else dispatches.

#### Scenario: Help from the features' data
- **WHEN** `run_cli` runs with two test features, `alpha` listing `one` with usage `<id>` and summary `does one`, then `beta` listing `two` with an empty usage and summary `does two`, and the row's arguments
- **THEN** it returns the row's stdout, an empty stderr and code 0:

| Arguments | Stdout |
|---|---|
| none | `Usage: osq-rs <command> [args]\n\nCommands:\n  one <id>  does one\n  two  does two\n` |
| `--help` | `Usage: osq-rs <command> [args]\n\nCommands:\n  one <id>  does one\n  two  does two\n` |
| `-h` | `Usage: osq-rs <command> [args]\n\nCommands:\n  one <id>  does one\n  two  does two\n` |
| `one`, `--help` | `Usage: osq-rs one <id>\n\ndoes one\n` |
| `two`, `-h` | `Usage: osq-rs two\n\ndoes two\n` |

### Requirement: CLI help
The top-level help SHALL be `Usage: osq-rs <command> [args]`, a blank line,
`Commands:`, then for each feature's commands in order: two spaces, the
name, ` <usage>` when the usage is not empty, two spaces and the summary. A
command's help SHALL be `Usage: osq-rs <name>`, ` <usage>` when not empty, a
blank line and the summary. Every line ends with `\n`, and every name and
text comes from `Command` data.

#### Scenario: Help lists every registered command
- **WHEN** `run_cli` runs with `features()` and the argument `--help`
- **THEN** stdout has one command line for each `Command` the registered features list, in registry and `commands()` order, and no other command line

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

### Requirement: CLI entry point
The `osq-rs` binary's `main` SHALL call `run_cli` with `features()`, the
process's current directory as the root and the process's arguments after
the program name, write the result's stdout and stderr to the process's
stdout and stderr, and exit with its code. An argument that is not valid
UTF-8, or a current directory that cannot be read, SHALL print a one-line
error to stderr and exit 1.

#### Scenario: Binary exit code
- **WHEN** the built `osq-rs` binary runs with the argument `nope`
- **THEN** it exits 1 with stderr `unknown command: nope\n`

### Requirement: Steered approval through the CLI
`run_cli` with `approve <id>` on a change rust-approve "Steered approval"
approves SHALL leave the change folder as TypeScript's `osq approve` leaves
it: approve seals the revised plan and appends its `approved` event, and
`run_command` then delivers that event to rust-retry "Approval reaction",
which clears the triggers before `run_cli` returns. Its stdout SHALL be
approve's output, its stderr empty and its code 0.

#### Scenario: Steered approvals equal TypeScript's
- **WHEN** `run_cli` runs with the registry's features and the arguments `approve`, `1` in `<root>/repo` of a scratch repository built as `golden/print-steered-goldens.mjs.txt` builds the row's case from the fixture `tests/fixtures/steered-repo`, a copy of rust-approve's `approve-repo`, with an `osq.toml` that git ignores, whose `[vcs]` table sets `enabled` as the case says, `author = "Osq Bot <bot@example.com>"` and `worktreeRoot` to `<root>/worktrees`, and then runs again with the argument `status` after the change folder's `.run/delivered/` is removed
- **THEN** the first run gives code 0, empty stderr, and stdout equal to the approval lines of `tests/fixtures/steered-golden/<case>.txt`, each followed by a newline; its commit and record sections and its `.run/` tree, written as the script writes them, equal the golden's, leaving out of the tree `.run/delivery.lock`, every file under `.run/delivered/`, every `approved` event line, and an event file left with no line; and after the second run every file under the change folder's `.run/` other than `.run/delivered/` keeps the bytes the first run left:

| Case | Git |
|---|---|
| `dead-001` | on |
| `blocked-001` | on |
| `change-001` | on |
| `git-off-001` | off |

### Requirement: Manual through the CLI
`run_cli` with `features()` SHALL run `manual` through the registry, so a
kept edit prints on stdout with code 0 and a refusal prints `manual failed:
<message>` on stderr with code 1.

#### Scenario: Manual through the CLI
- **WHEN** a scratch folder under `std::env::temp_dir()` holds `osq.toml` with `[vcs]`, `enabled = true` and `author = "osq <osq@example.com>"`, and `a.txt` (`one\n`), all committed by `git init -b main` with the local config `user.name Ada`, `user.email ada@example.com` and `commit.gpgsign false`, then `a.txt` becomes `two\n`, and `run_cli` runs with `features()`, the folder as the root, and the row's arguments in order
- **THEN** it returns the row's stdout, stderr and code, with `<commit>` standing for the first 7 characters of `git rev-parse HEAD` after the run:

| Arguments | Stdout | Stderr | Code |
|---|---|---|---|
| `manual`, `   ` | empty | `manual failed: osq manual needs a comment: osq manual "<why>"\n` | 1 |
| `manual`, `keep a` | `Kept a.txt as <commit>\n` | empty | 0 |
| `manual`, `again` | empty | `manual failed: nothing to keep: the checkout has no uncommitted edits outside openspec/changes\n` | 1 |
