//! Proves every refusal and rejection of "Reject outcomes".

mod support;

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;

use support::{exists, run_args, tree, write};

/// The proposal every scratch change holds.
const PROPOSAL: &str = "---\ntitle: A\n---\n";

/// A task file every scratch change holds.
const TASK: &str = "---\ntitle: A\n---\n";

/// The refusal for an approved change that has not failed.
const HEALTHY: &str = "Change 001-a is approved and healthy; only a failed change may be rejected.";

/// The refusal for a change with a running task.
const RUNNING: &str = "Change 001-a has a running task; rejection is refused.";

/// The refusal for a change whose rejected destination exists.
const DESTINATION: &str =
    "Cannot reject 001-a: destination \"openspec/changes/rejected/001-a\" already exists.";

/// What one row of "Reject outcomes" gives.
enum Expected {
    /// The change folder moves into rejected history.
    Rejected,
    /// The run fails with this message and writes nothing.
    Failed(&'static str),
}

/// One row of "Reject outcomes": its files and its result.
struct Row {
    /// The row's name, used in its scratch folder.
    name: &'static str,
    /// The files under the change folder, as relative path and bytes.
    files: &'static [(&'static str, &'static str)],
    /// Whether the rejected destination already holds a folder.
    destination: bool,
    /// The row's result.
    expected: Expected,
}

/// Every row of "Reject outcomes", in table order.
const ROWS: &[Row] = &[
    Row {
        name: "none",
        files: &[],
        destination: false,
        expected: Expected::Rejected,
    },
    Row {
        name: "approved",
        files: &[(".run/approved", "sha")],
        destination: false,
        expected: Expected::Failed(HEALTHY),
    },
    Row {
        name: "approved-blank",
        files: &[(".run/approved", "  ")],
        destination: false,
        expected: Expected::Rejected,
    },
    Row {
        name: "dead-task",
        files: &[(".run/approved", "sha"), (".run/dead/1.md", "x")],
        destination: false,
        expected: Expected::Rejected,
    },
    Row {
        name: "dead-task-done",
        files: &[
            (".run/approved", "sha"),
            (".run/dead/1.md", "x"),
            (".run/done/1", "x"),
        ],
        destination: false,
        expected: Expected::Failed(HEALTHY),
    },
    Row {
        name: "change-regressed",
        files: &[(".run/approved", "sha"), (".run/regressed/change.md", "x")],
        destination: false,
        expected: Expected::Rejected,
    },
    Row {
        name: "regressed-task-done",
        files: &[
            (".run/approved", "sha"),
            (".run/regressed/2.md", "x"),
            (".run/done/2", "x"),
        ],
        destination: false,
        expected: Expected::Rejected,
    },
    Row {
        name: "unknown-dead-task",
        files: &[(".run/approved", "sha"), (".run/dead/9.md", "x")],
        destination: false,
        expected: Expected::Failed(HEALTHY),
    },
    Row {
        name: "running",
        files: &[(".run/running/1.pid", "x"), (".run/dead/1.md", "x")],
        destination: false,
        expected: Expected::Failed(RUNNING),
    },
    Row {
        name: "running-before-health",
        files: &[
            (".run/approved", "sha"),
            (".run/running/zz.pid", "x"),
            (".run/regressed/change.md", "x"),
        ],
        destination: false,
        expected: Expected::Failed(RUNNING),
    },
    Row {
        name: "destination",
        files: &[],
        destination: true,
        expected: Expected::Failed(DESTINATION),
    },
];

/// A fresh scratch root under `CARGO_TARGET_TMPDIR`, named after its test.
fn scratch_root(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Writes the one active change folder `001-a` with both task files.
fn write_change(root: &Path) {
    write(root, "openspec/changes/001-a/proposal.md", PROPOSAL);
    write(root, "openspec/changes/001-a/tasks/1.md", TASK);
    write(root, "openspec/changes/001-a/tasks/2.md", TASK);
}

/// Builds the scratch root for one row.
fn build(row: &Row) -> PathBuf {
    let root = scratch_root(&format!("reject_outcomes/{}", row.name));
    write_change(&root);
    for (relative, contents) in row.files {
        write(
            &root,
            &format!("openspec/changes/001-a/{relative}"),
            contents,
        );
    }
    if row.destination {
        write(&root, "openspec/changes/rejected/001-a/keep.md", "x");
    }
    root
}

/// Proves every row of "Reject outcomes".
///
/// Covers: rust-approve/reject-outcomes
#[test]
fn reject_outcomes() {
    for row in ROWS {
        let root = build(row);
        let before = tree(&root, "");
        let result = run_args(&root, "reject", &["1", "--reason", "why"]);
        match row.expected {
            Expected::Rejected => {
                result.unwrap_or_else(|error| panic!("{}: {error}", row.name));
                assert!(
                    !exists(&root, "openspec/changes/001-a"),
                    "{}: the source is gone",
                    row.name
                );
                assert!(
                    exists(&root, "openspec/changes/rejected/001-a/proposal.md"),
                    "{}: the proposal moved",
                    row.name
                );
                assert!(
                    exists(&root, "openspec/changes/rejected/001-a/tasks/1.md"),
                    "{}: task 1 moved",
                    row.name
                );
                assert!(
                    exists(&root, "openspec/changes/rejected/001-a/tasks/2.md"),
                    "{}: task 2 moved",
                    row.name
                );
            }
            Expected::Failed(message) => {
                let error = result.expect_err("the rejection is refused");
                assert_eq!(
                    error.to_string(),
                    format!("reject failed: {message}"),
                    "{}: message",
                    row.name
                );
                match &error {
                    FeatureError::Failed { command, .. } => {
                        assert_eq!(command, "reject", "{}: command", row.name);
                    }
                    other => panic!("{}: expected a failed error, got {other:?}", row.name),
                }
                assert_eq!(tree(&root, ""), before, "{}: every file in place", row.name);
            }
        }
    }
}
