# Spec Delta: rust-core

## ADDED Requirements

### Requirement: Workspace lint table
The root `Cargo.toml`'s `[workspace.lints]` tables SHALL set every lint
level below, so `unwrap`, a bare `#[allow]`, a debug macro, a placeholder, a
print or `+` on strings fails clippy. `clippy.toml` SHALL set the settings
below. `allow-unwrap-in-tests` allows `unwrap` inside `#[test]` functions
only; helpers and `src/` use `expect` with a reason.

#### Scenario: Workspace lint levels
- **WHEN** the root `Cargo.toml` is read
- **THEN** its `[workspace.lints]` tables set each lint to the level given:

| Table | Lint | Level |
|---|---|---|
| `[workspace.lints.rust]` | `missing_docs` | `"deny"` |
| `[workspace.lints.rust]` | `unsafe_code` | `"forbid"` |
| `[workspace.lints.clippy]` | `pedantic` | `{ level = "warn", priority = -1 }` |
| `[workspace.lints.clippy]` | `missing_docs_in_private_items` | `"deny"` |
| `[workspace.lints.clippy]` | `too_many_lines` | `"deny"` |
| `[workspace.lints.clippy]` | `unwrap_used` | `"deny"` |
| `[workspace.lints.clippy]` | `allow_attributes_without_reason` | `"deny"` |
| `[workspace.lints.clippy]` | `dbg_macro` | `"deny"` |
| `[workspace.lints.clippy]` | `todo` | `"deny"` |
| `[workspace.lints.clippy]` | `unimplemented` | `"deny"` |
| `[workspace.lints.clippy]` | `print_stdout` | `"deny"` |
| `[workspace.lints.clippy]` | `print_stderr` | `"deny"` |
| `[workspace.lints.clippy]` | `string_add` | `"deny"` |

#### Scenario: Clippy settings
- **WHEN** `clippy.toml` is read
- **THEN** it sets each key to the value given:

| Key | Value |
|---|---|
| `too-many-lines-threshold` | `80` |
| `allow-unwrap-in-tests` | `true` |

### Requirement: Verify script rustdoc check
`scripts/verify-rust.sh` SHALL build the workspace's docs with
`cargo doc --workspace --no-deps` and `RUSTDOCFLAGS` set to `-D warnings`,
after clippy and before the tests, so a broken intra-doc link, a redundant
link target or a public doc that links a private item fails the verify.
Clippy does not run rustdoc, so without this step those docs pass.

#### Scenario: Verify script denies rustdoc warnings
- **WHEN** `sh scripts/verify-rust.sh` runs with no `OSQ_DIFF` and a `cargo` on `PATH` that prints `cargo 1.99.1 (stub)` for `--version`, records its other arguments, and records the value of `RUSTDOCFLAGS` it was given when its first argument is `doc`
- **THEN** the script exits 0, records `doc --workspace --no-deps` once, as the third command after `--version`, and the recorded `RUSTDOCFLAGS` is `-D warnings`

## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: crates/core/**, tests/rust-adrs.test.ts, tests/rust-ci.test.ts, tests/rust-verify-script.test.ts, scripts/verify-rust.sh, scripts/mutants-rust.sh, .cargo/mutants.toml, .github/workflows/rust.yml, rust-toolchain.toml, clippy.toml, tests/rust-clippy-settings.test.ts, tests/rust-workspace-lints.test.ts -->
The rust-core capability SHALL own the `osq-core` crate, the Rust decisions
test, and the Rust workspace's tooling files and their tests.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for the `Event` enum, the folds or the change typestate
- **THEN** system maps `crates/core/**` to rust-core

#### Scenario: Rust decisions test ownership
- **WHEN** file ownership is resolved for `tests/rust-adrs.test.ts`
- **THEN** system maps it to rust-core

#### Scenario: Rust tooling ownership
- **WHEN** file ownership is resolved for `scripts/verify-rust.sh`, `scripts/mutants-rust.sh`, `.cargo/mutants.toml`, `.github/workflows/rust.yml` and `tests/rust-ci.test.ts`
- **THEN** system maps each to rust-core

#### Scenario: Verify script test ownership
- **WHEN** file ownership is resolved for `tests/rust-verify-script.test.ts`
- **THEN** system maps it to rust-core

#### Scenario: Toolchain file ownership
- **WHEN** file ownership is resolved for `rust-toolchain.toml`
- **THEN** system maps it to rust-core

#### Scenario: Lint settings ownership
- **WHEN** file ownership is resolved for `clippy.toml`, `tests/rust-clippy-settings.test.ts` and `tests/rust-workspace-lints.test.ts`
- **THEN** system maps each to rust-core

### Requirement: Verify script mutation step
`scripts/verify-rust.sh` SHALL run the format check, clippy, the rustdoc
check and the workspace tests with ignored corpus tests included, then, when
`OSQ_DIFF` is set and not empty, run `sh scripts/mutants-rust.sh "$OSQ_DIFF"`
and exit with its status, so a missed mutant or timeout in the changed lines
fails the verify. When `OSQ_DIFF` is unset or empty, it SHALL print
`mutation check not run: OSQ_DIFF is not set` and exit 0 after the tests.

#### Scenario: Verify script steps
- **WHEN** `sh scripts/verify-rust.sh` runs with a `cargo` on `PATH` that prints `cargo 1.99.1 (stub)` for `--version`, records its other arguments and exits with the status of its row for `mutants` and 0 otherwise
- **THEN** the script runs the cargo commands and exits as given:

| `OSQ_DIFF` | `mutants` status | cargo commands in order | Exit |
|---|---|---|---|
| a diff file | 0 | `fmt --all --check`, `clippy --workspace --all-targets -- -D warnings`, `doc --workspace --no-deps`, `test --workspace -- --include-ignored`, then `mutants` with `--in-diff` and the diff file's path | 0 |
| a diff file | 2 | the same five | 2 |
| unset | 0 | `fmt --all --check`, `clippy --workspace --all-targets -- -D warnings`, `doc --workspace --no-deps`, `test --workspace -- --include-ignored` | 0 |
| empty | 0 | the same four | 0 |

#### Scenario: Verify script names the missing diff
- **WHEN** `sh scripts/verify-rust.sh` runs with that recording `cargo` and no `OSQ_DIFF`
- **THEN** its output holds `mutation check not run: OSQ_DIFF is not set`

### Requirement: Verify script toolchain check
Before any other cargo command, `scripts/verify-rust.sh` SHALL compare
the version that `cargo --version` prints, its second word, with the
`channel` of `rust-toolchain.toml`. When they differ, it SHALL print
`cargo <found> is on PATH, but rust-toolchain.toml pins <pinned>; put rustup's cargo proxy first on PATH`
to standard error and exit 1 without running another cargo command, so a
`cargo` that ignores the toolchain file cannot lint with a different
clippy.

#### Scenario: Verify script refuses another toolchain
- **WHEN** `sh scripts/verify-rust.sh` runs with no `OSQ_DIFF` and a `cargo` on `PATH` that prints its row's text for `--version`, records its other arguments and exits 0
- **THEN** the script exits, prints and runs the cargo commands as given:

| `cargo --version` prints | Exit | Output holds | cargo commands after `--version` |
|---|---|---|---|
| `cargo 1.99.1 (stub)` | 0 | `mutation check not run: OSQ_DIFF is not set` | `fmt --all --check`, `clippy --workspace --all-targets -- -D warnings`, `doc --workspace --no-deps`, `test --workspace -- --include-ignored` |
| `cargo 1.99.0 (stub)` | 1 | `cargo 1.99.0 is on PATH, but rust-toolchain.toml pins 1.99.1; put rustup's cargo proxy first on PATH` | none |
| `cargo 1.97.0 (stub)` | 1 | `cargo 1.97.0 is on PATH, but rust-toolchain.toml pins 1.99.1; put rustup's cargo proxy first on PATH` | none |
