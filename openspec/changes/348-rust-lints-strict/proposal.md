---
title: Rust lints deny unwrap, reasonless allows, debug leftovers and broken doc links, so agents can't slip them past verify
depends_on: []
verify: sh scripts/verify-rust.sh
check: pnpm verify
features:
  reads: [rust-harnesses, rust-storage, rust-vcs, rust-loop, rust-sync, rust-archive, rust-doctor, rust-inbox, rust-lint, rust-report, rust-approve, rust-land, rust-manual, rust-plan, rust-retry, rust-run, rust-show, rust-cli]
---
## Goal

osq's Rust lints are already strict: pedantic, denied docs on every item,
forbidden `unsafe` and an 80-line function cap. But an agent can still write
`.unwrap()`, put `#[allow(dead_code)]` on a module with no reason, leave a
`dbg!` or `todo!`, or write a doc link that points nowhere, and verify stays
green. Most of osq's Rust is written by agents, and a rule an agent can break
without the compiler noticing gets broken and then copied.

This change adds eight clippy restriction lints to `[workspace.lints]` at
deny and a rustdoc step to `scripts/verify-rust.sh`, and fixes every place
that breaks them today, so the workspace stays green under the new table. It
is Tier 1 of the 2026-11-03 lint audit and item 10, `rust-lints-google`, of
the Google Rust guidelines report, narrowed to the lints with few hits.

Measured on main at 7015dd2f with Rust 1.99.1, the new lints fire at:

| Lint or check | Crate: hits |
|---|---|
| `unwrap_used`, with `allow-unwrap-in-tests` | harnesses src: 4. Test helpers outside `#[test]` functions: storage 136, vcs 93, inbox 61, archive 27, report 25, doctor 5, loop 4, lint 1 |
| `allow_attributes_without_reason` | run 8, approve 2, plan 2, land 1, lint 1, loop 1, manual 1, report 1, retry 1, sync 1. All `allow(dead_code)` in tests |
| `string_add` | show 7, run 4, harnesses 1, manual 1. All in tests |
| `dbg_macro`, `todo`, `unimplemented`, `print_stdout`, `print_stderr` | none |
| `RUSTDOCFLAGS=-D warnings cargo doc --workspace --no-deps` | core 1, report 2, cli 1 |

## Verify

`sh scripts/verify-rust.sh`

The script runs the format check, clippy with `-D warnings`, and after task 23 the rustdoc check, then every test, then cargo-mutants on the
lines the change touched. Each fix task keeps it green, since the lints turn on
only in task 22 and the rustdoc step only in task 23, after every hit is
fixed. The `check` runs `pnpm verify` at archive and land,
which covers the two new TypeScript tests and the changed verify script test.

## Non-goals

- `expect_used`, `indexing_slicing`, `panic` or `clippy::nursery`. `expect`
  with a reason is the house style, and the others fire hundreds of times,
  mostly in tests.
- Tier 2 of the audit: `mod_module_files`, `as_conversions`,
  `rust_2018_idioms`, `unused_qualifications`, `let_underscore_must_use` and
  `missing_assert_message`. Each is its own change.
- Tier 3: `max-fn-params-bools`, a Rust file line cap and `cargo-deny`.
- `allow_attributes`, which would force `#[expect]`. A test support module is
  compiled into several test binaries, and a binary that uses every item
  would fail an `#[expect(dead_code)]` as unfulfilled.
- The TypeScript side: `tsconfig.json` and `biome.json` do not change.
- Rewriting AGENTS.md. The lints now say what it would.

## Surface

- Added: `[workspace.lints.clippy]` in `Cargo.toml` denies `unwrap_used`, `allow_attributes_without_reason`, `dbg_macro`, `todo`, `unimplemented`, `print_stdout`, `print_stderr` and `string_add`.
- Added: `allow-unwrap-in-tests = true` in `clippy.toml`.
- Added: `scripts/verify-rust.sh` runs `cargo doc --workspace --no-deps` with `RUSTDOCFLAGS="-D warnings"` between clippy and the tests.

## Decisions

- ADR 023: this is an additive amendment. Section 4 says the lint table "includes at least" a set, and task 22 records the new lints and the rustdoc step in a dated amendment. No lint is loosened.
- ADR 022: each fix task stays in one crate. No crate gains a dependency.
- ADR 024: every public function keeps its `Implements:` tag, and verify still runs cargo-mutants on the changed lines. Harnesses' `unwrap` to `expect` lines must stay covered.
- ADR 025: nothing under `openspec/` or `.run/` changes shape.
- ADR 026: the specs kernel and its parity job do not change. Its tests have no hits.
- ADR 027: scheduling does not change. The fix tasks run in a chain so each crate's clippy check sees harnesses already fixed.
- ADR 028: no `Feature` implementation changes. Report's `run` keeps its code and only its doc text changes.
- ADR 029: no config key changes. Lint levels live in `Cargo.toml` and `clippy.toml`, not osq's config.
- ADR 030: no event or reaction changes.

## Assumptions

- The audit doc's first count of `unwrap` was 4. That was wrong: `allow-unwrap-in-tests` covers only `#[test]` functions, so 352 `unwrap`s in test helpers also need `expect`. This plan converts them all.
- Clippy lints a workspace crate's library when it builds a crate that depends on it. So only harnesses' `src` hits block other crates, and task 2 comes before every other fix task.
- ADR 023 is amended in place with a dated section, as 207 edited it before, and not superseded.
- `cargo doc --workspace --no-deps` adds under a minute to each verify on this machine.
- Tasks 2 to 21 edit test files and docs that rust-harnesses, rust-storage and 16 other capabilities own, with no delta for them: their behaviour and specs do not change. `osq lint` warns once per such file. Splitting the sweep into one change per capability would clear the warnings at the cost of 18 changes.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-core/spec.md`: ADDED "Workspace lint table" and "Verify script rustdoc check". MODIFIED "Code ownership" (gains `clippy.toml` and the two new lint tests), "Verify script mutation step" and "Verify script toolchain check" (the rustdoc command joins the cargo command list).

`clippy.toml` is written by task 1 only; task 22 reads it. No file is shared between tasks.
