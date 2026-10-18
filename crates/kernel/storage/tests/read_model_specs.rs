//! Proves the `requirements` and `task_outcomes` tables of the spec tables
//! fixture project.

use std::fs;
use std::path::{Path, PathBuf};

use osq_kernel_storage::build_read_model;
use rusqlite::Connection;
use rusqlite::types::Value;
use serde_json::Value as Json;

/// The spec tables fixture project root.
fn project() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/spec-tables")
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

/// The two tables built from the spec documents.
const TABLES: [Table; 2] = [
    Table {
        name: "requirements",
        columns: &[
            "change",
            "capability",
            "kind",
            "requirement",
            "renamed_from",
        ],
    },
    Table {
        name: "task_outcomes",
        columns: &[
            "change",
            "task",
            "capability",
            "scope_globs",
            "scope_files",
            "verify_kind",
            "tests_modify",
            "verify_starts",
            "shares_scope",
            "position",
            "attempts",
            "first_attempt",
            "dead_reason",
            "files_touched",
        ],
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

/// Whether a read column equals a fixture column: text and null as written,
/// numbers by value.
fn equal(actual: &Value, expected: &Json) -> bool {
    match (actual, expected) {
        (Value::Null, Json::Null) => true,
        (Value::Text(left), Json::String(right)) => left == right,
        (Value::Integer(left), Json::Number(right)) => right.as_i64() == Some(*left),
        _ => false,
    }
}

/// Proves one table's rows equal its committed fixture, naming every mismatch.
fn assert_table(connection: &Connection, table: &Table) {
    let actual = rows(connection, table);
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/spec-tables-rows")
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

/// Proves the rows of the spec tables fixture's two spec tables.
///
/// Covers: rust-storage/spec-tables-fixture-rows
#[test]
fn spec_tables_fixture_rows() {
    let path = db_path("spec_tables_fixture_rows.sqlite");
    build_read_model(&project(), &path).unwrap();
    let connection = Connection::open(&path).unwrap();
    let tables: i64 = connection
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type = 'table'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(tables, 16, "table count");
    for table in &TABLES {
        assert_table(&connection, table);
    }
}
