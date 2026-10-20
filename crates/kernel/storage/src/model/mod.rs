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
//! Implements: rust-storage/spec-table-columns
//! Implements: rust-storage/trial-labels

mod error;
mod event_rows;
mod file_rows;
mod insert_events;
mod insert_files;
mod insert_specs;
mod labels;
mod notice_rows;
mod replace;
mod requirement_rows;
mod rows;
mod stream_rows;
mod task_outcome_rows;
mod validator_rows;

use std::path::Path;

use rusqlite::{Transaction, params};

use crate::read::{ChangeSnapshot, Location, read_history, read_manual_edits};
use file_rows::disclosure_rows;
use insert_events::{insert_events, insert_notices};
use insert_files::{insert_disclosures, insert_manual_edits};
use insert_specs::{insert_requirements, insert_task_outcomes};
use labels::apply_labels;
use requirement_rows::requirement_rows;
use rows::{ChangeRow, DeadRow, TaskRow, change_row, dead_rows, task_rows};

pub use error::ReadModelError;
pub use insert_specs::write_task_outcomes;
pub use labels::{TrialLabels, read_trial_labels};
pub use replace::replace_read_model;

/// Writes the read model database for the given snapshots.
///
/// The database is rebuilt in a file beside `db_path` and renamed over it, so
/// a failed write leaves any previous database whole. Archived snapshots get
/// rows in the given order and the `notices` table gets the archived and
/// rejected snapshots by folder name.
///
/// # Errors
///
/// Returns the errors [`replace_read_model`] raises.
///
/// Implements: rust-storage/read-model-tables
/// Implements: rust-storage/read-model-rebuild
/// Implements: rust-storage/file-table-columns
/// Implements: rust-storage/spec-table-columns
pub fn write_read_model(
    db_path: &Path,
    snapshots: &[ChangeSnapshot],
) -> Result<(), ReadModelError> {
    replace_read_model(db_path, |transaction| {
        for snapshot in snapshots {
            if snapshot.location == Location::Archived {
                insert_snapshot(transaction, snapshot)?;
            }
        }
        insert_notices(transaction, snapshots)?;
        Ok(())
    })
}

/// Reads a project's archived and rejected changes into the read model.
///
/// The trial labels, the snapshots, the manual edits and the ownership are all
/// read before the database is touched, so a malformed label file leaves any
/// existing database as it was. Every table is then filled in one transaction.
///
/// # Errors
///
/// Returns [`ReadModelError::Labels`] when a label file is malformed,
/// [`ReadModelError::Storage`] when a change cannot be read, and the errors
/// [`replace_read_model`] raises.
///
/// Implements: rust-storage/read-model-tables
/// Implements: rust-storage/file-table-columns
/// Implements: rust-storage/trial-labels
/// Implements: rust-storage/spec-table-columns
pub fn build_read_model(project_root: &Path, db_path: &Path) -> Result<(), ReadModelError> {
    let labels = read_trial_labels(project_root)?;
    let snapshots = read_history(project_root)?;
    let edits = read_manual_edits(project_root);
    let ownerships =
        osq_kernel_specs::read_capability_ownership(&project_root.join("openspec").join("specs"));
    replace_read_model(db_path, |transaction| {
        for snapshot in &snapshots {
            if snapshot.location == Location::Archived {
                insert_snapshot(transaction, snapshot)?;
            }
        }
        insert_notices(transaction, &snapshots)?;
        apply_labels(transaction, &labels)?;
        insert_manual_edits(transaction, &edits)?;
        insert_task_outcomes(transaction, &snapshots, &ownerships)?;
        Ok(())
    })
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
    insert_requirements(transaction, &requirement_rows(snapshot))?;
    insert_events(transaction, snapshot)?;
    insert_disclosures(transaction, &disclosure_rows(snapshot))
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
