//! Proves the typed `task_outcomes` query gives the table's rows.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_specs::read_capability_ownership;
use osq_kernel_storage::{
    ChangeEntry, Location, TaskOutcome, read_change, read_history, task_outcomes,
};
use serde_json::Value as Json;

/// The spec tables fixture project root.
fn project() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/spec-tables")
}

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

/// A JSON string, or null.
fn text(value: Option<&String>) -> Json {
    value.map_or(Json::Null, |value| Json::String(value.clone()))
}

/// A JSON number, or null.
fn number(value: Option<i64>) -> Json {
    value.map_or(Json::Null, Json::from)
}

/// Compares one query row with one fixture row, field by field.
fn assert_row(actual: &TaskOutcome, expected: &Json, index: usize) {
    let expected = expected.as_object().unwrap();
    assert_eq!(
        Json::String(actual.change.clone()),
        expected["change"],
        "row {index} change"
    );
    assert_eq!(
        Json::String(actual.task.clone()),
        expected["task"],
        "row {index} task"
    );
    assert_eq!(
        text(actual.capability.as_ref()),
        expected["capability"],
        "row {index} capability"
    );
    assert_eq!(
        Json::from(actual.scope_globs),
        expected["scope_globs"],
        "row {index} scope_globs"
    );
    assert_eq!(
        number(actual.scope_files),
        expected["scope_files"],
        "row {index} scope_files"
    );
    assert_eq!(
        Json::String(actual.verify_kind.to_owned()),
        expected["verify_kind"],
        "row {index} verify_kind"
    );
    assert_eq!(
        Json::from(actual.tests_modify),
        expected["tests_modify"],
        "row {index} tests_modify"
    );
    assert_eq!(
        Json::String(actual.verify_starts.to_owned()),
        expected["verify_starts"],
        "row {index} verify_starts"
    );
    assert_eq!(
        Json::from(actual.shares_scope),
        expected["shares_scope"],
        "row {index} shares_scope"
    );
    assert_eq!(
        Json::from(actual.position),
        expected["position"],
        "row {index} position"
    );
    assert_eq!(
        Json::from(actual.attempts),
        expected["attempts"],
        "row {index} attempts"
    );
    assert_eq!(
        Json::from(actual.first_attempt),
        expected["first_attempt"],
        "row {index} first_attempt"
    );
    assert_eq!(
        text(actual.dead_reason.as_ref()),
        expected["dead_reason"],
        "row {index} dead_reason"
    );
    assert_eq!(
        number(actual.files_touched),
        expected["files_touched"],
        "row {index} files_touched"
    );
}

/// Proves the query rows equal the committed table rows in order.
///
/// Covers: rust-storage/query-rows-equal-the-table-rows
#[test]
fn query_rows_equal_the_table_rows() {
    let root = project();
    let snapshots = read_history(&root).unwrap();
    let ownerships = read_capability_ownership(&root.join("openspec").join("specs"));
    let rows = task_outcomes(&snapshots, &ownerships);
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/spec-tables-rows/task_outcomes.json");
    let expected: Vec<Json> = serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
    assert_eq!(rows.len(), 6, "row count");
    assert_eq!(rows.len(), expected.len(), "row count");
    for (index, (row, expected)) in rows.iter().zip(expected.iter()).enumerate() {
        assert_row(row, expected, index);
    }
}

/// Proves a rejected snapshot with tasks gives no outcome row.
///
/// Covers: rust-storage/rejected-snapshots-give-no-outcome
#[test]
fn rejected_snapshots_give_no_outcome() {
    let root = temp_root("task_outcome_rejected");
    let dir = root.join("openspec/changes/rejected/001-x");
    write(
        &dir.join("tasks/1.md"),
        "---\ntitle: \"One\"\nverify: node verify.cjs\nscope:\n  - src/a.rs\n---\n",
    );
    let entry = ChangeEntry {
        folder: String::from("001-x"),
        location: Location::Rejected,
        path: dir,
    };
    let snapshot = read_change(&entry).unwrap();
    assert!(!snapshot.tasks.is_empty(), "the snapshot has tasks");
    assert!(task_outcomes(&[snapshot], &[]).is_empty(), "no outcome row");
}
