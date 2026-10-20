//! Proves a read model rebuild is atomic: it writes a rebuild file and only
//! replaces the database when every step succeeded.

use std::path::{Path, PathBuf};

use osq_kernel_storage::model::ReadModelError;
use osq_kernel_storage::{build_read_model, read_history, replace_read_model, write_read_model};
use rusqlite::Connection;
use rusqlite::types::Value;

/// The fixture project `build_read_model` reads.
fn fixture_project() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/project")
}

/// A database path for one test, under the target's temp directory.
fn db_path(name: &str) -> PathBuf {
    Path::new(env!("CARGO_TARGET_TMPDIR")).join(name)
}

/// The rebuild path beside a database path, with `.rebuild` appended.
fn rebuild_path(db_path: &Path) -> PathBuf {
    let mut name = db_path.file_name().unwrap().to_os_string();
    name.push(".rebuild");
    db_path.with_file_name(name)
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

/// Proves `write_read_model` writes archived snapshots and leaves a rejected
/// one out of the `changes` table.
///
/// Covers: rust-storage/fixture-project-rows
#[test]
fn write_read_model_keeps_archived_rows_only() {
    let path = db_path("write_read_model_archived_only.sqlite");
    std::fs::remove_file(&path).ok();
    let snapshots = read_history(&fixture_project()).unwrap();
    write_read_model(&path, &snapshots).unwrap();
    let folders: Vec<String> = read_all(&path)[0]
        .iter()
        .map(|row| match &row[1] {
            Value::Text(folder) => folder.clone(),
            other => panic!("folder is text, was {other:?}"),
        })
        .collect();
    assert_eq!(folders, ["001-alpha", "002-plain", "010-late"]);
    assert!(!rebuild_path(&path).exists());
}

/// Inserts a row into `changes` and fails with a comparable message.
fn failing_fill(transaction: &rusqlite::Transaction<'_>) -> Result<(), ReadModelError> {
    transaction
        .execute(
            "INSERT INTO changes VALUES ('999', '999-bad', NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL)",
            [],
        )
        .unwrap();
    Err(ReadModelError::Labels(String::from("fill failed")))
}

/// Proves a failed rebuild leaves the previous database whole.
///
/// Covers: rust-storage/failed-rebuild-keeps-the-previous-database
#[test]
fn failed_rebuild_keeps_the_previous_database() {
    let path = db_path("atomic_previous.sqlite");
    std::fs::remove_file(&path).ok();
    build_read_model(&fixture_project(), &path).unwrap();
    let first = read_all(&path);

    let error = replace_read_model(&path, failing_fill).unwrap_err();
    assert!(matches!(&error, ReadModelError::Labels(message) if message == "fill failed"));
    assert_eq!(read_all(&path), first);
    assert!(!rebuild_path(&path).exists());
}

/// Proves a failed first build writes no database at all.
///
/// Covers: rust-storage/failed-first-build-writes-no-database
#[test]
fn failed_first_build_writes_no_database() {
    let path = db_path("atomic_first.sqlite");
    std::fs::remove_file(&path).ok();

    let error = replace_read_model(&path, failing_fill).unwrap_err();
    assert!(matches!(&error, ReadModelError::Labels(message) if message == "fill failed"));
    assert!(!path.exists());
    assert!(!rebuild_path(&path).exists());
}

/// Proves a leftover rebuild file is replaced by a fresh build.
///
/// Covers: rust-storage/leftover-rebuild-file
#[test]
fn leftover_rebuild_file() {
    let path = db_path("atomic_leftover.sqlite");
    let reference = db_path("atomic_leftover_reference.sqlite");
    for candidate in [&path, &reference] {
        std::fs::remove_file(candidate).ok();
    }
    build_read_model(&fixture_project(), &reference).unwrap();
    std::fs::write(rebuild_path(&path), b"interrupted").unwrap();

    build_read_model(&fixture_project(), &path).unwrap();

    assert_eq!(read_all(&path), read_all(&reference));
    assert!(!rebuild_path(&path).exists());
}

/// Proves a database path that is a directory fails without leaving a rebuild.
///
/// Covers: rust-storage/database-path-that-cannot-be-replaced
#[test]
fn database_path_that_cannot_be_replaced() {
    let path = db_path("atomic_directory.sqlite");
    std::fs::remove_dir_all(&path).ok();
    std::fs::create_dir_all(&path).unwrap();

    let error = write_read_model(&path, &[]).unwrap_err();
    assert!(matches!(error, ReadModelError::Io(_)));
    assert!(path.is_dir());
    assert!(!rebuild_path(&path).exists());
    std::fs::remove_dir_all(&path).unwrap();
}
