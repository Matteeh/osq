# Spec Delta: rust-core

## ADDED Requirements

### Requirement: Corpus tests
A Rust test that reads data outside its own crate, such as the live archive,
SHALL be a corpus test: it lives in a test target `tests/<name>_corpus.rs`,
and every test in it carries `#[ignore = "corpus test: <reason>"]`, so
`scripts/verify-rust.sh` runs it and cargo-mutants does not. Each requirement
a corpus test proves SHALL also have a fast test on the crate's own fixtures,
which cargo-mutants runs.

#### Scenario: Corpus tests are marked
- **WHEN** every `crates/**/tests/*_corpus.rs` file is read
- **THEN** there is at least one, and every function marked `#[test]` in them also carries an `#[ignore = "corpus test: ` attribute

#### Scenario: Verify runs corpus tests
- **WHEN** `scripts/verify-rust.sh` is read
- **THEN** it holds the line `cargo test --workspace -- --include-ignored`

## MODIFIED Requirements

### Requirement: Verify script mutation step
`scripts/verify-rust.sh` SHALL run the format check, clippy and the
workspace tests with the ignored corpus tests included, then, when `OSQ_DIFF`
is set and not empty, run `sh scripts/mutants-rust.sh "$OSQ_DIFF"` and exit
with its status, so a missed mutant or a timeout in the lines the change
touched fails the verify. When `OSQ_DIFF` is unset or empty, as in Rust CI's
`cargo` job or a run by hand, it SHALL print
`mutation check not run: OSQ_DIFF is not set` and exit 0 after the tests.

#### Scenario: Verify script steps
- **WHEN** `sh scripts/verify-rust.sh` runs with a `cargo` on `PATH` that records its arguments and exits with the status of its row for `mutants` and 0 otherwise
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
