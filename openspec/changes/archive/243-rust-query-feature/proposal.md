---
title: The report feature runs osq query on the Rust read model and prints what TypeScript prints
depends_on: ["239", "240"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-storage]
---
## Goal

`crates/features/report` is a placeholder, and no feature crate implements
core's `Feature` trait yet. The storage kernel already builds all sixteen
`osq query` tables, so `osq query` is the smallest feature that exercises
the trait end to end: arguments in, the read model built and read, text or
a typed error out.

`osq-feature-report` gains `ReportFeature`, whose one command, `query`,
prints the table list with no argument and the rows of one read-only
SELECT otherwise, byte for byte as TypeScript's `runQuery` prints them, and
refuses a write, a pragma, an attach, a hidden table or a second statement
with TypeScript's message. A golden test runs 41 fixed queries on two
fixture projects and compares them with what TypeScript printed once.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test with
the corpus tests, and the mutation check on the lines this change touches.
That covers the golden run and refusal cases, the feature's name, commands
and argument errors, the path rewriting, the cache files and the refusals
that write nothing.

## Non-goals

- `osq report`'s other sections, the dashboard, and any CLI or server wiring; no app registers the feature yet.
- `osq query --json`, and `osq label`.
- Any change to the storage kernel, core, or the TypeScript `osq query`.
- Keeping the read model between runs: every query that runs rebuilds it, as TypeScript builds its tables for every query.

## Surface

None

## Decisions

- ADR 022: `osq-feature-report` depends on `osq-core` and `osq-kernel-storage` only, never on another feature, and reads the project only through the read model `build_read_model` writes.
- ADR 023: `run` is a thin orchestrator; the table list, the cell text, the denial causes and the semicolon trim are small pure private functions, and every item has a doc comment.
- ADR 024: every public function's doc ends with `Implements: rust-report/<requirement>`, and every test's doc names `Covers: rust-report/<scenario>`.
- ADR 025: the feature reads today's change folders as they are, through the storage kernel, and writes only its cache under `.osq/`.
- ADR 026: no OpenSpec parsing happens here; the storage kernel does what it needs.
- ADR 027: the change touches only the report crate and `Cargo.lock`, so it locks no other crate.
- ADR 028: `ReportFeature` is the crate's one public item, a unit struct with no connection; it opens the read model inside each `run` and builds every core value through its constructors.

## Assumptions

- The read model is cached at `<root>/.osq/read-model.sqlite`, beside TypeScript's `.osq/index.sqlite`, with the same `.osq/.gitignore` of `*` that TypeScript's stream index writes; ADR 022 says the model is cached in SQLite and may be deleted at any time.
- The `HOME` environment variable stands in for Node's `os.homedir()`, which reads it first on Linux and macOS.
- Rust's `f64` `Display` and JavaScript's `String` print the same text for every real between 1e-6 and 1e21, which covers every real the read model holds.
- rusqlite's bundled SQLite calls the authorizer in the same order as Node's SQLite: the planner checked `CREATE`, `DROP`, `DETACH`, `sqlite_master`, the syntax error and the second statement with rusqlite 0.40.2.
- `golden/queries.json` was printed by the planner with TypeScript's `runQuery` from the build at commit 6eea4c1c, on copies of the storage kernel's `history` and `bad-labels` fixtures; its sha256 is `d05d9c267201f82d49d5cef83461f096c0db7a464abbc1a75e6fc3ad60404fe7`. The planner also checked that `build_read_model` gives the same sixteen tables' rows, in the same order, on the `history` fixture.
- Task 1 adds `osq-kernel-storage` and `rusqlite` with its `hooks` feature to the report crate, so it scopes `Cargo.lock`; a parallel change that also scopes `Cargo.lock` waits for this one, or this one for it.

## Contract

### Requirement: Report feature

See `specs/rust-report/spec.md`.

### Requirement: Query arguments

See `specs/rust-report/spec.md`.

### Requirement: Query output parity

See `specs/rust-report/spec.md`.

### Requirement: Query table list

See `specs/rust-report/spec.md`.

### Requirement: Query rows

See `specs/rust-report/spec.md`.

### Requirement: Query cache

See `specs/rust-report/spec.md`.

### Requirement: Query cells

See `specs/rust-report/spec.md`.

### Requirement: Query errors

See `specs/rust-report/spec.md`.

### Requirement: Query refusals

See `specs/rust-report/spec.md`.

### Requirement: Query denial causes

See `specs/rust-report/spec.md`.

### Requirement: Query other denials

See `specs/rust-report/spec.md`.

### Requirement: Query second statement

See `specs/rust-report/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-report/spec.md`: ADDED "Report feature", "Query arguments", "Query output parity", "Query table list", "Query rows", "Query cache", "Query cells", "Query errors", "Query refusals", "Query denial causes", "Query other denials" and "Query second statement".

Tasks 1 and 2 share `crates/features/report/src/query.rs`; task 2 runs after task 1. Task 2's test reads `crates/features/report/tests/support/mod.rs` and `tests/fixtures/`, golden file included, which task 1 writes, without changing them.
