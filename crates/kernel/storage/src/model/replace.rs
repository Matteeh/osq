//! Replacing the read model database atomically.

use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, Transaction};

use super::error::ReadModelError;

/// Every table's untyped columns, exactly as TypeScript's `osq query` names them.
const CREATE_TABLES: &str = "\
CREATE TABLE changes (id, folder, title, archived_on, goal, tasks, attempts, halts, elapsed_seconds, cost, planner);\
CREATE TABLE tasks (change, task, title, attempts, done);\
CREATE TABLE dead_attempts (change, task, reason);\
CREATE TABLE requirements (change, capability, kind, requirement, renamed_from);\
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
CREATE TABLE manual_edits (kept_at, record, comment, paths, capabilities);\
CREATE TABLE task_outcomes (change, task, capability, scope_globs, scope_files, verify_kind, tests_modify, verify_starts, shares_scope, position, attempts, first_attempt, dead_reason, files_touched);";

/// Rebuilds the database at `db_path` from one transaction in a rebuild file.
///
/// Any file left at the rebuild path, `db_path` with `.rebuild` appended to its
/// file name, is removed first. The tables are then created in a new database
/// there, `fill` runs on one transaction of one connection, and the committed
/// rebuild file is renamed over `db_path`. A failed step removes the rebuild
/// file and returns its error, so the previous database stays whole, or no
/// file exists when there was none.
///
/// # Errors
///
/// Returns the error of the step that failed: [`ReadModelError::Io`] when the
/// rebuild file cannot be removed, the database cannot be opened or the rename
/// fails, [`ReadModelError::Sqlite`] when a table or the transaction cannot be
/// written, and whatever error `fill` returns.
///
/// Implements: rust-storage/read-model-rebuild
pub fn replace_read_model<F>(db_path: &Path, fill: F) -> Result<(), ReadModelError>
where
    F: FnOnce(&Transaction<'_>) -> Result<(), ReadModelError>,
{
    let rebuild_path = rebuild_path(db_path);
    let result = write_rebuild(&rebuild_path, db_path, fill);
    if result.is_err() {
        let _ = fs::remove_file(&rebuild_path);
    }
    result
}

/// Writes the rebuild file and renames it over `db_path`.
fn write_rebuild<F>(rebuild_path: &Path, db_path: &Path, fill: F) -> Result<(), ReadModelError>
where
    F: FnOnce(&Transaction<'_>) -> Result<(), ReadModelError>,
{
    remove_stale_rebuild(rebuild_path)?;
    let mut connection = Connection::open(rebuild_path)?;
    connection.execute_batch(CREATE_TABLES)?;
    let transaction = connection.transaction()?;
    fill(&transaction)?;
    transaction.commit()?;
    drop(connection);
    fs::rename(rebuild_path, db_path)?;
    Ok(())
}

/// Removes a leftover rebuild file, ignoring one that is not there.
fn remove_stale_rebuild(rebuild_path: &Path) -> Result<(), std::io::Error> {
    if rebuild_path.exists() {
        fs::remove_file(rebuild_path)?;
    }
    Ok(())
}

/// The path a rebuild is written to before it replaces `db_path`.
fn rebuild_path(db_path: &Path) -> PathBuf {
    let mut name = db_path
        .file_name()
        .map_or_else(OsString::new, OsString::from);
    name.push(".rebuild");
    db_path.with_file_name(name)
}
