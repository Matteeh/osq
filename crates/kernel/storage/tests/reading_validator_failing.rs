//! Proves picking the failing validator run of the archived changes.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::event::ValidatorOutcome;
use osq_kernel_storage::{
    ChangeSnapshot, ValidatorFailing, list_changes, read_change, validator_failing,
};

/// A fresh temporary project root for one row, named after the test and row.
fn temp_root(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("reading_validator_failing")
        .join(name);
    let _ = fs::remove_dir_all(&root);
    root
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// Writes a change folder under the archive or the active changes.
fn change(root: &Path, archived: bool, folder: &str, title: &str, events: &str) {
    let dir = if archived {
        root.join("openspec/changes/archive").join(folder)
    } else {
        root.join("openspec/changes").join(folder)
    };
    write(
        &dir.join("proposal.md"),
        &format!("---\ntitle: {title}\nverify: cargo test\n---\n## Goal\n\nMoved.\n"),
    );
    write(&dir.join(".run/events/change.jsonl"), events);
}

/// Escapes one string for a JSON string literal.
fn quoted(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
}

/// One `validator_ran` event, with an optional output.
fn validator_ran(outcome: &str, timestamp: &str, output: Option<&str>) -> String {
    let output = output.map_or_else(String::new, |value| {
        format!(",\"output\":\"{}\"", quoted(value))
    });
    format!(
        "{{\"type\":\"validator_ran\",\"timestamp\":\"{timestamp}\",\"data\":{{\"outcome\":\"{outcome}\",\"harness\":\"claude\",\"model\":\"m\",\"duration\":1,\"exitCode\":null,\"scenarios\":1,\"findings\":[],\"restored\":[]{output}}}}}\n"
    )
}

/// Reads every change folder of a root into its snapshot.
fn snapshots(root: &Path) -> Vec<ChangeSnapshot> {
    list_changes(root)
        .iter()
        .map(|entry| read_change(entry).expect("the change reads"))
        .collect()
}

/// A failing record with the row's change, outcome, run count and error.
fn record(change: &str, outcome: ValidatorOutcome, runs: usize, error: &str) -> ValidatorFailing {
    ValidatorFailing {
        change: String::from(change),
        outcome,
        runs,
        error: String::from(error),
    }
}

/// Proves every row of "Validator failing runs".
///
/// Covers: rust-storage/validator-failing-runs
#[test]
fn validator_failing_runs() {
    let rows: [(&str, &str, &str, Option<ValidatorFailing>); 5] = [
        (
            "first",
            &validator_ran("failed", "2026-10-01T10:00:00.000Z", Some("boom")),
            "",
            Some(record("201-v", ValidatorOutcome::Failed, 1, "boom")),
        ),
        (
            "second",
            &validator_ran("failed", "2026-10-03T10:00:00.000Z", None),
            &validator_ran("unreadable", "2026-10-02T10:00:00.000Z", Some("x")),
            Some(record("201-v", ValidatorOutcome::Failed, 2, "failed")),
        ),
        (
            "third",
            &validator_ran("timed_out", "2026-10-01T10:00:00.000Z", Some("slow")),
            &validator_ran("validated", "2026-10-02T10:00:00.000Z", None),
            None,
        ),
        (
            "fourth",
            &validator_ran("validated", "2026-10-01T10:00:00.000Z", None),
            &format!(
                "{}{}",
                validator_ran(
                    "failed",
                    "2026-10-02T10:00:00.000Z",
                    Some("\n  late  \nmore")
                ),
                validator_ran("not_run", "2026-10-03T10:00:00.000Z", None)
            ),
            Some(record("202-w", ValidatorOutcome::Failed, 1, "late")),
        ),
        ("fifth", "", "", None),
    ];
    for (name, first, second, expected) in rows {
        let root = temp_root(&format!("validator_failing_runs_{name}"));
        change(&root, true, "201-v", "V", first);
        change(&root, true, "202-w", "W", second);
        assert_eq!(validator_failing(&snapshots(&root)), expected, "row {name}");
    }
}

/// Proves the stable timestamp order and the count from the end.
///
/// Covers: rust-storage/validator-failing-runs
#[test]
fn validator_failing_timestamp_edges() {
    let root = temp_root("validator_failing_invalid_timestamp");
    change(
        &root,
        true,
        "301-a",
        "A",
        &validator_ran("failed", "not a time", Some("from invalid")),
    );
    change(
        &root,
        true,
        "302-b",
        "B",
        &validator_ran("failed", "1970-01-01T00:00:00.000Z", Some("from epoch")),
    );
    assert_eq!(
        validator_failing(&snapshots(&root)),
        Some(record("302-b", ValidatorOutcome::Failed, 2, "from epoch"))
    );

    let root = temp_root("validator_failing_equal_timestamps");
    change(
        &root,
        true,
        "201-v",
        "V",
        &validator_ran("validated", "2026-10-01T10:00:00.000Z", None),
    );
    change(
        &root,
        true,
        "202-w",
        "W",
        &validator_ran("failed", "2026-10-01T10:00:00.000Z", Some("equal")),
    );
    assert_eq!(
        validator_failing(&snapshots(&root)),
        Some(record("202-w", ValidatorOutcome::Failed, 1, "equal"))
    );

    let root = temp_root("validator_failing_count_stops");
    change(
        &root,
        true,
        "201-v",
        "V",
        &format!(
            "{}{}",
            validator_ran("validated", "2026-10-01T10:00:00.000Z", None),
            validator_ran("failed", "2026-10-03T10:00:00.000Z", Some("late"))
        ),
    );
    change(
        &root,
        true,
        "202-w",
        "W",
        &validator_ran("unreadable", "2026-10-02T10:00:00.000Z", Some("x")),
    );
    assert_eq!(
        validator_failing(&snapshots(&root)),
        Some(record("201-v", ValidatorOutcome::Failed, 2, "late"))
    );
}

/// Proves each failing outcome keeps the line and each other outcome clears it.
///
/// Covers: rust-storage/validator-failing-runs
#[test]
fn validator_failing_outcomes() {
    let rows: [(&str, &str, Option<ValidatorFailing>); 5] = [
        (
            "failed",
            "failed",
            Some(record("201-v", ValidatorOutcome::Failed, 1, "failed")),
        ),
        (
            "timed_out",
            "timed_out",
            Some(record("201-v", ValidatorOutcome::TimedOut, 1, "timed_out")),
        ),
        (
            "unreadable",
            "unreadable",
            Some(record(
                "201-v",
                ValidatorOutcome::Unreadable,
                1,
                "unreadable",
            )),
        ),
        ("validated", "validated", None),
        ("not_run", "not_run", None),
    ];
    for (name, outcome, expected) in rows {
        let root = temp_root(&format!("validator_failing_outcomes_{name}"));
        change(
            &root,
            true,
            "201-v",
            "V",
            &validator_ran(outcome, "2026-10-01T10:00:00.000Z", Some(" \n ")),
        );
        assert_eq!(validator_failing(&snapshots(&root)), expected, "row {name}");
    }
}

/// Proves an active change's validator run is not read.
///
/// Covers: rust-storage/validator-failing-runs
#[test]
fn validator_failing_ignores_active() {
    let root = temp_root("validator_failing_ignores_active");
    change(
        &root,
        false,
        "201-v",
        "V",
        &validator_ran("failed", "2026-10-01T10:00:00.000Z", Some("boom")),
    );
    assert_eq!(validator_failing(&snapshots(&root)), None);
}
