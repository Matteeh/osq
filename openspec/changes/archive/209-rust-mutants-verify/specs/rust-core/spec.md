# Spec Delta: rust-core

## ADDED Requirements

### Requirement: Verify script mutation step
`scripts/verify-rust.sh` SHALL run the format check, clippy and the
workspace tests, then, when `OSQ_DIFF` is set and not empty, run
`sh scripts/mutants-rust.sh "$OSQ_DIFF"` and exit with its status, so a
missed mutant or a timeout in the lines the change touched fails the verify.
When `OSQ_DIFF` is unset or empty, as in Rust CI's `cargo` job or a run by
hand, it SHALL print `mutation check not run: OSQ_DIFF is not set` and exit 0
after the tests.

#### Scenario: Verify script steps
- **WHEN** `sh scripts/verify-rust.sh` runs with a `cargo` on `PATH` that records its arguments and exits with the status of its row for `mutants` and 0 otherwise
- **THEN** the script runs the cargo commands and exits as given:

| `OSQ_DIFF` | `mutants` status | cargo commands in order | Exit |
|---|---|---|---|
| a diff file | 0 | `fmt --all --check`, `clippy --workspace --all-targets -- -D warnings`, `test --workspace`, then `mutants` with `--in-diff` and the diff file's path | 0 |
| a diff file | 2 | the same four | 2 |
| unset | 0 | `fmt --all --check`, `clippy --workspace --all-targets -- -D warnings`, `test --workspace` | 0 |
| empty | 0 | the same three | 0 |

#### Scenario: Verify script names the missing diff
- **WHEN** `sh scripts/verify-rust.sh` runs with that recording `cargo` and no `OSQ_DIFF`
- **THEN** its output holds `mutation check not run: OSQ_DIFF is not set`

## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: crates/core/**, tests/rust-adrs.test.ts, tests/rust-ci.test.ts, tests/rust-verify-script.test.ts, scripts/verify-rust.sh, scripts/mutants-rust.sh, .cargo/mutants.toml, .github/workflows/rust.yml -->
The rust-core capability SHALL own the `osq-core` crate, the Rust decisions
test, and the Rust workspace's scripts, cargo-mutants settings and CI
workflow with their tests.

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
