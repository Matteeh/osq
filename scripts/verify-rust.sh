#!/bin/sh
# Verify the Rust workspace: format, workspace lints (ADR 023), then every test.
# CI and osq change verifies run this one script so they cannot drift apart.
set -eu
cd "$(dirname "$0")/.."
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
