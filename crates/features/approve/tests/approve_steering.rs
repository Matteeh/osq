//! Proves the steering triggers that refuse an approved change.

mod support;

use osq_core::FeatureError;

use support::{
    OLD_SEAL, add_task, current_seal, marker_bytes, run, scratch, valid_change, write_approved,
    write_marker,
};

/// One row's marker file: its path under the change folder and its frontmatter lines.
type Markers = &'static [(&'static str, &'static [&'static str])];

/// One row: its name, its markers and its refusal, or `None` when it approves.
type Row = (&'static str, Markers, Option<&'static str>);

/// Every row of "Steering triggers", in the scenario's order.
const ROWS: &[Row] = &[
    (
        "change-conflict",
        &[
            (".run/approved", &[]),
            (".run/regressed/change.md", &["reason: sync_conflict"]),
        ],
        Some(
            "Change 001-a needs steering: change conflict (sync_conflict). \
             Rust approve does not retire steering triggers yet.",
        ),
    ),
    (
        "change-requirement-changed",
        &[
            (".run/approved", &[]),
            (".run/regressed/change.md", &["reason: requirement_changed"]),
        ],
        Some(
            "Change 001-a needs steering: change requirement_changed \
             (requirement_changed). Rust approve does not retire steering triggers yet.",
        ),
    ),
    (
        "change-verify-path-missing",
        &[
            (".run/approved", &[]),
            (".run/regressed/change.md", &["reason: verify_path_missing"]),
        ],
        Some(
            "Change 001-a needs steering: change regression (verify_path_missing). \
             Rust approve does not retire steering triggers yet.",
        ),
    ),
    (
        "change-other-reason",
        &[
            (".run/approved", &[]),
            (".run/regressed/change.md", &["reason: worktree_dirty"]),
        ],
        None,
    ),
    (
        "task-scope-regression",
        &[
            (".run/approved", &[]),
            (".run/regressed/1.md", &["reason: scope_regression"]),
        ],
        Some(
            "Change 001-a needs steering: task 1 regression (scope_regression). \
             Rust approve does not retire steering triggers yet.",
        ),
    ),
    (
        "task-scope-regression-verified",
        &[
            (".run/approved", &[]),
            (
                ".run/regressed/1.md",
                &["reason: scope_regression", "verification_passed: true"],
            ),
        ],
        None,
    ),
    (
        "task-blocked",
        &[
            (".run/approved", &[]),
            (".run/dead/1.md", &["reason: blocked"]),
        ],
        Some(
            "Change 001-a needs steering: task 1 blocked (blocked). \
             Rust approve does not retire steering triggers yet.",
        ),
    ),
    (
        "task-entry-missing",
        &[
            (".run/approved", &[]),
            (".run/dead/1.md", &["reason: entry_missing"]),
        ],
        Some(
            "Change 001-a needs steering: task 1 blocked (entry_missing). \
             Rust approve does not retire steering triggers yet.",
        ),
    ),
    (
        "task-stuck",
        &[
            (".run/approved", &[]),
            (".run/dead/1.md", &["reason: verify_red", "stuck: true"]),
        ],
        Some(
            "Change 001-a needs steering: task 1 stuck (verify_red). \
             Rust approve does not retire steering triggers yet.",
        ),
    ),
    (
        "task-verify-red",
        &[
            (".run/approved", &[]),
            (".run/dead/1.md", &["reason: verify_red"]),
        ],
        None,
    ),
    (
        "task-done",
        &[
            (".run/approved", &[]),
            (".run/done/1", &[]),
            (".run/dead/1.md", &["reason: blocked"]),
        ],
        None,
    ),
    (
        "unapproved",
        &[(".run/dead/1.md", &["reason: blocked"])],
        None,
    ),
    (
        "change-and-task",
        &[
            (".run/approved", &[]),
            (".run/regressed/change.md", &["reason: verify_red"]),
            (".run/dead/2.md", &["reason: blocked"]),
        ],
        Some(
            "Change 001-a needs steering: change regression (verify_red), \
             task 2 blocked (blocked). Rust approve does not retire steering triggers yet.",
        ),
    ),
];

/// Proves every row of "Steering triggers".
///
/// Covers: rust-approve/steering-triggers
#[test]
fn steering_triggers() {
    for &(name, markers, expected) in ROWS {
        let root = scratch(&format!("steering-{name}"));
        valid_change(&root, "001-a");
        add_task(&root, "001-a", "2");
        for &(relative, lines) in markers {
            if relative == ".run/approved" {
                write_approved(&root, "001-a", OLD_SEAL);
            } else {
                write_marker(&root, "001-a", relative, lines);
            }
        }
        let before = marker_bytes(&root, "001-a");
        let result = run(&root, "1");
        if let Some(message) = expected {
            let error = result.expect_err("the change needs steering");
            assert_eq!(
                error.to_string(),
                format!("approve failed: {message}"),
                "{name}"
            );
            match &error {
                FeatureError::Failed { command, .. } => {
                    assert_eq!(command, "approve", "{name}");
                }
                other => panic!("{name}: expected a failed error, got {other:?}"),
            }
            assert_eq!(marker_bytes(&root, "001-a"), before, "{name}: marker bytes");
        } else {
            let output = result.unwrap_or_else(|error| panic!("{name}: {error}"));
            let seal = current_seal(&root, "001-a");
            assert_eq!(
                output.text,
                format!("Approved 001 (001-a)\n  Hash: {seal}\n"),
                "{name}: output"
            );
            assert_eq!(
                marker_bytes(&root, "001-a"),
                Some(format!("{seal}\n").into_bytes()),
                "{name}: marker"
            );
        }
    }
}
