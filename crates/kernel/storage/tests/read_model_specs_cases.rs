//! Proves the task outcome rules the spec tables fixture leaves out: a token
//! that is only quotes, a token ending in a slash, a `.spec.` name, and a task
//! whose paths have no owner.

use std::path::{Path, PathBuf};

use osq_kernel_specs::CapabilityOwnership;
use osq_kernel_storage::{read_archive, write_read_model, write_task_outcomes};
use rusqlite::Connection;
use rusqlite::types::Value;

/// The cases fixture project root.
fn project() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/spec-tables-cases")
}

/// A database path for one test, under the target's temp directory.
fn db_path(name: &str) -> PathBuf {
    Path::new(env!("CARGO_TARGET_TMPDIR")).join(name)
}

/// The ownership the tests check against, built here rather than read.
fn ownerships() -> Vec<CapabilityOwnership> {
    vec![
        CapabilityOwnership {
            capability: String::from("alpha"),
            globs: vec![String::from("src/alpha/**")],
        },
        CapabilityOwnership {
            capability: String::from("beta"),
            globs: vec![String::from("src/beta/**")],
        },
    ]
}

/// A text column value.
fn text(value: &str) -> Value {
    Value::Text(value.to_owned())
}

/// An integer column value.
fn int(value: i64) -> Value {
    Value::Integer(value)
}

/// A null column value.
fn null() -> Value {
    Value::Null
}

/// Builds the cases read model with the test's ownership and reads its rows.
fn task_outcome_rows(name: &str) -> Vec<Vec<Value>> {
    let path = db_path(name);
    let snapshots = read_archive(&project()).unwrap();
    write_read_model(&path, &snapshots).unwrap();
    write_task_outcomes(&path, &snapshots, &ownerships()).unwrap();
    let connection = Connection::open(&path).unwrap();
    let mut statement = connection
        .prepare(
            "SELECT change, task, capability, scope_globs, scope_files, verify_kind, \
             tests_modify, verify_starts, shares_scope, position, attempts, first_attempt, \
             dead_reason, files_touched FROM task_outcomes ORDER BY rowid",
        )
        .unwrap();
    let mapped = statement
        .query_map([], |row| {
            (0..14)
                .map(|index| row.get::<_, Value>(index))
                .collect::<rusqlite::Result<Vec<Value>>>()
        })
        .unwrap();
    mapped.map(Result::unwrap).collect()
}

/// Proves the columns of the cases fixture's `task_outcomes` rows, the
/// no-owner capability included.
///
/// Covers: rust-storage/columns-of-the-task-outcomes-table
#[test]
fn task_outcome_columns() {
    let rows = task_outcome_rows("cases_columns.sqlite");
    assert_eq!(rows.len(), 6);
    assert_eq!(
        rows[0],
        vec![
            text("001-cases"),
            text("1"),
            null(),
            int(1),
            null(),
            text("one"),
            int(0),
            text("red"),
            int(0),
            int(1),
            int(0),
            int(0),
            null(),
            null(),
        ]
    );
    assert_eq!(
        rows[3],
        vec![
            text("001-cases"),
            text("4"),
            null(),
            int(1),
            int(2),
            text("suite"),
            int(0),
            text("red"),
            int(0),
            int(4),
            int(1),
            int(1),
            null(),
            int(2),
        ]
    );
    assert_eq!(
        rows[4],
        vec![
            text("001-cases"),
            text("5"),
            text("beta"),
            int(1),
            int(3),
            text("other"),
            int(0),
            text("green"),
            int(1),
            int(5),
            int(1),
            int(1),
            null(),
            int(3),
        ]
    );
    assert_eq!(
        rows[5],
        vec![
            text("001-cases"),
            text("6"),
            null(),
            int(1),
            null(),
            text("one"),
            int(0),
            text("red"),
            int(1),
            int(6),
            int(0),
            int(0),
            null(),
            null(),
        ]
    );
}

/// Proves the verify kinds of the cases fixture's rows.
///
/// Covers: rust-storage/verify-kinds
#[test]
fn verify_kinds_edges() {
    let rows = task_outcome_rows("cases_verify_kinds.sqlite");
    let kinds: Vec<Value> = rows.iter().map(|row| row[5].clone()).collect();
    assert_eq!(
        kinds,
        vec![
            text("one"),
            text("one"),
            text("one"),
            text("suite"),
            text("other"),
            text("one"),
        ]
    );
}
