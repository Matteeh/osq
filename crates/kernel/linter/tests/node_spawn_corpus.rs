//! Corpus test: this repository's Rust runtime spawns no Node.
//!
//! It reads every crate of the live workspace, so it is a corpus test
//! (rust-core "Corpus tests"): it carries the corpus ignore, runs under
//! `scripts/verify-rust.sh`, and cargo-mutants leaves it out.

use osq_kernel_linter::workspace_node_spawns;
use std::path::Path;

/// Covers: rust-linter/workspace-spawns-no-node
#[test]
#[ignore = "corpus test: reads every crate of the workspace"]
fn workspace_spawns_no_node() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("the repository root is three folders above crates/kernel/linter");
    let spawns = workspace_node_spawns(root).expect("the workspace scans");
    let found: Vec<String> = spawns
        .iter()
        .map(|spawn| format!("{}:{}: {}", spawn.file, spawn.line, spawn.program))
        .collect();
    assert!(
        found.is_empty(),
        "runtime Node spawns:\n{}",
        found.join("\n")
    );
}
