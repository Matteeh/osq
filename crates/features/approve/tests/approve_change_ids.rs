//! Proves a rejected query core refuses gets core's change-id message.

mod support;

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;

use support::{run_args, tree, write};

/// The proposal every scratch change holds.
const PROPOSAL: &str = "---\ntitle: A\n---\n";

/// A task file every scratch change holds.
const TASK: &str = "---\ntitle: A\n---\n";

/// The message core gives for the refused query `1]`.
const REFUSED: &str = "\"1]\" is not a change id; give the change's number, such as 7 or 007, or its full folder name";

/// A fresh scratch root under `CARGO_TARGET_TMPDIR`, named after its test.
fn scratch_root(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Writes the one active change folder `001-a` with one task file.
fn write_change(root: &Path) {
    write(root, "openspec/changes/001-a/proposal.md", PROPOSAL);
    write(root, "openspec/changes/001-a/tasks/1.md", TASK);
}

/// Proves "Reject refuses a query that is not a change id".
///
/// Covers: rust-approve/reject-refuses-a-query-that-is-not-a-change-id
#[test]
fn reject_refuses_a_query_that_is_not_a_change_id() {
    let root = scratch_root("approve_change_ids/reject_refuses_a_query_that_is_not_a_change_id");
    write_change(&root);
    let before = tree(&root, "");
    let result = run_args(&root, "reject", &["1]", "--reason", "why"]);
    let error = result.expect_err("core refuses the query");
    assert_eq!(error.to_string(), format!("reject failed: {REFUSED}"));
    match &error {
        FeatureError::Failed { command, .. } => assert_eq!(command, "reject"),
        other => panic!("expected a failed error, got {other:?}"),
    }
    assert_eq!(tree(&root, ""), before, "every file is in place");
}
