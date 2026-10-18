//! Proves the `disclosures` and `manual_edits` tables of the files fixture.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::build_read_model;
use rusqlite::Connection;
use rusqlite::types::Value;
use serde_json::Value as Json;

/// The files fixture project root.
fn files() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/files")
}

/// A database path for one test, under the target's temp directory.
fn db_path(name: &str) -> PathBuf {
    Path::new(env!("CARGO_TARGET_TMPDIR")).join(name)
}

/// One table's name and its columns, in table order.
struct Table {
    /// The table's name.
    name: &'static str,
    /// The table's columns, in table order.
    columns: &'static [&'static str],
}

/// The two tables built from files other than event streams.
const TABLES: [Table; 2] = [
    Table {
        name: "disclosures",
        columns: &["change", "task", "section", "text"],
    },
    Table {
        name: "manual_edits",
        columns: &["kept_at", "record", "comment", "paths", "capabilities"],
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

/// Whether a read column equals a fixture column: text and null as written.
fn equal(actual: &Value, expected: &Json) -> bool {
    match (actual, expected) {
        (Value::Null, Json::Null) => true,
        (Value::Text(left), Json::String(right)) => left == right,
        _ => false,
    }
}

/// Proves one table's rows equal its committed fixture, naming every mismatch.
fn assert_table(connection: &Connection, table: &Table) {
    let actual = rows(connection, table);
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/files-rows")
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

/// Proves the rows of the files fixture's `disclosures` and `manual_edits`.
///
/// Covers: rust-storage/files-fixture-rows
#[test]
fn files_fixture_rows() {
    let path = db_path("files_fixture_rows.sqlite");
    build_read_model(&files(), &path).unwrap();
    let connection = Connection::open(&path).unwrap();
    for table in &TABLES {
        assert_table(&connection, table);
    }
}
