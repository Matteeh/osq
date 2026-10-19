# Spec Delta: rust-core

## ADDED Requirements

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
| uses `actions/checkout@`, `pnpm/action-setup@`, `actions/setup-node@` with `node-version` 24, `dtolnay/rust-toolchain@` and `Swatinem/rust-cache@` |
| runs `pnpm install --frozen-lockfile` |
| runs `cargo clippy -p osq-kernel-specs --features parity --all-targets -- -D warnings` |
| outside the schedule, runs `cargo test -p osq-kernel-specs --features parity --test openspec_validate_parity_corpus --test openspec_archive_parity_corpus -- --include-ignored` with no `OSQ_OPENSPEC_BIN` |
| on the schedule, runs `npm install --prefix "$RUNNER_TEMP/openspec-latest" @fission-ai/openspec@latest`, then the same `cargo test` with `OSQ_OPENSPEC_BIN` set to the `openspec` binary under `openspec-latest/node_modules/.bin/` and `OPENSPEC_TELEMETRY` set to `0` |
| never runs `pnpm add` or `pnpm update` |

## MODIFIED Requirements

### Requirement: Rust rebuild decisions
osq's decisions SHALL include the five Rust rebuild ADRs 022 to 026, each
accepted, applying to the capability group `rust` through
`applies_to: [group:rust]`, so they govern every capability whose sidecar
names group `rust` and nothing under `src/`, naming `tests/rust-adrs.test.ts`
in its checks, and causing no decision problem. ADR 022 SHALL also name
`crates/core/tests/no_io.rs`, ADR 025 `crates/core/tests/event_corpus.rs`,
and ADR 026 the specs kernel's golden, validation, replay and parity tests
and the linter kernel's no-runtime-Node test. The index SHALL link each
once, and AGENTS.md's project rules block SHALL not change, since none
applies to all.

#### Scenario: Rust ADRs are accepted
- **WHEN** osq's own decisions are read with `readDecisions` and `DEFAULT_CONFIG`
- **THEN** each ADR below is listed and not ignored, with status `accepted`, `appliesTo` `["group:rust"]`, `governs` holding `rust-core`, and the checks of its row, `validateDecisions` reports no error and no warning, and `decisions/README.md` links its file exactly once:

| ADR | File | Checks |
|---|---|---|
| 022 | `022-rust-feature-crates.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/no_io.rs` |
| 023 | `023-rust-code-style.md` | `tests/rust-adrs.test.ts` |
| 024 | `024-rust-link-enforcement.md` | `tests/rust-adrs.test.ts` |
| 025 | `025-rust-on-disk-format.md` | `tests/rust-adrs.test.ts`, `crates/core/tests/event_corpus.rs` |
| 026 | `026-openspec-in-rust.md` | `tests/rust-adrs.test.ts`, `crates/kernel/specs/tests/golden_corpus.rs`, `crates/kernel/specs/tests/validate_corpus.rs`, `crates/kernel/specs/tests/replay_corpus.rs`, `crates/kernel/specs/tests/openspec_validate_parity_corpus.rs`, `crates/kernel/specs/tests/openspec_archive_parity_corpus.rs`, `crates/kernel/linter/tests/node_spawn_corpus.rs` |

#### Scenario: Rules block without the Rust ADRs
- **WHEN** `renderRulesBlock` renders osq's own decisions
- **THEN** no line ends in `ADR 022`, `ADR 023`, `ADR 024`, `ADR 025` or `ADR 026`, and `checkProjectRules` reports nothing

#### Scenario: Rust ADR check files exist
- **WHEN** every check file named by ADRs 022 to 026 is looked up from the repository root
- **THEN** each one exists

### Requirement: Corpus tests
A Rust test that reads data outside its own crate, such as the live archive,
SHALL be a corpus test: it lives in a test target `tests/<name>_corpus.rs`,
and every test in it carries `#[ignore = "corpus test: <reason>"]`, so
`scripts/verify-rust.sh` runs it and cargo-mutants does not. A corpus test
that runs the OpenSpec CLI is a parity test: its test target needs its
crate's `parity` feature, so `scripts/verify-rust.sh` does not build it, and
the Rust CI `parity` job runs it. Each requirement a corpus test proves SHALL
also have a fast test on the crate's own fixtures, which cargo-mutants runs.

#### Scenario: Corpus tests are marked
- **WHEN** every `crates/**/tests/*_corpus.rs` file is read
- **THEN** there is at least one, and every function marked `#[test]` in them also carries an `#[ignore = "corpus test: ` attribute

#### Scenario: Verify runs corpus tests
- **WHEN** `scripts/verify-rust.sh` is read
- **THEN** it holds the line `cargo test --workspace -- --include-ignored`
