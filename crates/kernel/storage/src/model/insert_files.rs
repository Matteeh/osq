//! Inserting the `disclosures` and `manual_edits` rows into the read model.
//!
//! Only these functions touch SQLite (ADR 023).

use std::path::Path;

use rusqlite::{Connection, Transaction, params};

use crate::read::ManualEdit;

use super::error::ReadModelError;
use super::file_rows::{DisclosureRow, ManualEditRow, manual_edit_rows};

/// Inserts one archived snapshot's `disclosures` rows.
pub(super) fn insert_disclosures(
    transaction: &Transaction<'_>,
    rows: &[DisclosureRow],
) -> Result<(), rusqlite::Error> {
    let mut statement = transaction.prepare("INSERT INTO disclosures VALUES (?, ?, ?, ?)")?;
    for row in rows {
        statement.execute(params![row.change, row.task, row.section, row.text])?;
    }
    Ok(())
}

/// Adds the manual edit records to `manual_edits` in their own transaction.
///
/// # Errors
///
/// Returns [`ReadModelError::Sqlite`] when the database cannot be opened or
/// written.
pub(super) fn insert_manual_edits(
    db_path: &Path,
    records: &[ManualEdit],
) -> Result<(), ReadModelError> {
    let mut connection = Connection::open(db_path)?;
    let transaction = connection.transaction()?;
    insert_manual_rows(&transaction, &manual_edit_rows(records))?;
    transaction.commit()?;
    Ok(())
}

/// Inserts the `manual_edits` rows.
fn insert_manual_rows(
    transaction: &Transaction<'_>,
    rows: &[ManualEditRow],
) -> Result<(), rusqlite::Error> {
    let mut statement = transaction.prepare("INSERT INTO manual_edits VALUES (?, ?, ?, ?, ?)")?;
    for row in rows {
        statement.execute(params![
            row.kept_at,
            row.record,
            row.comment,
            row.paths,
            row.capabilities
        ])?;
    }
    Ok(())
}
