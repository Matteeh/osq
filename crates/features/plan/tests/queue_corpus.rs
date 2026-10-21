//! Corpus test: this repository's queue parses into one line per item.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_plan::PlanFeature;

/// The repository root, three folders above this crate.
fn repository_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .expect("the repository root exists")
}

/// Proves this repository's queue has one output line per item.
///
/// Covers: rust-plan/this-repository-s-queue
#[test]
#[ignore = "corpus test: reads this repository's openspec/queue.md"]
fn this_repository_s_queue() {
    let root = repository_root();
    let queue = fs::read_to_string(root.join("openspec").join("queue.md"))
        .expect("this repository has a queue file");
    let expected = queue
        .lines()
        .filter(|line| line.starts_with("## ["))
        .count();
    let output = PlanFeature::new()
        .run(&Invocation::new(&root, "queue", Vec::new()))
        .expect("this repository's queue parses")
        .text;
    assert!(
        output.starts_with("Queue:"),
        "the output starts with Queue:"
    );
    assert_eq!(
        output.lines().count().saturating_sub(1),
        expected,
        "one line per queue heading"
    );
}
