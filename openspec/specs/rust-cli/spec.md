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
`DoctorFeature` and `RetryFeature`, each built with `new()` where its crate
offers one. The registry is the one list of features; help and dispatch
read only it; a crate with no `Feature` is not in it.

#### Scenario: Registered features
- **WHEN** a test reads `features()`
- **THEN** their names are `plan`, `approve`, `run`, `archive`, `land`, `inbox`, `report`, `show`, `lint`, `doctor` and `retry`, in that order

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
`run_cli` SHALL call `run` on the first feature whose `commands()` lists
the name, with `Invocation::new(root, name, <the other arguments>)`. An
`Output` gives its `text` on stdout and code 0. A `FeatureError` gives its
display and `\n` on stderr and code 1. A name no feature lists gives
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
