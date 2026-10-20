---
title: One pinned Rust toolchain runs locally, in the watcher's verify and in CI, so clippy gives the same answer everywhere
depends_on: ["223"]
verify: pnpm verify
check: sh scripts/verify-rust.sh
features:
  reads: []
---
## Goal

A Rust change that passes verify on one machine should pass everywhere.
Today it doesn't, because nothing pins the toolchain. Clippy's pedantic
lints change between Rust releases. CI installs whatever
`dtolnay/rust-toolchain@stable` resolves to, GitHub's runner image ships
1.99.0, this machine runs 1.99.1, and clippy 1.97 fails main on `SQLite`
in doc comments. Main is red or green depending on who runs it.

This change pins the toolchain once, in `rust-toolchain.toml`, at 1.99.1
with clippy and rustfmt. rustup reads that file for a run by hand, for
the watcher's verify and for every CI job. CI installs the toolchain with
`rustup toolchain install`, which reads the file, so the version is
written in one place. `scripts/verify-rust.sh` first checks that the
`cargo` on `PATH` is the pinned version. When it isn't, the script says
so and stops, instead of linting with a different clippy.

## Verify

`pnpm verify`

This change edits two TypeScript tests, so the change-level verify runs
the TypeScript typechecks, build, every test and biome lint. Those tests
read the workflow, the toolchain file and the verify script. The `check`
runs `sh scripts/verify-rust.sh` at archive and land. That proves the
workspace passes format, clippy and every test on the pinned toolchain,
with the new version check in front.

## Non-goals

- Raising `rust-version` in `Cargo.toml`, or testing the minimum
  supported version in CI.
- Removing the `~/.local/bin` cargo shims. A human does that on the
  machine.
- A toolchain check in `osq doctor`. The verify script is the one place
  every Rust verify, osq's and CI's, goes through.

## Surface

- Added: `rust-toolchain.toml`, which pins Rust 1.99.1 with `clippy` and `rustfmt`.
- Added: `scripts/verify-rust.sh` exits 1 with `cargo <found> is on PATH, but rust-toolchain.toml pins <pinned>; put rustup's cargo proxy first on PATH` when the versions differ.
- Changed: every job of `.github/workflows/rust.yml` installs Rust with `rustup toolchain install` instead of `dtolnay/rust-toolchain@stable`.

## Decisions

- ADR 022: no crate, feature or event changes. The pin covers the whole workspace.
- ADR 025: nothing on disk under `openspec/` or `.run/` changes. `rust-toolchain.toml` is a build file, not osq data.
- ADR 023: the lints that enforce the code style now give the same answer everywhere. No lint is loosened or allowed to make the pin pass.
- ADR 024: `scripts/verify-rust.sh` keeps its mutation step unchanged after the new version check.
- ADR 026: the parity job keeps every step except its toolchain step.

## Assumptions

- Rust 1.99.1 is the current stable (`rustup check` on 2026-10-20), and `sh scripts/verify-rust.sh` passes on it today, so no task plans a lint fix.
- GitHub's `ubuntu-latest` image (20261012.334.1) has rustup 1.29.1. With no argument, its `rustup toolchain install` installs the channel and components the toolchain file names, as it does locally on 1.29.1.
- `~/.local/bin/cargo` is now a symlink to rustup's proxy, not a copied binary, so the watcher's verify follows `rust-toolchain.toml`. The brief's note is out of date.
- The check reads only `cargo --version`. rustup's proxies take clippy and rustfmt from the same toolchain as cargo.

## Human steps

### Before approval

- Install the pinned toolchain, so the watcher's verify and the archive `check` need no download: `rustup toolchain install 1.99.1 --profile minimal --component clippy,rustfmt`.

### After landing

None

## Delta

- `specs/rust-core/spec.md`: ADDED "Pinned Rust toolchain" and "Verify script toolchain check". MODIFIED "Code ownership" (gains `rust-toolchain.toml`), "Verify script mutation step" (its recording `cargo` answers `--version` with the pinned version) and "Rust CI parity job" (its toolchain row).

No file is shared between tasks. Task 2 reads the `rust-toolchain.toml` that task 1 writes.
