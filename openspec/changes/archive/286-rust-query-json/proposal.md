---
title: Rust osq query prints rows as JSON
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-storage]
---
## Goal

Agents read osq's history through `osq query`, and `osq query --json`
gives them rows they can parse. Change 243 left `--json` out of the Rust
report feature because matching `JSON.stringify` byte for byte was risky
for output nothing used yet. This change adds it: `query --json` prints
the same bytes TypeScript's `runQuery` prints with `{ json: true }` for
text, integer, real, blob and null values, an empty result, the table list
and every refusal. The expected bytes come from TypeScript itself: a golden
file printed by the built `dist` on the report crate's fixtures, committed
in this change folder, which the task copies into the crate.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test with
the corpus tests and the link gates, and the mutation check on the lines
this change touches. That covers every golden JSON case, the `--json`
argument in each position, the path rewrite in JSON values, integers past
JavaScript's safe range, and the existing text and refusal goldens, which
must still pass unchanged.

## Non-goals

- JSON output for any other command.
- Any change to the text output of `query`, to the TypeScript `osq query`, or to `osq label`.
- Registering anything new in `osq-cli`; it already dispatches `query` with its raw arguments to `ReportFeature`.
- Any new crate dependency: the JSON is written by hand, so `Cargo.toml` and `Cargo.lock` do not change.

## Surface

- Added: `osq-rs query --json` (flag).

## Decisions

- ADR 022: the JSON writer lives in the report crate and reads only the read model `build_read_model` writes; no other crate changes.
- ADR 023: key ordering, number text and string escaping are small pure functions in their own module; `run_query` stays the thin orchestrator that picks text or JSON.
- ADR 024: every function that implements a requirement ends its doc with `Implements: rust-report/<requirement>`, and each new test's doc names `Covers: rust-report/<scenario>`.
- ADR 025: the feature still writes only its cache under `.osq/`, exactly as without `--json`.
- ADR 026: no OpenSpec parsing is involved.
- ADR 027: the change touches only the report crate, so it locks no other crate.
- ADR 028: `ReportFeature` stays the crate's one public item; the flag is read from the invocation's arguments inside `run`, and the command's usage becomes `[--json] [select]`.
- ADR 029: `query` reads no config, with or without `--json`.

## Assumptions

- `golden/queries-json.json` was printed on 2026-10-22 by `golden/print-goldens.mjs.txt` with the `dist` built from commit e157c425, on copies of `crates/features/report/tests/fixtures/history` and `bad-labels`; its sha256 is `55d2fc32e0d5e13fd47296824b680d3af0d86cc7b565067f127c8fec3d3ead68`.
- Rust's `format!("{:e}", x)` gives the same shortest round-trip digits ECMAScript's `Number::toString` picks; the planner checked every real of the `reals` case and of the fixture tables with rustc.
- An integer past ±(2^53 - 1) makes TypeScript's `node:sqlite` throw a `RangeError`, which is not a `QueryError`, so TypeScript prints no JSON for it. Rust prints the integer's exact digits instead, as its text output already does; scenario "Integers beyond JavaScript's safe range" pins that.
- `HOME` stands in for Node's `os.homedir()`, as it does for the text output since 243.
- `String::from_utf8_lossy` and Node turn the bytes SQLite writes for `char(55296)` into the same three U+FFFD characters; the `non-ascii` golden case checks it.
- The golden file holds no raw DEL character, since `osq lint` refuses one in a change folder; scenario "Characters JSON leaves as they are" pins DEL with an expected value written in the test.

## Contract

### Requirement: Report feature

See `specs/rust-report/spec.md`.

### Requirement: Query arguments

See `specs/rust-report/spec.md`.

### Requirement: Query JSON output

See `specs/rust-report/spec.md`.

### Requirement: Query JSON keys

See `specs/rust-report/spec.md`.

### Requirement: Query JSON values

See `specs/rust-report/spec.md`.

### Requirement: Query JSON reals

See `specs/rust-report/spec.md`.

### Requirement: Query JSON strings

See `specs/rust-report/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-report/spec.md`: MODIFIED "Report feature" and "Query arguments"; ADDED "Query JSON output", "Query JSON keys", "Query JSON values", "Query JSON reals" and "Query JSON strings".
- `golden/queries-json.json` is the golden file task 1 copies to `crates/features/report/tests/fixtures/queries-json.json`; `golden/print-goldens.mjs.txt` printed it.
