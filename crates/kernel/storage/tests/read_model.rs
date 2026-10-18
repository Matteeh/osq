//! Proves the read model's fixture rows, its rebuild and its stale replacement.

use std::path::{Path, PathBuf};

use osq_kernel_storage::model::ReadModelError;
use osq_kernel_storage::{ChangeEntry, Location, build_read_model, read_change, write_read_model};
use rusqlite::Connection;
use rusqlite::types::Value;

/// The fixture project `read_archive` reads.
fn fixture_project() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/project")
}

/// The fixture project holding a malformed event file.
fn broken_project() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/broken")
}

/// A database path for one test, under the target's temp directory.
fn db_path(name: &str) -> PathBuf {
    Path::new(env!("CARGO_TARGET_TMPDIR")).join(name)
}

/// A text column value.
fn text(value: &str) -> Value {
    Value::Text(value.to_owned())
}

/// An integer column value.
fn int(value: i64) -> Value {
    Value::Integer(value)
}

/// A real column value.
fn real(value: f64) -> Value {
    Value::Real(value)
}

/// A null column value.
fn null() -> Value {
    Value::Null
}

/// Reads a table's rows as typed values, in insertion order.
fn rows(db: &Connection, sql: &str, columns: usize) -> Vec<Vec<Value>> {
    let mut statement = db.prepare(sql).unwrap();
    let mapped = statement
        .query_map([], |row| {
            (0..columns)
                .map(|index| row.get::<_, Value>(index))
                .collect::<rusqlite::Result<Vec<Value>>>()
        })
        .unwrap();
    mapped.map(Result::unwrap).collect()
}

/// The three tables of a built database, in insertion order.
fn read_all(path: &Path) -> Vec<Vec<Vec<Value>>> {
    let db = Connection::open(path).unwrap();
    vec![
        rows(
            &db,
            "SELECT id, folder, title, archived_on, goal, tasks, attempts, halts, elapsed_seconds, cost, planner FROM changes ORDER BY rowid",
            11,
        ),
        rows(
            &db,
            "SELECT change, task, title, attempts, done FROM tasks ORDER BY rowid",
            5,
        ),
        rows(
            &db,
            "SELECT change, task, reason FROM dead_attempts ORDER BY rowid",
            3,
        ),
    ]
}

/// The three expected tables of the fixture project.
fn expected() -> Vec<Vec<Vec<Value>>> {
    vec![
        vec![
            vec![
                text("001"),
                text("001-alpha"),
                text("Alpha"),
                text("2026-10-01"),
                text("Ship alpha."),
                int(3),
                int(3),
                int(1),
                int(1801),
                real(0.75),
                text("opus"),
            ],
            vec![
                text("002"),
                text("002-plain"),
                null(),
                null(),
                null(),
                int(0),
                null(),
                null(),
                null(),
                null(),
                text("brief-planner"),
            ],
            vec![
                text("010"),
                text("010-late"),
                text("Late"),
                null(),
                null(),
                int(1),
                int(1),
                int(0),
                null(),
                null(),
                null(),
            ],
        ],
        vec![
            vec![
                text("001-alpha"),
                text("1"),
                text("When one, first"),
                int(1),
                int(1),
            ],
            vec![
                text("001-alpha"),
                text("2"),
                text("When two, second"),
                int(2),
                int(1),
            ],
            vec![
                text("001-alpha"),
                text("10"),
                text("When ten, tenth"),
                int(0),
                int(0),
            ],
            vec![
                text("010-late"),
                text("1"),
                text("When late, dead"),
                int(1),
                int(0),
            ],
        ],
        vec![
            vec![text("001-alpha"), text("2"), text("verify_failed")],
            vec![text("010-late"), text("1"), text("unknown")],
        ],
    ]
}

/// Proves the fixture project's three tables, row by row.
///
/// Covers: rust-storage/fixture-project-rows
#[test]
fn fixture_project_rows() {
    let path = db_path("fixture_project_rows.sqlite");
    build_read_model(&fixture_project(), &path).unwrap();
    assert_eq!(read_all(&path), expected());
}

/// Proves a deleted database rebuilds to the same rows.
///
/// Covers: rust-storage/delete-and-rebuild
#[test]
fn delete_and_rebuild() {
    let path = db_path("delete_and_rebuild.sqlite");
    build_read_model(&fixture_project(), &path).unwrap();
    let first = read_all(&path);
    std::fs::remove_file(&path).unwrap();
    build_read_model(&fixture_project(), &path).unwrap();
    assert_eq!(read_all(&path), first);
}

/// Proves a stale database is replaced, not appended to.
///
/// Covers: rust-storage/rebuild-over-a-stale-database
#[test]
fn rebuild_over_a_stale_database() {
    let path = db_path("rebuild_over_a_stale_database.sqlite");
    std::fs::remove_file(&path).ok();
    let stale = Connection::open(&path).unwrap();
    stale
        .execute_batch(
            "CREATE TABLE changes (id, folder, title, archived_on, goal, tasks, \
             attempts, halts, elapsed_seconds, cost, planner);\
             INSERT INTO changes VALUES ('999','999-stale',NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL);",
        )
        .unwrap();
    drop(stale);
    build_read_model(&fixture_project(), &path).unwrap();
    assert_eq!(read_all(&path), expected());
}

/// Proves a database path that cannot be removed fails as an IO error.
///
/// Covers: rust-storage/rebuild-over-a-stale-database
#[test]
fn unremovable_stale_path_fails() {
    let path = db_path("unremovable_stale_path.sqlite");
    std::fs::remove_dir_all(&path).ok();
    std::fs::create_dir_all(&path).unwrap();
    let error = write_read_model(&path, &[]).unwrap_err();
    assert!(matches!(error, ReadModelError::Io(_)));
    std::fs::remove_dir_all(&path).unwrap();
}

/// Proves every read model error speaks, and carries its cause.
///
/// Covers: rust-storage/rebuild-over-a-stale-database
#[test]
fn read_model_errors_speak() {
    let directory = db_path("error_display.sqlite");
    std::fs::remove_dir_all(&directory).ok();
    std::fs::create_dir_all(&directory).unwrap();
    let io_error = write_read_model(&directory, &[]).unwrap_err();
    std::fs::remove_dir_all(&directory).unwrap();
    assert!(io_error.to_string().starts_with("io: "));
    assert!(std::error::Error::source(&io_error).is_some());

    let entry = ChangeEntry {
        folder: String::from("001-broken"),
        location: Location::Active,
        path: broken_project().join("openspec/changes/001-broken"),
    };
    let storage_error = ReadModelError::Storage(read_change(&entry).unwrap_err());
    let message = storage_error.to_string();
    assert!(message.contains("1.jsonl:3:"), "message was {message}");
    assert!(
        message.contains("not one JSON object"),
        "message was {message}"
    );
    assert!(std::error::Error::source(&storage_error).is_some());
}
