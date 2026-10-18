#!/bin/sh
# Verify the Rust workspace: format, workspace lints (ADR 023), then every test.
# Corpus tests in tests/*_corpus.rs are ignored by default, so cargo-mutants
# leaves them out of its per-mutant runs; this script runs them with
# `--include-ignored`.
# When OSQ_DIFF names a diff, osq's verify then runs scripts/mutants-rust.sh on
# it (ADR 024), so a missed mutant or a timeout in the change's own lines fails
# the verify; without OSQ_DIFF there is nothing to mutate, the step prints
# `mutation check not run: OSQ_DIFF is not set`, and the script exits 0.
# CI and osq change verifies run this one script so they cannot drift apart.
set -eu
cd "$(dirname "$0")/.."
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace -- --include-ignored
if [ -n "${OSQ_DIFF:-}" ]; then
    sh scripts/mutants-rust.sh "$OSQ_DIFF"
else
    echo "mutation check not run: OSQ_DIFF is not set"
fi
