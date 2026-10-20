//! Inserting the `requirements` and `task_outcomes` rows into the read model.
//!
//! Only these functions touch SQLite (ADR 023).

use std::path::Path;

use osq_kernel_specs::CapabilityOwnership;
use rusqlite::{Connection, Transaction, params};

use crate::read::{ChangeSnapshot, Location};

use super::error::ReadModelError;
use super::requirement_rows::RequirementRow;
use super::task_outcome_rows::{TaskOutcomeRow, task_outcome_rows};

/// Inserts one archived snapshot's `requirements` rows.
pub(super) fn insert_requirements(
    transaction: &Transaction<'_>,
    rows: &[RequirementRow],
) -> Result<(), rusqlite::Error> {
    let mut statement = transaction.prepare("INSERT INTO requirements VALUES (?, ?, ?, ?, ?)")?;
    for row in rows {
        statement.execute(params![
            row.change,
            row.capability,
            row.kind,
            row.requirement,
            row.renamed_from
        ])?;
    }
    Ok(())
}

/// Fills the `task_outcomes` table for the archived snapshots, in their order.
///
/// The database and its tables must exist already; [`super::write_read_model`]
/// creates them. Rejected snapshots add no row.
///
/// # Errors
///
/// Returns [`ReadModelError::Sqlite`] when the database cannot be opened or
/// written.
///
/// Implements: rust-storage/spec-table-columns
pub fn write_task_outcomes(
    db_path: &Path,
    snapshots: &[ChangeSnapshot],
    ownerships: &[CapabilityOwnership],
) -> Result<(), ReadModelError> {
    let mut connection = Connection::open(db_path)?;
    let transaction = connection.transaction()?;
    insert_task_outcomes(&transaction, snapshots, ownerships)?;
    transaction.commit()?;
    Ok(())
}

/// Fills the `task_outcomes` table for the archived snapshots, in their order.
///
/// Rejected snapshots add no row.
pub(super) fn insert_task_outcomes(
    transaction: &Transaction<'_>,
    snapshots: &[ChangeSnapshot],
    ownerships: &[CapabilityOwnership],
) -> Result<(), rusqlite::Error> {
    for snapshot in snapshots {
        if snapshot.location == Location::Archived {
            insert_task_outcome_rows(transaction, &task_outcome_rows(snapshot, ownerships))?;
        }
    }
    Ok(())
}

/// Inserts the `task_outcomes` rows.
fn insert_task_outcome_rows(
    transaction: &Transaction<'_>,
    rows: &[TaskOutcomeRow],
) -> Result<(), rusqlite::Error> {
    let mut statement = transaction
        .prepare("INSERT INTO task_outcomes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")?;
    for row in rows {
        statement.execute(params![
            row.change,
            row.task,
            row.capability,
            row.scope_globs,
            row.scope_files,
            row.verify_kind,
            row.tests_modify,
            row.verify_starts,
            row.shares_scope,
            row.position,
            row.attempts,
            row.first_attempt,
            row.dead_reason,
            row.files_touched
        ])?;
    }
    Ok(())
}
