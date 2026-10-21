---
title: Rust reads a typed osq.toml with the settings the kernels need now, so no number lives in code
depends_on: []
verify: sh scripts/verify-rust.sh
check: node --import tsx --import ./tests/git-test-env.ts --test tests/rust-adrs.test.ts
creates:
  - name: rust-config
    group: rust
features:
  reads: [rust-runners, rust-vcs, rust-inbox, cli-foundation, spec-lint-and-approve]
---
## Goal

Three Rust kernels already wait on config: the vcs kernel's git timeouts,
the inbox's items that depend on `vcs.enabled`, and the runners kernel's
role settings, which its caller builds by hand. No config crate exists, so
each would have to take the value from its caller or write TypeScript's
default as a number.

This change adds the config kernel, the crate `osq-kernel-config` in
`crates/kernel/config` and the capability `rust-config`. `load_config`
reads the project's `osq.toml`, and `parse_config` turns its text into a
typed `Config` with `maxConcurrency`, `timeouts`, `vcs` and the three
roles `executor`, `planner` and `validator`, each key that is left out
taking TypeScript's default. A missing file gives `Config::default()`.
An unknown key, a wrong type or a value TypeScript refuses is a typed
`ConfigError` that names the dotted key.

ADR 029, Rust config, records where config sits in the crate layers, that
TOML is parsed with the `toml` crate into a table walked by hand, and how
a missing file or key falls back to TypeScript's defaults. Its text is
written in this change folder as `adr/029-rust-config.md`, so the human
reviews the decision itself at approve; task 3 copies it into
`decisions/`.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test with
the corpus tests, and the mutation check on the lines this change touches.
That covers the config kernel's tests: the missing, loaded and unreadable
file, the syntax error, every error text, and the defaults, full files and
errors of the timeouts, vcs and role tables. The link gates corpus reads
the change's tags and the new crate's ownership. The `check` runs
`tests/rust-adrs.test.ts`, which proves ADR 029 is accepted for group
`rust`, names its checks, which exist, and is linked from the index once.

## Non-goals

- Reading `osq.config.ts`, or writing `osq.toml` from it.
- Any config block besides `maxConcurrency`, `timeouts`, `vcs`, `executor`, `planner` and `validator`; `limits`, `gates`, the harness blocks and the rest each join in the change that needs them.
- Environment overrides such as `OSQ_HARNESS` and `OSQ_MODEL`, and loading `.env`.
- Wiring a setting into the vcs, inbox or runners crates, or building their settings types from `Config`.
- Harness-specific settings such as pi's provider or opencode's variant.
- Changing TypeScript.

## Surface

- Added: ADR 029, Rust config (`decisions/029-rust-config.md`), and its line in `decisions/README.md`.
- Added: `osq.toml`, read only by the Rust build, with the keys `maxConcurrency`, `[timeouts]` (`staleLockSeconds`, `taskTimeoutSeconds`, `verifyTimeoutSeconds`, `harnessPreflightSeconds`, `harnessKillGracePeriodMs`, `gitSeconds`, `gitCommitSeconds`, `gitRemoteSeconds`), `[vcs]` (`enabled`, `author`, `worktreeRoot`, `defaultBranch`, `prepare`, `afterLand`, `manualEdits`), `[executor]` (`harness`, `model`), `[planner]` (`harness`, `model`, `agent`) and `[validator]` (`enabled`, `harness`, `model`, `timeoutSeconds`).

## Decisions

- ADR 022: the config kernel is a kernel crate that depends on no workspace crate, so any kernel, feature or app may depend on it later; no crate depends on it yet.
- ADR 023: `parse_config` and the table readers are pure leaves on a `toml::Table`; `load_config` is the thin orchestrator and the crate's only file read.
- ADR 024: every public function's doc ends with `Implements: rust-config/<requirement>`, tests name `Covers: rust-config/<scenario>`, and the new ADR names `tests/rust-adrs.test.ts` and the config kernel's two test files in `checks`. No code carries an `Adr:` tag for it, since the new ADR reaches `decisions/` only in task 3.
- ADR 025: `osq.toml` is the hand-written file this ADR names; nothing reads `osq.config.ts`.
- ADR 026: no OpenSpec parsing is involved.
- ADR 027: the change locks `crates/kernel/config` and writes the root `Cargo.toml` and `Cargo.lock`, so it waits for any running change that scopes `Cargo.lock`.
- ADR 028: no feature crate is written, so no `Feature` is exposed.

## Assumptions

- Approving this change accepts ADR 029 as written in `adr/029-rust-config.md`, including its acceptance line dated 2026-10-21. Edit that file before approving if any decision should read differently.
- `osq.toml` keeps `osq.config.ts`'s camelCase key names, except that the executor's harness and model move from the top-level `harness` and the harness's own block into `[executor]`.
- An `osq.toml` holding any block this change does not read, such as `[gates]`, is refused as an unknown key. No `osq.toml` exists yet, so nothing breaks; each later block joins the crate first.
- Integers must be positive and are read as `u64`; TypeScript accepts any number for most timeouts. A float is a wrong type.
- `toml` 1.1.2 and its dependencies are in this machine's cargo cache, and a trial on a copy of the workspace resolved them with `cargo build --offline`, adding only new entries to `Cargo.lock`.
- 251 (rust-pi-harness-run) is running and scopes `Cargo.lock`, so the scheduler holds this change until 251 is done; the two write no other common file.

## Contract

### Requirement: Config file

See `specs/rust-config/spec.md`.

### Requirement: Config errors

See `specs/rust-config/spec.md`.

### Requirement: Timeouts and concurrency

See `specs/rust-config/spec.md`.

### Requirement: Version control settings

See `specs/rust-config/spec.md`.

### Requirement: Role settings

See `specs/rust-config/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-config/spec.md` (new capability): ADDED "Code ownership", "Config file", "Config errors", "Timeouts and concurrency", "Version control settings" and "Role settings".
- `specs/rust-core/spec.md`: MODIFIED "Rust rebuild decisions" (ADR 029 and its row, scenarios kept).

Tasks 1 and 2 share `crates/kernel/config/src/lib.rs` and
`crates/kernel/config/src/config.rs`; task 2 runs after task 1. The change
folder holds `adr/029-rust-config.md`, which task 3 copies byte for byte.
