# Spec Delta: rust-core

## ADDED Requirements

### Requirement: Pinned Rust toolchain
`rust-toolchain.toml` SHALL pin Rust `1.99.1` with the `clippy` and
`rustfmt` components, so a run by hand, the watcher's verify and CI lint
with the same clippy. Every job of `.github/workflows/rust.yml` SHALL
install it with `rustup toolchain install`, which reads the file, before
any step that uses cargo, and SHALL name no Rust version itself. A newer
Rust is a change that edits this requirement and fixes what clippy raises.

#### Scenario: Rust toolchain is pinned once
- **WHEN** `rust-toolchain.toml` and `.github/workflows/rust.yml` are read
- **THEN** they hold each fact below:

| Part | Fact |
|---|---|
| `rust-toolchain.toml` | its `[toolchain]` table sets `channel = "1.99.1"` |
| `rust-toolchain.toml` | its `components` list holds `clippy` and `rustfmt` |
| `jobs.cargo`, `jobs.mutants` and `jobs.parity` | each has one step whose `run` is exactly `rustup toolchain install` |
| `jobs.cargo`, `jobs.mutants` and `jobs.parity` | that step comes before the `Swatinem/rust-cache@` step and before every step whose `run` holds `cargo` or `sh scripts/` |
| every job | no step uses `dtolnay/rust-toolchain@`, and no step has a `toolchain` key under `with` |

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
| `cargo 1.99.1 (stub)` | 0 | `mutation check not run: OSQ_DIFF is not set` | `fmt --all --check`, `clippy --workspace --all-targets -- -D warnings`, `test --workspace -- --include-ignored` |
| `cargo 1.99.0 (stub)` | 1 | `cargo 1.99.0 is on PATH, but rust-toolchain.toml pins 1.99.1; put rustup's cargo proxy first on PATH` | none |
| `cargo 1.97.0 (stub)` | 1 | `cargo 1.97.0 is on PATH, but rust-toolchain.toml pins 1.99.1; put rustup's cargo proxy first on PATH` | none |

## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: crates/core/**, tests/rust-adrs.test.ts, tests/rust-ci.test.ts, tests/rust-verify-script.test.ts, scripts/verify-rust.sh, scripts/mutants-rust.sh, .cargo/mutants.toml, .github/workflows/rust.yml, rust-toolchain.toml -->
The rust-core capability SHALL own the `osq-core` crate, the Rust decisions
test, and the Rust workspace's toolchain file, scripts, cargo-mutants
settings and CI workflow with their tests.

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

### Requirement: Verify script mutation step
`scripts/verify-rust.sh` SHALL run the format check, clippy and the
workspace tests with the ignored corpus tests included, then, when `OSQ_DIFF`
is set and not empty, run `sh scripts/mutants-rust.sh "$OSQ_DIFF"` and exit
with its status, so a missed mutant or a timeout in the lines the change
touched fails the verify. When `OSQ_DIFF` is unset or empty, as in Rust CI's
`cargo` job or a run by hand, it SHALL print
`mutation check not run: OSQ_DIFF is not set` and exit 0 after the tests.

#### Scenario: Verify script steps
- **WHEN** `sh scripts/verify-rust.sh` runs with a `cargo` on `PATH` that prints `cargo 1.99.1 (stub)` for `--version`, records its other arguments and exits with the status of its row for `mutants` and 0 otherwise
- **THEN** the script runs the cargo commands and exits as given:

| `OSQ_DIFF` | `mutants` status | cargo commands in order | Exit |
|---|---|---|---|
| a diff file | 0 | `fmt --all --check`, `clippy --workspace --all-targets -- -D warnings`, `test --workspace -- --include-ignored`, then `mutants` with `--in-diff` and the diff file's path | 0 |
| a diff file | 2 | the same four | 2 |
| unset | 0 | `fmt --all --check`, `clippy --workspace --all-targets -- -D warnings`, `test --workspace -- --include-ignored` | 0 |
| empty | 0 | the same three | 0 |

#### Scenario: Verify script names the missing diff
- **WHEN** `sh scripts/verify-rust.sh` runs with that recording `cargo` and no `OSQ_DIFF`
- **THEN** its output holds `mutation check not run: OSQ_DIFF is not set`

### Requirement: Rust CI parity job
Rust CI SHALL run the specs kernel's OpenSpec parity tests in a `parity`
job of `.github/workflows/rust.yml`: against the pinned OpenSpec CLI that
`pnpm install --frozen-lockfile` installs, on each push and pull request
to main, and against `@fission-ai/openspec@latest`, installed outside the
lockfile, on the workflow's weekly schedule. A failure on the schedule
means osq and upstream OpenSpec have diverged.

#### Scenario: Rust CI runs the parity tests
- **WHEN** `.github/workflows/rust.yml` is read
- **THEN** its `parity` job holds each fact below:

| Fact |
|---|
| uses `actions/checkout@`, `pnpm/action-setup@`, `actions/setup-node@` with `node-version` 24 and `Swatinem/rust-cache@`, and runs `rustup toolchain install` |
| runs `pnpm install --frozen-lockfile` |
| runs `cargo clippy -p osq-kernel-specs --features parity --all-targets -- -D warnings` |
| outside the schedule, runs `cargo test -p osq-kernel-specs --features parity --test openspec_validate_parity_corpus --test openspec_archive_parity_corpus -- --include-ignored` with no `OSQ_OPENSPEC_BIN` |
| on the schedule, runs `npm install --prefix "$RUNNER_TEMP/openspec-latest" @fission-ai/openspec@latest`, then the same `cargo test` with `OSQ_OPENSPEC_BIN` set to the `openspec` binary under `openspec-latest/node_modules/.bin/` and `OPENSPEC_TELEMETRY` set to `0` |
| never runs `pnpm add` or `pnpm update` |
