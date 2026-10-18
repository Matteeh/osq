//! Building the SQLite read model from change snapshots.
//!
//! The database is a cache: [`write_read_model`] replaces any file already at
//! its path, and every row derives from the files it reads (ADR 025). Only
//! archived snapshots get rows; the caller may pass every snapshot
//! [`read_archive`](crate::read::read_archive) returns.
//!
//! Implements: rust-storage/read-model-tables
//! Implements: rust-storage/read-model-rebuild

mod error;
mod rows;

use std::fs;
use std::io;
use std::path::Path;

use rusqlite::{Connection, Transaction, params};

use crate::read::{ChangeSnapshot, Location, read_archive};
use rows::{ChangeRow, DeadRow, TaskRow, change_row, dead_rows, task_rows};

pub use error::ReadModelError;

/// The three tables' untyped columns, exactly as TypeScript's `osq query` names them.
const CREATE_TABLES: &str = "\
CREATE TABLE changes (id, folder, title, archived_on, goal, tasks, attempts, halts, elapsed_seconds, cost, planner);\
CREATE TABLE tasks (change, task, title, attempts, done);\
CREATE TABLE dead_attempts (change, task, reason);";

/// Writes the read model database for the given archived snapshots.
///
/// Any file already at `db_path` is removed first, so a stale database never
/// leaks rows. Rows go in the given snapshot order.
///
/// # Errors
///
/// Returns [`ReadModelError::Io`] when a stale file cannot be removed,
/// [`ReadModelError::Sqlite`] when the database cannot be opened or written.
///
/// Implements: rust-storage/read-model-tables
/// Implements: rust-storage/read-model-rebuild
pub fn write_read_model(
    db_path: &Path,
    snapshots: &[ChangeSnapshot],
) -> Result<(), ReadModelError> {
    remove_existing(db_path)?;
    let mut connection = Connection::open(db_path)?;
    create_tables(&connection)?;
    let transaction = connection.transaction()?;
    for snapshot in snapshots {
        if snapshot.location == Location::Archived {
            insert_snapshot(&transaction, snapshot)?;
        }
    }
    transaction.commit()?;
    Ok(())
}

/// Reads a project's archived changes and writes them as the read model.
///
/// # Errors
///
/// Returns [`ReadModelError::Storage`] when an archived change cannot be read,
/// and the errors [`write_read_model`] raises.
///
/// Implements: rust-storage/read-model-tables
pub fn build_read_model(project_root: &Path, db_path: &Path) -> Result<(), ReadModelError> {
    let snapshots = read_archive(project_root)?;
    write_read_model(db_path, &snapshots)
}

/// Inserts one archived snapshot's rows into every table.
fn insert_snapshot(
    transaction: &Transaction<'_>,
    snapshot: &ChangeSnapshot,
) -> Result<(), rusqlite::Error> {
    insert_change(transaction, &change_row(snapshot))?;
    for row in task_rows(snapshot) {
        insert_task(transaction, &row)?;
    }
    for row in dead_rows(snapshot) {
        insert_dead(transaction, &row)?;
    }
    Ok(())
}

/// Creates the three tables in an empty database.
fn create_tables(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute_batch(CREATE_TABLES)
}

/// Removes a file at `db_path`, ignoring one that is not there.
fn remove_existing(db_path: &Path) -> Result<(), io::Error> {
    if db_path.exists() {
        fs::remove_file(db_path)?;
    }
    Ok(())
}

/// Inserts one `changes` row.
fn insert_change(transaction: &Transaction<'_>, row: &ChangeRow) -> Result<(), rusqlite::Error> {
    transaction
        .execute(
            "INSERT INTO changes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                row.id,
                row.folder,
                row.title,
                row.archived_on,
                row.goal,
                row.tasks,
                row.attempts,
                row.halts,
                row.elapsed_seconds,
                row.cost,
                row.planner,
            ],
        )
        .map(|_| ())
}

/// Inserts one `tasks` row.
fn insert_task(transaction: &Transaction<'_>, row: &TaskRow) -> Result<(), rusqlite::Error> {
    transaction
        .execute(
            "INSERT INTO tasks VALUES (?, ?, ?, ?, ?)",
            params![row.change, row.task, row.title, row.attempts, row.done],
        )
        .map(|_| ())
}

/// Inserts one `dead_attempts` row.
fn insert_dead(transaction: &Transaction<'_>, row: &DeadRow) -> Result<(), rusqlite::Error> {
    transaction
        .execute(
            "INSERT INTO dead_attempts VALUES (?, ?, ?)",
            params![row.change, row.task, row.reason],
        )
        .map(|_| ())
}
