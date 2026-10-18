//! Proves the nine event tables of the history fixture, their labels and the
//! malformed label file.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::model::ReadModelError;
use osq_kernel_storage::{build_read_model, read_trial_labels};
use rusqlite::Connection;
use rusqlite::types::Value;
use serde_json::Value as Json;

/// The directory holding every fixture project.
fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

/// The history fixture project root.
fn history() -> PathBuf {
    fixtures().join("history")
}

/// The project whose validator label file is malformed.
fn bad_labels() -> PathBuf {
    fixtures().join("bad-labels")
}

/// A database path for one test, under the target's temp directory.
fn db_path(name: &str) -> PathBuf {
    Path::new(env!("CARGO_TARGET_TMPDIR")).join(name)
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

/// A text column value.
fn text(value: &str) -> Value {
    Value::Text(value.to_owned())
}

/// A null column value.
fn null() -> Value {
    Value::Null
}

/// One event table's name and columns, in the order TypeScript lists them.
struct Table {
    /// The table's name.
    name: &'static str,
    /// The table's columns, in table order.
    columns: &'static [&'static str],
}

/// The nine event tables, in table order.
const TABLES: [Table; 9] = [
    Table {
        name: "pauses",
        columns: &["change", "task", "paused_at", "until", "source"],
    },
    Table {
        name: "recertifications",
        columns: &[
            "change",
            "task",
            "recertified_at",
            "outcome",
            "automatic",
            "path",
            "credited_to",
            "source",
        ],
    },
    Table {
        name: "notices",
        columns: &["change", "notice", "severity", "opened", "outcome"],
    },
    Table {
        name: "focused_runs",
        columns: &[
            "change",
            "task",
            "run",
            "outcome",
            "exit_code",
            "duration",
            "timed_out",
            "scenarios",
            "files",
        ],
    },
    Table {
        name: "mutation_picks",
        columns: &[
            "change",
            "task",
            "pick",
            "file",
            "function",
            "outcome",
            "reason",
            "killed",
            "survived",
            "invalid",
            "duration",
            "scenarios",
        ],
    },
    Table {
        name: "mutation_survivors",
        columns: &[
            "id",
            "change",
            "task",
            "pick",
            "file",
            "function",
            "line",
            "column",
            "mutator",
            "replacement",
            "label",
        ],
    },
    Table {
        name: "validator_runs",
        columns: &[
            "change",
            "run",
            "outcome",
            "harness",
            "model",
            "duration",
            "exit_code",
            "scenarios",
            "findings",
            "reason",
            "output",
        ],
    },
    Table {
        name: "validator_findings",
        columns: &[
            "id",
            "change",
            "run",
            "finding",
            "capability",
            "requirement",
            "scenario",
            "problem",
            "detail",
            "label",
        ],
    },
    Table {
        name: "link_findings",
        columns: &["id", "change", "severity", "file", "message", "label"],
    },
];

/// Reads one table's rows as typed values, in insertion order.
fn rows(connection: &Connection, table: &Table) -> Vec<Vec<Value>> {
    let select = format!(
        "SELECT {} FROM {} ORDER BY rowid",
        table.columns.join(", "),
        table.name
    );
    let mut statement = connection.prepare(&select).unwrap();
    let width = table.columns.len();
    let mapped = statement
        .query_map([], |row| {
            (0..width)
                .map(|index| row.get::<_, Value>(index))
                .collect::<rusqlite::Result<Vec<Value>>>()
        })
        .unwrap();
    mapped.map(Result::unwrap).collect()
}

/// An integer's value as `f64`, parsed from its text to avoid a cast.
fn number(value: i64) -> Option<f64> {
    value.to_string().parse().ok()
}

/// Whether a read column equals a fixture column: text and null as written,
/// numbers equal by value as `f64`.
fn equal(actual: &Value, expected: &Json) -> bool {
    match (actual, expected) {
        (Value::Null, Json::Null) => true,
        (Value::Text(left), Json::String(right)) => left == right,
        (Value::Integer(left), Json::Number(right)) => number(*left) == right.as_f64(),
        (Value::Real(left), Json::Number(right)) => Some(*left) == right.as_f64(),
        _ => false,
    }
}

/// Proves one table's rows equal its committed fixture, naming every mismatch.
fn assert_table(connection: &Connection, table: &Table) {
    let actual = rows(connection, table);
    let path = fixtures()
        .join("history-rows")
        .join(format!("{}.json", table.name));
    let expected: Vec<Json> = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
    assert_eq!(actual.len(), expected.len(), "{} row count", table.name);
    for (index, (row, expected)) in actual.iter().zip(expected.iter()).enumerate() {
        let expected = expected.as_object().unwrap();
        for (column, value) in table.columns.iter().zip(row) {
            let wanted = &expected[*column];
            assert!(
                equal(value, wanted),
                "{} row {index} column {column}: read {value:?}, fixture {wanted:?}",
                table.name
            );
        }
    }
}

/// One id's label column: its value, null, or no such row.
#[derive(Debug, PartialEq, Eq)]
enum Label {
    /// The column holds this label.
    Value(i64),
    /// The row exists and its label is null.
    Null,
    /// No row has that id.
    Missing,
}

/// Reads one id's label column.
fn label(connection: &Connection, table: &str, id: &str) -> Label {
    match connection.query_row(
        &format!("SELECT label FROM {table} WHERE id = ?1"),
        [id],
        |row| row.get::<_, Option<i64>>(0),
    ) {
        Ok(Some(value)) => Label::Value(value),
        Ok(None) => Label::Null,
        Err(_) => Label::Missing,
    }
}

/// One event table's column names, in table order.
fn column_names(connection: &Connection, table: &str) -> Vec<String> {
    let select = format!("SELECT name FROM pragma_table_info('{table}') ORDER BY cid");
    let mut statement = connection.prepare(&select).unwrap();
    let mapped = statement
        .query_map([], |row| row.get::<_, String>(0))
        .unwrap();
    mapped.map(Result::unwrap).collect()
}

/// Proves every event table's columns are named and ordered as TypeScript's.
///
/// Covers: rust-storage/columns-of-the-event-tables
#[test]
fn event_table_columns() {
    let path = db_path("history_columns.sqlite");
    build_read_model(&history(), &path).unwrap();
    let connection = Connection::open(&path).unwrap();
    for table in &TABLES {
        let expected: Vec<String> = table
            .columns
            .iter()
            .map(|name| (*name).to_owned())
            .collect();
        assert_eq!(
            column_names(&connection, table.name),
            expected,
            "{}",
            table.name
        );
    }
}

/// Proves each of the nine event tables of the history fixture.
///
/// Covers: rust-storage/history-fixture-rows
#[test]
fn history_fixture_rows() {
    let path = db_path("history_fixture_rows.sqlite");
    build_read_model(&history(), &path).unwrap();
    let connection = Connection::open(&path).unwrap();
    for table in &TABLES {
        assert_table(&connection, table);
    }
}

/// Proves the trial labels fill the history fixture's labelled rows.
///
/// Covers: rust-storage/labels-in-the-history-fixture
#[test]
fn labels_in_the_history_fixture() {
    let path = db_path("history_labels.sqlite");
    build_read_model(&history(), &path).unwrap();
    let connection = Connection::open(&path).unwrap();
    let validator = label(&connection, "validator_findings", "001.v1.1");
    assert_eq!(validator, Label::Value(1));
    assert_eq!(
        label(&connection, "mutation_survivors", "001.1.m1.1"),
        Label::Value(0)
    );
    assert_eq!(
        label(&connection, "mutation_survivors", "001.1.m1.2"),
        Label::Null
    );
    assert_eq!(
        label(&connection, "link_findings", "001.l1"),
        Label::Value(1)
    );
    assert_eq!(
        label(&connection, "validator_findings", "999.v1.1"),
        Label::Missing
    );
}

/// Proves a malformed label file fails the build and leaves the file at the
/// database path untouched.
///
/// Covers: rust-storage/malformed-label-file
#[test]
fn malformed_label_file() {
    let path = db_path("malformed_labels.sqlite");
    fs::write(&path, "keep").unwrap();
    let error = build_read_model(&bad_labels(), &path).unwrap_err();
    assert!(
        matches!(error, ReadModelError::Labels(_)),
        "error was {error:?}"
    );
    assert_eq!(
        error.to_string(),
        "openspec/trials/validator.json must be a JSON object of true or false labels"
    );
    assert_eq!(fs::read(&path).unwrap(), b"keep");
}

/// Proves the label files' missing, valid and malformed shapes.
///
/// Covers: rust-storage/malformed-label-file
#[test]
fn label_file_shapes() {
    let missing = temp_root("labels_missing");
    fs::create_dir_all(&missing).unwrap();
    let labels = read_trial_labels(&missing).unwrap();
    assert!(labels.validator.is_empty() && labels.traceability.is_empty());

    let valid = temp_root("labels_valid");
    write(
        &valid.join("openspec/trials/validator.json"),
        r#"{"a":true,"b":false}"#,
    );
    write(
        &valid.join("openspec/trials/traceability.json"),
        r#"{"c":true}"#,
    );
    let labels = read_trial_labels(&valid).unwrap();
    assert_eq!(labels.validator.get("a"), Some(&true));
    assert_eq!(labels.validator.get("b"), Some(&false));
    assert_eq!(labels.traceability.get("c"), Some(&true));

    let validator_message =
        "openspec/trials/validator.json must be a JSON object of true or false labels";
    for (name, text) in [
        ("labels_json", "{"),
        ("labels_array", "[true]"),
        ("labels_null", "null"),
        ("labels_number", r#"{"a":1}"#),
        ("labels_string", r#"{"a":"yes"}"#),
    ] {
        let root = temp_root(name);
        write(&root.join("openspec/trials/validator.json"), text);
        let error = read_trial_labels(&root).unwrap_err();
        assert_eq!(error.to_string(), validator_message, "{name}");
    }

    let traceability = temp_root("labels_traceability");
    write(
        &traceability.join("openspec/trials/traceability.json"),
        "[1]",
    );
    let error = read_trial_labels(&traceability).unwrap_err();
    assert_eq!(
        error.to_string(),
        "openspec/trials/traceability.json must be a JSON object of true or false labels"
    );
}

/// Proves notices come from plan records and manifest items, in folder order.
///
/// Covers: rust-storage/columns-of-the-event-tables
#[test]
fn notices_from_records_and_manifests() {
    let root = temp_root("notice_edges");
    let changes = root.join("openspec/changes");
    write(
        &changes.join("rejected/001-y/.run/manifest.json"),
        r#"{"notices":{"items":[{"id":"a","severity":"red"}]}}"#,
    );
    write(
        &changes.join("archive/002-x/.run/manifest.json"),
        r#"{"notices":{"items":[{"id":"b","severity":"grey"}]}}"#,
    );
    write(
        &changes.join("archive/003-plan/.run/plan.jsonl"),
        "{\"type\":\"plan_ready\",\"timestamp\":\"t\",\"data\":{\"hash\":\"h\",\"notices\":[{\"id\":\"first\",\"severity\":\"amber\",\"folded\":false}]}}\n\
         {\"type\":\"plan_ready\",\"timestamp\":\"t\",\"data\":{\"hash\":\"h\",\"notices\":[{\"id\":\"second\",\"severity\":\"red\",\"folded\":true}]}}\n",
    );
    write(
        &changes.join("rejected/004-one/.run/plan.jsonl"),
        "{\"type\":\"plan_ready\",\"timestamp\":\"t\",\"data\":{\"hash\":\"h\",\"notices\":[{\"id\":\"only\",\"severity\":\"grey\",\"folded\":false}]}}\n",
    );
    fs::create_dir_all(changes.join("rejected/005-none")).unwrap();
    let path = db_path("notice_edges.sqlite");
    build_read_model(&root, &path).unwrap();
    let connection = Connection::open(&path).unwrap();
    let actual = rows(&connection, &TABLES[2]);
    let expected = vec![
        vec![
            text("001-y"),
            text("a"),
            text("red"),
            null(),
            text("rejected"),
        ],
        vec![
            text("002-x"),
            text("b"),
            text("grey"),
            null(),
            text("approved"),
        ],
        vec![
            text("003-plan"),
            text("first"),
            text("amber"),
            null(),
            text("planned_again"),
        ],
        vec![
            text("004-one"),
            text("only"),
            text("grey"),
            null(),
            text("rejected"),
        ],
    ];
    assert_eq!(actual, expected);
}
