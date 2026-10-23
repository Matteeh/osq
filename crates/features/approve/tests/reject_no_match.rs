//! Proves that a query with no active change is refused and writes nothing.

mod support;

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;

use support::{run_args, tree, write};

/// The proposal the scratch change holds.
const PROPOSAL: &str = "---\ntitle: A\n---\n";

/// A task file the scratch change holds.
const TASK: &str = "---\ntitle: A\n---\n";

/// A fresh scratch root under `CARGO_TARGET_TMPDIR`, named after its test.
fn scratch_root(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Proves "Reject with no match".
///
/// Covers: rust-approve/reject-with-no-match
#[test]
fn reject_with_no_match() {
    let root = scratch_root("reject_with_no_match");
    write(&root, "openspec/changes/001-a/proposal.md", PROPOSAL);
    write(&root, "openspec/changes/001-a/tasks/1.md", TASK);
    write(&root, "openspec/changes/001-a/tasks/2.md", TASK);
    let before = tree(&root, "");

    let result = run_args(&root, "reject", &["7", "--reason", "why"]);
    let error = result.expect_err("the query names no active change");
    let changes = root.join("openspec").join("changes");
    assert_eq!(
        error.to_string(),
        format!(
            "reject failed: Spec \"7\" not found in {}",
            changes.display()
        )
    );
    match &error {
        FeatureError::Failed { command, .. } => assert_eq!(command, "reject"),
        other => panic!("expected a failed error, got {other:?}"),
    }
    assert_eq!(tree(&root, ""), before, "no file is written");
}
