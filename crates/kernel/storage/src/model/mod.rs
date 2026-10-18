//! Building the SQLite read model from change snapshots.
//!
//! The database is a cache: [`write_read_model`] replaces any file already at
//! its path, and every row derives from the files it reads (ADR 025). Archived
//! snapshots get rows in the given order, a rejected snapshot only adds
//! `notices` rows, and the `label` columns are filled last from
//! `openspec/trials/*.json`.
//!
//! Implements: rust-storage/read-model-tables
//! Implements: rust-storage/read-model-rebuild
//! Implements: rust-storage/event-table-columns
//! Implements: rust-storage/file-table-columns
//! Implements: rust-storage/trial-labels

mod error;
mod event_rows;
mod file_rows;
mod insert_events;
mod insert_files;
mod labels;
mod notice_rows;
mod rows;
mod stream_rows;
mod validator_rows;

use std::fs;
use std::io;
use std::path::Path;

use rusqlite::{Connection, Transaction, params};

use crate::read::{ChangeSnapshot, Location, read_history, read_manual_edits};
use file_rows::disclosure_rows;
use insert_events::{insert_events, insert_notices};
use insert_files::{insert_disclosures, insert_manual_edits};
use labels::apply_labels;
use rows::{ChangeRow, DeadRow, TaskRow, change_row, dead_rows, task_rows};

pub use error::ReadModelError;
pub use labels::{TrialLabels, read_trial_labels};

/// Every table's untyped columns, exactly as TypeScript's `osq query` names them.
const CREATE_TABLES: &str = "\
CREATE TABLE changes (id, folder, title, archived_on, goal, tasks, attempts, halts, elapsed_seconds, cost, planner);\
CREATE TABLE tasks (change, task, title, attempts, done);\
CREATE TABLE dead_attempts (change, task, reason);\
CREATE TABLE pauses (change, task, paused_at, until, source);\
CREATE TABLE recertifications (change, task, recertified_at, outcome, automatic, path, credited_to, source);\
CREATE TABLE notices (change, notice, severity, opened, outcome);\
CREATE TABLE focused_runs (change, task, run, outcome, exit_code, duration, timed_out, scenarios, files);\
CREATE TABLE mutation_picks (change, task, pick, file, function, outcome, reason, killed, survived, invalid, duration, scenarios);\
CREATE TABLE mutation_survivors (id, change, task, pick, file, function, line, column, mutator, replacement, label);\
CREATE TABLE validator_runs (change, run, outcome, harness, model, duration, exit_code, scenarios, findings, reason, output);\
CREATE TABLE validator_findings (id, change, run, finding, capability, requirement, scenario, problem, detail, label);\
CREATE TABLE link_findings (id, change, severity, file, message, label);\
CREATE TABLE disclosures (change, task, section, text);\
CREATE TABLE manual_edits (kept_at, record, comment, paths, capabilities);";

/// Writes the read model database for the given snapshots.
///
/// Any file already at `db_path` is removed first, so a stale database never
/// leaks rows. Archived snapshots get rows in the given order and the `notices`
/// table gets the archived and rejected snapshots by folder name.
///
/// # Errors
///
/// Returns [`ReadModelError::Io`] when a stale file cannot be removed,
/// [`ReadModelError::Sqlite`] when the database cannot be opened or written.
///
/// Implements: rust-storage/read-model-tables
/// Implements: rust-storage/read-model-rebuild
/// Implements: rust-storage/file-table-columns
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
    insert_notices(&transaction, snapshots)?;
    transaction.commit()?;
    Ok(())
}

/// Reads a project's archived and rejected changes into the read model.
///
/// The trial labels are read before the database is touched, so a malformed
/// label file leaves any existing database as it was.
///
/// # Errors
///
/// Returns [`ReadModelError::Labels`] when a label file is malformed,
/// [`ReadModelError::Storage`] when a change cannot be read, and the errors
/// [`write_read_model`] raises.
///
/// Implements: rust-storage/read-model-tables
/// Implements: rust-storage/file-table-columns
/// Implements: rust-storage/trial-labels
pub fn build_read_model(project_root: &Path, db_path: &Path) -> Result<(), ReadModelError> {
    let labels = read_trial_labels(project_root)?;
    let snapshots = read_history(project_root)?;
    write_read_model(db_path, &snapshots)?;
    apply_labels(db_path, &labels)?;
    insert_manual_edits(db_path, &read_manual_edits(project_root))
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
    insert_events(transaction, snapshot)?;
    insert_disclosures(transaction, &disclosure_rows(snapshot))
}

/// Creates every table in an empty database.
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
