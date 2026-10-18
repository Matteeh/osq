---
title: rust-core has no missed mutants, and a script and Rust CI check every crate with cargo-mutants
depends_on: []
verify: sh scripts/verify-rust.sh
check: sh scripts/mutants-rust.sh
features:
  reads: []
---
## Goal

ADR 024 says `cargo llvm-cov` proves a test runs the code and `cargo mutants`
proves the test checks it. Neither runs anywhere today. A cargo-mutants 27.1.0
run over rust-core on 2026-10-18 made 117 mutants: 79 caught, 27 unviable and
11 missed, every miss a test gap. No test checks the text of four `Display`
impls, `Change::id` or `Change::tasks`. Two match guards in `apply_change` and
the tie guard in `TaskId`'s ordering can become `true`, and the `Done` arm of
`apply_task` can drop its `reason: None`, and no test fails.

After this change new tests in `crates/core/tests/` catch all 11, and one
script, `scripts/mutants-rust.sh`, runs cargo-mutants the same way by hand, in
Rust CI and in osq's check. It runs over the workspace, or over a diff's lines
when given a diff file, keeps its output out of the source tree, and fails on
a miss. Rust CI gains a blocking `mutants` job on each push's and pull
request's diff and a weekly full run, and ADR 024's Enforcement section says
so. rust-core owns the Rust tooling files, which nothing owns today.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with `-D warnings` and every workspace test
on the final tree, the new `display.rs` and `edges.rs` tests among them.
`check: sh scripts/mutants-rust.sh` then runs every mutant of the workspace
at archive, and again when `osq land` merges a newer main, and fails on any
miss. Task 2's verify runs `tests/rust-ci.test.ts` on the final tree.

## Non-goals

- Running cargo-mutants inside each Rust change's verify. That is the
  `rust-mutants-verify` queue item.
- The TypeScript mutation check (Stryker), which stays as it is.
- `cargo llvm-cov`, which the link graph milestone brings.
- Any change to `crates/core/src/`. None of the 11 misses is dead code.
- Owning the root `Cargo.toml` and `Cargo.lock`, which every later crate's
  change edits.

## Surface

- Added: `scripts/mutants-rust.sh [diff-file]` and its `OSQ_MUTANTS_JOBS` environment variable (command)
- Added: `.cargo/mutants.toml` (config file)
- Added: the `mutants` job and a weekly `schedule` trigger in `.github/workflows/rust.yml`
- Added: the "Mutation check" bullet in ADR 024's Enforcement section (document section)

## Decisions

- ADR 022: the tests are integration tests of the core crate, and the script and CI touch no crate's dependencies or layers.
- ADR 023: every new test and helper gets a doc comment, the workspace lints stay as they are, and `scripts/verify-rust.sh` still passes.
- ADR 024: this change carries out the mutation half of its coverage enforcement and adds that bullet; each new test names its scenario with a `Covers:` doc line until `#[covers]` exists.
- ADR 025: no event, marker or seal format changes.
- ADR 026: no OpenSpec parsing or validation is touched.

## Assumptions

- Measured on 2026-10-18 on main at `b42fea1c`: `cargo mutants --workspace -j 4` took 4 minutes and missed the 11 mutants task 1 names, inside the 600-second `verifyTimeoutSeconds` that both task 1's verify and the check run under. Every mutant comes from `crates/core`; the other crates are empty.
- cargo-mutants 27.1.0 exits 0 on an empty diff file and on a diff that touches no `.rs` file, printing `Diff file is empty` or `Diff changes no Rust source files`, and rejects unknown keys in `.cargo/mutants.toml`, `jobs` among them.
- cargo-mutants is installed at `~/.cargo/bin/cargo-mutants` on the watcher's machine. `cargo mutants` finds it there through `$HOME/.cargo/bin` even when that folder is not on the watcher's `PATH`, since cargo also looks for subcommands there.
- rust-core owns the Rust tooling files, as the brief proposes. They serve every Rust crate, but no other Rust capability exists yet, and a separate tooling capability for four files would own no crate.
- Rust CI's `mutants` job fails the push it runs on, but osq lands on main before pushing, so it reports a miss only after landing. `rust-mutants-verify` moves the check into the task.

## Human steps

### Before approval

None

### After landing

- The first push after landing runs the `mutants` job on GitHub for the first time; look at it once to see that it installs cargo-mutants and passes.

## Delta

- `specs/rust-core/spec.md`: ADDED "Mutation script" and "Rust CI mutation check"; MODIFIED "Code ownership", "Event read errors", "Event streams", "Task fold", "Change fold", "Approval seal" and "Change typestate", each keeping every scenario it has and adding the scenarios the new tests prove.

No file is shared between tasks. Task 2's test reads `.cargo/mutants.toml`, which task 1 writes, but does not change it.
