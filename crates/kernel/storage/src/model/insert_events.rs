//! Inserting the nine event tables' rows into the read model.

use rusqlite::{Transaction, params};

use crate::read::ChangeSnapshot;

use super::event_rows::{PauseRow, RecertificationRow, pause_rows, recertification_rows};
use super::notice_rows::{NoticeRow, notice_rows, notice_subjects};
use super::stream_rows::{FocusedRunRow, MutationPickRow, MutationSurvivorRow};
use super::stream_rows::{focused_rows, mutation_tables};
use super::validator_rows::{LinkFindingRow, ValidatorFindingRow, ValidatorRunRow};
use super::validator_rows::{link_rows, validator_tables};

/// Inserts one archived snapshot's rows into every event table but `notices`.
pub(super) fn insert_events(
    transaction: &Transaction<'_>,
    snapshot: &ChangeSnapshot,
) -> Result<(), rusqlite::Error> {
    insert_pauses(transaction, &pause_rows(snapshot))?;
    insert_recertifications(transaction, &recertification_rows(snapshot))?;
    insert_focused_runs(transaction, &focused_rows(snapshot))?;
    let mutation = mutation_tables(snapshot);
    insert_mutation_picks(transaction, &mutation.picks)?;
    insert_mutation_survivors(transaction, &mutation.survivors)?;
    let validator = validator_tables(snapshot);
    insert_validator_runs(transaction, &validator.runs)?;
    insert_validator_findings(transaction, &validator.findings)?;
    insert_link_findings(transaction, &link_rows(snapshot))
}

/// Inserts the `notices` rows of archived and rejected snapshots by folder name.
pub(super) fn insert_notices(
    transaction: &Transaction<'_>,
    snapshots: &[ChangeSnapshot],
) -> Result<(), rusqlite::Error> {
    for snapshot in notice_subjects(snapshots) {
        insert_notice_rows(transaction, &notice_rows(snapshot))?;
    }
    Ok(())
}

/// Inserts the `pauses` rows.
fn insert_pauses(transaction: &Transaction<'_>, rows: &[PauseRow]) -> Result<(), rusqlite::Error> {
    let mut statement = transaction.prepare("INSERT INTO pauses VALUES (?, ?, ?, ?, ?)")?;
    for row in rows {
        statement.execute(params![
            row.change,
            row.task,
            row.paused_at,
            row.until,
            row.source
        ])?;
    }
    Ok(())
}

/// Inserts the `recertifications` rows.
fn insert_recertifications(
    transaction: &Transaction<'_>,
    rows: &[RecertificationRow],
) -> Result<(), rusqlite::Error> {
    let mut statement =
        transaction.prepare("INSERT INTO recertifications VALUES (?, ?, ?, ?, ?, ?, ?, ?)")?;
    for row in rows {
        statement.execute(params![
            row.change,
            row.task,
            row.recertified_at,
            row.outcome,
            row.automatic,
            row.path,
            row.credited_to,
            row.source
        ])?;
    }
    Ok(())
}

/// Inserts the `focused_runs` rows.
fn insert_focused_runs(
    transaction: &Transaction<'_>,
    rows: &[FocusedRunRow],
) -> Result<(), rusqlite::Error> {
    let mut statement =
        transaction.prepare("INSERT INTO focused_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")?;
    for row in rows {
        statement.execute(params![
            row.change,
            row.task,
            row.run,
            row.outcome,
            row.exit_code,
            row.duration,
            row.timed_out,
            row.scenarios,
            row.files
        ])?;
    }
    Ok(())
}

/// Inserts the `mutation_picks` rows.
fn insert_mutation_picks(
    transaction: &Transaction<'_>,
    rows: &[MutationPickRow],
) -> Result<(), rusqlite::Error> {
    let mut statement = transaction
        .prepare("INSERT INTO mutation_picks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")?;
    for row in rows {
        statement.execute(params![
            row.change,
            row.task,
            row.pick,
            row.file,
            row.function,
            row.outcome,
            row.reason,
            row.killed,
            row.survived,
            row.invalid,
            row.duration,
            row.scenarios
        ])?;
    }
    Ok(())
}

/// Inserts the `mutation_survivors` rows.
fn insert_mutation_survivors(
    transaction: &Transaction<'_>,
    rows: &[MutationSurvivorRow],
) -> Result<(), rusqlite::Error> {
    let mut statement = transaction
        .prepare("INSERT INTO mutation_survivors VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")?;
    for row in rows {
        statement.execute(params![
            row.id,
            row.change,
            row.task,
            row.pick,
            row.file,
            row.function,
            row.line,
            row.column,
            row.mutator,
            row.replacement,
            None::<i64>
        ])?;
    }
    Ok(())
}

/// Inserts the `validator_runs` rows.
fn insert_validator_runs(
    transaction: &Transaction<'_>,
    rows: &[ValidatorRunRow],
) -> Result<(), rusqlite::Error> {
    let mut statement = transaction
        .prepare("INSERT INTO validator_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")?;
    for row in rows {
        statement.execute(params![
            row.change,
            row.run,
            row.outcome,
            row.harness,
            row.model,
            row.duration,
            row.exit_code,
            row.scenarios,
            row.findings,
            row.reason,
            row.output
        ])?;
    }
    Ok(())
}

/// Inserts the `validator_findings` rows.
fn insert_validator_findings(
    transaction: &Transaction<'_>,
    rows: &[ValidatorFindingRow],
) -> Result<(), rusqlite::Error> {
    let mut statement = transaction
        .prepare("INSERT INTO validator_findings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")?;
    for row in rows {
        statement.execute(params![
            row.id,
            row.change,
            row.run,
            row.finding,
            row.capability,
            row.requirement,
            row.scenario,
            row.problem,
            row.detail,
            None::<i64>
        ])?;
    }
    Ok(())
}

/// Inserts the `link_findings` rows.
fn insert_link_findings(
    transaction: &Transaction<'_>,
    rows: &[LinkFindingRow],
) -> Result<(), rusqlite::Error> {
    let mut statement =
        transaction.prepare("INSERT INTO link_findings VALUES (?, ?, ?, ?, ?, ?)")?;
    for row in rows {
        statement.execute(params![
            row.id,
            row.change,
            row.severity,
            row.file,
            row.message,
            None::<i64>
        ])?;
    }
    Ok(())
}

/// Inserts the `notices` rows.
fn insert_notice_rows(
    transaction: &Transaction<'_>,
    rows: &[NoticeRow],
) -> Result<(), rusqlite::Error> {
    let mut statement = transaction.prepare("INSERT INTO notices VALUES (?, ?, ?, ?, ?)")?;
    for row in rows {
        statement.execute(params![
            row.change,
            row.notice,
            row.severity,
            row.opened,
            row.outcome
        ])?;
    }
    Ok(())
}
