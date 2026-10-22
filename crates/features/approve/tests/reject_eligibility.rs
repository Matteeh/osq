//! Proves that marker files decide whether an approved change has failed.

mod support;

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;

use support::{exists, run_args, tree, write};

/// The proposal every scratch change holds.
const PROPOSAL: &str = "---\ntitle: A\n---\n";

/// A task file every scratch change holds.
const TASK: &str = "---\ntitle: A\n---\n";

/// A marker seal the rows share.
const SEAL: &str = "sha";

/// The refusal for an approved change that has not failed.
const HEALTHY: &str = "Change 001-a is approved and healthy; only a failed change may be rejected.";

/// The refusal for a change with a running task.
const RUNNING: &str = "Change 001-a has a running task; rejection is refused.";

/// What one approved row gives.
enum Expected {
    /// The change folder moves into rejected history.
    Rejected,
    /// The run fails because the change is healthy.
    Healthy,
    /// The run fails because a task is running.
    Running,
}

/// One approved row of "Reject outcomes".
struct Row {
    /// The row's name, used in its scratch folder.
    name: &'static str,
    /// The marker files under the change folder.
    files: &'static [(&'static str, &'static str)],
    /// The row's result.
    expected: Expected,
}

/// The "Reject outcomes" rows whose `.run/approved` holds the seal.
const ROWS: &[Row] = &[
    Row {
        name: "healthy",
        files: &[(".run/approved", SEAL)],
        expected: Expected::Healthy,
    },
    Row {
        name: "dead-task",
        files: &[(".run/approved", SEAL), (".run/dead/1.md", "x")],
        expected: Expected::Rejected,
    },
    Row {
        name: "dead-task-done",
        files: &[
            (".run/approved", SEAL),
            (".run/dead/1.md", "x"),
            (".run/done/1", "x"),
        ],
        expected: Expected::Healthy,
    },
    Row {
        name: "change-regressed",
        files: &[(".run/approved", SEAL), (".run/regressed/change.md", "x")],
        expected: Expected::Rejected,
    },
    Row {
        name: "regressed-task-done",
        files: &[
            (".run/approved", SEAL),
            (".run/regressed/2.md", "x"),
            (".run/done/2", "x"),
        ],
        expected: Expected::Rejected,
    },
    Row {
        name: "unknown-dead-task",
        files: &[(".run/approved", SEAL), (".run/dead/9.md", "x")],
        expected: Expected::Healthy,
    },
    Row {
        name: "running",
        files: &[
            (".run/approved", SEAL),
            (".run/running/zz.pid", "x"),
            (".run/regressed/change.md", "x"),
        ],
        expected: Expected::Running,
    },
];

/// A fresh scratch root under `CARGO_TARGET_TMPDIR`, named after its test.
fn scratch_root(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("the scratch root is created");
    root
}

/// Builds the scratch root for one row.
fn build(row: &Row) -> PathBuf {
    let root = scratch_root(&format!("eligibility_from_markers/{}", row.name));
    write(&root, "openspec/changes/001-a/proposal.md", PROPOSAL);
    write(&root, "openspec/changes/001-a/tasks/1.md", TASK);
    write(&root, "openspec/changes/001-a/tasks/2.md", TASK);
    for (relative, contents) in row.files {
        write(
            &root,
            &format!("openspec/changes/001-a/{relative}"),
            contents,
        );
    }
    root
}

/// Proves "Eligibility from markers".
///
/// Covers: rust-approve/eligibility-from-markers
#[test]
fn eligibility_from_markers() {
    for row in ROWS {
        let root = build(row);
        let before = tree(&root, "");
        let result = run_args(&root, "reject", &["1", "--reason", "why"]);
        match row.expected {
            Expected::Rejected => {
                result.unwrap_or_else(|error| panic!("{}: {error}", row.name));
                assert!(
                    exists(&root, "openspec/changes/rejected/001-a/proposal.md"),
                    "{}: the folder moved",
                    row.name
                );
            }
            Expected::Healthy => {
                let error = result.expect_err("the healthy change is refused");
                assert_eq!(
                    error.to_string(),
                    format!("reject failed: {HEALTHY}"),
                    "{}: message",
                    row.name
                );
                assert_eq!(tree(&root, ""), before, "{}: every file in place", row.name);
            }
            Expected::Running => {
                let error = result.expect_err("the running change is refused");
                assert_eq!(
                    error.to_string(),
                    format!("reject failed: {RUNNING}"),
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
