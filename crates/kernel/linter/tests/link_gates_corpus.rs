//! Corpus test: this repository breaks none of the gated link rules.

use std::env;
use std::path::{Path, PathBuf};

use osq_kernel_linter::{change_link_gates, link_gates};

/// The repository root, three folders above this crate.
fn repository_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("the repository root is three folders above crates/kernel/linter")
        .to_path_buf()
}

/// The change osq is verifying, when it names one and the folder is not empty.
fn osq_change() -> Option<PathBuf> {
    env::var_os("OSQ_CHANGE")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

/// Covers: rust-linter/repository-passes-the-link-gates
#[test]
#[ignore = "corpus test: runs the link gates on this repository"]
fn repository_passes_the_link_gates() {
    let root = repository_root();
    let decisions = Path::new("decisions");
    let openspec = Path::new("openspec");
    let findings = match osq_change() {
        Some(change) => change_link_gates(&root, decisions, openspec, "rust", &change),
        None => link_gates(&root, decisions, openspec, "rust"),
    }
    .expect("the repository builds");

    let failures: Vec<String> = findings
        .iter()
        .map(|finding| format!("{finding}\n  fix: {}", finding.fix))
        .collect();
    assert!(
        failures.is_empty(),
        "link gate findings:\n{}",
        failures.join("\n")
    );
}
