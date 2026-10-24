//! Proves the steering triggers that refuse or steer an approved change.

mod support;

use std::fs;
use std::path::Path;

use osq_core::FeatureError;

use support::{
    OLD_SEAL, add_task, current_seal, run, scratch, tree, valid_change, write, write_approved,
    write_marker,
};

/// One row's marker files: their paths under the change folder and frontmatter.
type Markers = &'static [(&'static str, &'static [&'static str])];

/// What a row expects from `approve`.
#[derive(Clone, Copy)]
enum Expected {
    /// The refusal after `approve failed: `.
    Failed(&'static str),
    /// An approval that writes only the seal.
    Approved,
    /// A steered approval with the event's targets and its next task.
    Steered(&'static [&'static str], &'static str),
}

/// One row of "Steering triggers": its name, markers, lock and outcome.
struct Row {
    /// A name for the scratch root and assertions.
    name: &'static str,
    /// The row's frontmatter markers.
    markers: Markers,
    /// The running lock's path and text, when the row has one.
    lock: Option<(&'static str, &'static str)>,
    /// What the approval gives.
    expected: Expected,
}

/// Every row of "Steering triggers", in the scenario's order.
const ROWS: &[Row] = &[
    Row {
        name: "change-conflict",
        markers: &[
            (".run/approved", &[]),
            (".run/regressed/change.md", &["reason: sync_conflict"]),
        ],
        lock: None,
        expected: Expected::Failed(
            "Change 001-a needs steering: change conflict (sync_conflict). \
             Rust approve does not approve default-branch steering yet.",
        ),
    },
    Row {
        name: "change-requirement-changed",
        markers: &[
            (".run/approved", &[]),
            (".run/regressed/change.md", &["reason: requirement_changed"]),
        ],
        lock: None,
        expected: Expected::Failed(
            "Change 001-a needs steering: change requirement_changed \
             (requirement_changed). Rust approve does not approve default-branch steering yet.",
        ),
    },
    Row {
        name: "change-sync-verify-red",
        markers: &[
            (".run/approved", &[]),
            (".run/regressed/change.md", &["reason: sync_verify_red"]),
        ],
        lock: None,
        expected: Expected::Failed(
            "Change 001-a needs steering: change regression (sync_verify_red). \
             Rust approve does not approve default-branch steering yet.",
        ),
    },
    Row {
        name: "change-verify-path-missing",
        markers: &[
            (".run/approved", &[]),
            (".run/regressed/change.md", &["reason: verify_path_missing"]),
        ],
        lock: None,
        expected: Expected::Steered(&["change"], "1"),
    },
    Row {
        name: "change-other-reason",
        markers: &[
            (".run/approved", &[]),
            (".run/regressed/change.md", &["reason: worktree_dirty"]),
        ],
        lock: None,
        expected: Expected::Approved,
    },
    Row {
        name: "task-scope-regression",
        markers: &[
            (".run/approved", &[]),
            (".run/regressed/1.md", &["reason: scope_regression"]),
        ],
        lock: None,
        expected: Expected::Steered(&["1"], "1"),
    },
    Row {
        name: "task-scope-regression-verified",
        markers: &[
            (".run/approved", &[]),
            (
                ".run/regressed/1.md",
                &["reason: scope_regression", "verification_passed: true"],
            ),
        ],
        lock: None,
        expected: Expected::Approved,
    },
    Row {
        name: "task-blocked",
        markers: &[
            (".run/approved", &[]),
            (".run/dead/1.md", &["reason: blocked"]),
        ],
        lock: None,
        expected: Expected::Steered(&["1"], "1"),
    },
    Row {
        name: "task-entry-missing",
        markers: &[
            (".run/approved", &[]),
            (".run/dead/1.md", &["reason: entry_missing"]),
        ],
        lock: None,
        expected: Expected::Steered(&["1"], "1"),
    },
    Row {
        name: "task-stuck",
        markers: &[
            (".run/approved", &[]),
            (".run/dead/1.md", &["reason: verify_red", "stuck: true"]),
        ],
        lock: None,
        expected: Expected::Steered(&["1"], "1"),
    },
    Row {
        name: "task-verify-red",
        markers: &[
            (".run/approved", &[]),
            (".run/dead/1.md", &["reason: verify_red"]),
        ],
        lock: None,
        expected: Expected::Approved,
    },
    Row {
        name: "task-done",
        markers: &[
            (".run/approved", &[]),
            (".run/done/1", &[]),
            (".run/dead/1.md", &["reason: blocked"]),
        ],
        lock: None,
        expected: Expected::Approved,
    },
    Row {
        name: "unapproved",
        markers: &[(".run/dead/1.md", &["reason: blocked"])],
        lock: None,
        expected: Expected::Approved,
    },
    Row {
        name: "change-and-task",
        markers: &[
            (".run/approved", &[]),
            (".run/regressed/change.md", &["reason: verify_red"]),
            (".run/dead/2.md", &["reason: blocked"]),
        ],
        lock: None,
        expected: Expected::Steered(&["change", "2"], "1"),
    },
    Row {
        name: "change-and-done-task",
        markers: &[
            (".run/approved", &[]),
            (".run/done/1", &[]),
            (".run/regressed/change.md", &["reason: verify_red"]),
        ],
        lock: None,
        expected: Expected::Steered(&["change"], "2"),
    },
    Row {
        name: "change-and-running-task",
        markers: &[
            (".run/approved", &[]),
            (".run/regressed/change.md", &["reason: verify_red"]),
        ],
        lock: Some((".run/running/2.pid", "{\"pid\":999999,\"startedAt\":0}\n")),
        expected: Expected::Failed("001-a has a task running; approve it after the task ends"),
    },
    Row {
        name: "default-branch-and-running-task",
        markers: &[
            (".run/approved", &[]),
            (".run/regressed/change.md", &["reason: sync_conflict"]),
        ],
        lock: Some((".run/running/1.pid", "{\"pid\":999999,\"startedAt\":0}\n")),
        expected: Expected::Failed("001-a has a task running; approve it after the task ends"),
    },
];

/// Proves every row of "Steering triggers".
///
/// Covers: rust-approve/steering-triggers
#[test]
fn steering_triggers() {
    for row in ROWS {
        let root = scratch(&format!("steering-{}", row.name));
        valid_change(&root, "001-a");
        add_task(&root, "001-a", "2");
        for &(relative, lines) in row.markers {
            if relative == ".run/approved" {
                write_approved(&root, "001-a", OLD_SEAL);
            } else {
                write_marker(&root, "001-a", relative, lines);
            }
        }
        if let Some((relative, contents)) = row.lock {
            write(
                &root,
                &format!("openspec/changes/001-a/{relative}"),
                contents,
            );
        }
        let before = run_tree(&root);
        let result = run(&root, "1");
        check(&root, row, &before, &result);
    }
}

/// Every file under the change folder's `.run/`, keyed from the change folder.
fn run_tree(root: &Path) -> std::collections::BTreeMap<String, Vec<u8>> {
    tree(root, "openspec/changes/001-a")
        .into_iter()
        .filter(|(relative, _)| relative.starts_with(".run/"))
        .collect()
}

/// Checks one row's output, marker and event bytes.
fn check(
    root: &Path,
    row: &Row,
    before: &std::collections::BTreeMap<String, Vec<u8>>,
    result: &Result<osq_core::Output, FeatureError>,
) {
    let after = run_tree(root);
    if let Expected::Failed(message) = row.expected {
        let error = result.as_ref().expect_err("the row is refused");
        assert_eq!(
            error.to_string(),
            format!("approve failed: {message}"),
            "{}",
            row.name
        );
        match error {
            FeatureError::Failed { command, .. } => assert_eq!(command, "approve", "{}", row.name),
            other => panic!("{}: expected a failed error, got {other:?}", row.name),
        }
        assert_eq!(&after, before, "{}: marker bytes", row.name);
        return;
    }
    let output = result
        .as_ref()
        .unwrap_or_else(|error| panic!("{}: {error}", row.name));
    let seal = current_seal(root, "001-a");
    let continues = match row.expected {
        Expected::Approved => String::new(),
        Expected::Steered(_, task) => format!("  Continues from task {task}\n"),
        Expected::Failed(_) => unreachable!("failed rows return above"),
    };
    assert_eq!(
        output.text,
        format!("Approved 001 (001-a)\n  Hash: {seal}\n{continues}"),
        "{}: output",
        row.name
    );
    assert_eq!(
        after.get(".run/approved"),
        Some(&format!("{seal}\n").into_bytes()),
        "{}: seal",
        row.name
    );
    kept(before, &after, row.name);
    match row.expected {
        Expected::Approved => {
            assert!(
                !after.contains_key(".run/events/change.jsonl"),
                "{}: no event",
                row.name
            );
        }
        Expected::Steered(targets, _) => {
            check_event(root, &seal, targets, row.name);
        }
        Expected::Failed(_) => unreachable!("failed rows return above"),
    }
}

/// Asserts every preexisting file other than the seal keeps its bytes.
fn kept(
    before: &std::collections::BTreeMap<String, Vec<u8>>,
    after: &std::collections::BTreeMap<String, Vec<u8>>,
    name: &str,
) {
    for (relative, bytes) in before {
        if relative != ".run/approved" {
            assert_eq!(after.get(relative), Some(bytes), "{name}: {relative}");
        }
    }
}

/// Asserts the one `approved` event names the seal and the row's targets.
fn check_event(root: &Path, seal: &str, targets: &[&str], name: &str) {
    let text = fs::read_to_string(root.join("openspec/changes/001-a/.run/events/change.jsonl"))
        .unwrap_or_else(|error| panic!("{name}: event: {error}"));
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(lines.len(), 1, "{name}: one event");
    let value: serde_json::Value =
        serde_json::from_str(lines[0]).unwrap_or_else(|error| panic!("{name}: {error}"));
    assert_eq!(value["type"], "approved", "{name}: type");
    assert_eq!(value["data"]["hash"], seal, "{name}: hash");
    let found: Vec<&str> = value["data"]["targets"]
        .as_array()
        .unwrap_or_else(|| panic!("{name}: targets"))
        .iter()
        .map(|value| value.as_str().unwrap_or_default())
        .collect();
    assert_eq!(found, targets, "{name}: targets");
}
