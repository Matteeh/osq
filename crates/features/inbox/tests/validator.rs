//! Proves the validator-failing item.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{Feature, Invocation};
use osq_feature_inbox::InboxFeature;

/// A fresh temporary project root, with anything at that name removed.
fn temp_root(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = fs::remove_dir_all(&root);
    root
}

/// Writes a file, creating its parent folders.
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

/// Runs the inbox command on a root.
fn inbox_text(root: &Path) -> String {
    let invocation = Invocation::new(root, "inbox", Vec::new());
    InboxFeature::new()
        .run(&invocation)
        .expect("inbox succeeds")
        .text
}

/// The full text one needs-you line gives without running or landed items.
fn needs_text(line: &str) -> String {
    format!("Needs you\n{line}\nRunning\n  (none)\nLanded since last look\n  (none)\n")
}

/// Escapes one string for a JSON string literal.
fn quoted(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
}

/// Writes an archived change folder with a title and its change stream.
fn change(root: &Path, folder: &str, title: Option<&str>, events: &str) {
    let dir = root.join("openspec/changes/archive").join(folder);
    let frontmatter = title.map_or_else(String::new, |title| format!("title: {title}\n"));
    write(
        &dir.join("proposal.md"),
        &format!("---\n{frontmatter}verify: cargo test\n---\n## Goal\n\nArchived.\n"),
    );
    write(&dir.join(".run/events/change.jsonl"), events);
}

/// One `validator_ran` event, with an optional output and reason.
fn validator_ran(
    outcome: &str,
    timestamp: &str,
    output: Option<&str>,
    reason: Option<&str>,
) -> String {
    let output = output.map_or_else(String::new, |value| {
        format!(",\"output\":\"{}\"", quoted(value))
    });
    let reason = reason.map_or_else(String::new, |value| format!(",\"reason\":\"{value}\""));
    format!(
        "{{\"type\":\"validator_ran\",\"timestamp\":\"{timestamp}\",\"data\":{{\"outcome\":\"{outcome}\",\"harness\":\"claude\",\"model\":\"m\",\"duration\":1,\"exitCode\":null,\"scenarios\":1,\"findings\":[],\"restored\":[]{output}{reason}}}}}\n"
    )
}

/// Covers: rust-inbox/validator-runs
#[test]
fn validator_runs_first_row() {
    let root = temp_root("inbox_validator_runs_first_row");
    change(
        &root,
        "201-v",
        Some("V"),
        &validator_ran("failed", "2026-10-01T10:00:00.000Z", Some("boom"), None),
    );
    change(&root, "202-w", Some("W"), "");
    assert_eq!(
        inbox_text(&root),
        needs_text("  201: V — validator failed 1× in a row: boom — osq show 201")
    );
}

/// Covers: rust-inbox/validator-runs
#[test]
fn validator_runs_second_row() {
    let root = temp_root("inbox_validator_runs_second_row");
    change(
        &root,
        "201-v",
        Some("V"),
        &validator_ran("failed", "2026-10-03T10:00:00.000Z", None, None),
    );
    change(
        &root,
        "202-w",
        Some("W"),
        &validator_ran("unreadable", "2026-10-02T10:00:00.000Z", Some("x"), None),
    );
    assert_eq!(
        inbox_text(&root),
        needs_text("  201: V — validator failed 2× in a row: failed — osq show 201")
    );
}

/// Covers: rust-inbox/validator-runs
#[test]
fn validator_runs_third_row() {
    let root = temp_root("inbox_validator_runs_third_row");
    change(
        &root,
        "201-v",
        Some("V"),
        &validator_ran("timed_out", "2026-10-01T10:00:00.000Z", Some("slow"), None),
    );
    change(
        &root,
        "202-w",
        Some("W"),
        &validator_ran("validated", "2026-10-02T10:00:00.000Z", None, None),
    );
    assert_eq!(inbox_text(&root), "Inbox empty.\n");
}

/// Covers: rust-inbox/validator-runs
#[test]
fn validator_runs_fourth_row() {
    let root = temp_root("inbox_validator_runs_fourth_row");
    change(
        &root,
        "201-v",
        Some("V"),
        &validator_ran("validated", "2026-10-01T10:00:00.000Z", None, None),
    );
    let mut events = validator_ran(
        "failed",
        "2026-10-02T10:00:00.000Z",
        Some("\n  late  \nmore"),
        None,
    );
    events.push_str(&validator_ran(
        "not_run",
        "2026-10-03T10:00:00.000Z",
        None,
        Some("no_scenarios"),
    ));
    change(&root, "202-w", Some("W"), &events);
    assert_eq!(
        inbox_text(&root),
        needs_text("  202: W — validator failed 1× in a row: late — osq show 202")
    );
}

/// Covers: rust-inbox/validator-runs
#[test]
fn validator_runs_fifth_row() {
    let root = temp_root("inbox_validator_runs_fifth_row");
    change(&root, "201-v", Some("V"), "");
    change(&root, "202-w", Some("W"), "");
    assert_eq!(inbox_text(&root), "Inbox empty.\n");
}

/// Covers: rust-inbox/validator-runs
#[test]
fn validator_runs_unreadable_timestamp_counts_as_zero() {
    let root = temp_root("inbox_validator_runs_unreadable_timestamp");
    change(
        &root,
        "301-a",
        Some("A"),
        &validator_ran("failed", "not a time", Some("from invalid"), None),
    );
    change(
        &root,
        "302-b",
        Some("B"),
        &validator_ran(
            "failed",
            "1970-01-01T00:00:00.000Z",
            Some("from epoch"),
            None,
        ),
    );
    assert_eq!(
        inbox_text(&root),
        needs_text("  302: B — validator failed 2× in a row: from epoch — osq show 302")
    );
}

/// Covers: rust-inbox/validator-runs
#[test]
fn validator_runs_fall_back_to_folder() {
    let root = temp_root("inbox_validator_runs_fall_back_to_folder");
    change(
        &root,
        "weird-one",
        None,
        &validator_ran("failed", "2026-10-01T10:00:00.000Z", Some("boom"), None),
    );
    assert_eq!(
        inbox_text(&root),
        needs_text(
            "  weird-one: weird-one — validator failed 1× in a row: boom — osq show weird-one"
        )
    );
}
