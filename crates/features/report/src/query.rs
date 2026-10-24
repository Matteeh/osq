//! Running one read-only query over the read model.

mod authorize;
pub(crate) mod json;
mod text;

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use osq_core::{FeatureError, Output};
use osq_kernel_storage::build_read_model;
use rusqlite::{Connection, Statement};

/// The command every failure names.
const COMMAND: &str = "query";
/// The cache folder below the project root.
const CACHE_DIR: &str = ".osq";
/// The gitignore file the cache folder holds.
const GITIGNORE_FILE: &str = ".gitignore";
/// The gitignore's contents, as TypeScript's stream index writes it.
const GITIGNORE_CONTENT: &str = "*\n";
/// The read model's file name inside the cache folder.
const READ_MODEL_FILE: &str = "read-model.sqlite";
/// The prefix of every refusal message.
const REFUSED: &str = "osq query refused: ";
/// The message for an argument that holds no SQL statement.
const NO_STATEMENT: &str = "The SQL query contains no statements.";

/// Runs the report feature's `query` for one select and output mode.
///
/// With no select, or one that is blank, it returns the table list and
/// touches no file. Otherwise it builds the read model and prints one
/// statement's rows, as text or JSON.
///
/// # Errors
///
/// Returns [`FeatureError::failed`] for every failure the query requirements
/// name.
///
/// Implements: rust-report/query-output-parity
/// Implements: rust-report/query-table-list
/// Implements: rust-report/query-rows
/// Implements: rust-report/query-json-output
pub(super) fn run_query(
    root: &Path,
    select: Option<&str>,
    json: bool,
) -> Result<Output, FeatureError> {
    match select {
        None => Ok(Output::text(text::table_list())),
        Some(select) if select.trim().is_empty() => Ok(Output::text(text::table_list())),
        Some(select) => query_rows(root, select, json),
    }
}

/// Creates the cache folder and its gitignore, then returns the database path.
///
/// Implements: rust-report/query-cache
fn prepare_directory(root: &Path) -> Result<PathBuf, FeatureError> {
    let cache = root.join(CACHE_DIR);
    fs::create_dir_all(&cache).map_err(|error| failed(error.to_string()))?;
    let gitignore = cache.join(GITIGNORE_FILE);
    if !gitignore.exists() {
        fs::write(&gitignore, GITIGNORE_CONTENT).map_err(|error| failed(error.to_string()))?;
    }
    Ok(cache.join(READ_MODEL_FILE))
}

/// Validates the select, builds the read model and formats its first statement.
///
/// Implements: rust-report/query-rows
/// Implements: rust-report/query-errors
/// Implements: rust-report/query-refusals
/// Implements: rust-report/query-json-output
fn query_rows(root: &Path, select: &str, json: bool) -> Result<Output, FeatureError> {
    let absolute = std::path::absolute(root).map_err(|error| failed(error.to_string()))?;
    {
        let validation = authorize::schema_database()?;
        if authorize::prepare(&validation, select)?.is_none() {
            return Err(refused(NO_STATEMENT));
        }
    }
    let db_path = prepare_directory(&absolute)?;
    build_read_model(&absolute, &db_path).map_err(|error| failed(error.to_string()))?;
    let connection = Connection::open(&db_path).map_err(|error| failed(sqlite_message(&error)))?;
    let home = env::var("HOME").unwrap_or_default();
    let mut statement =
        authorize::prepare(&connection, select)?.ok_or_else(|| refused(NO_STATEMENT))?;
    let rows = read_rows(&mut statement, &absolute.to_string_lossy(), &home, json)?;
    Ok(Output::text(rows))
}

/// Formats the prepared statement's rows as text or as one JSON array.
///
/// Implements: rust-report/query-output-parity
/// Implements: rust-report/query-rows
/// Implements: rust-report/query-errors
/// Implements: rust-report/query-json-output
fn read_rows(
    statement: &mut Statement<'_>,
    root: &str,
    home: &str,
    json: bool,
) -> Result<String, FeatureError> {
    let columns = statement
        .column_names()
        .iter()
        .map(|name| (*name).to_owned())
        .collect::<Vec<_>>();
    let mut output = if json {
        Vec::new()
    } else {
        vec![columns.join("\t")]
    };
    let mut rows = statement
        .query([])
        .map_err(|error| failed(sqlite_message(&error)))?;
    while let Some(row) = rows
        .next()
        .map_err(|error| failed(sqlite_message(&error)))?
    {
        let mut cells = Vec::with_capacity(columns.len());
        for index in 0..columns.len() {
            let value = row
                .get_ref(index)
                .map_err(|error| failed(sqlite_message(&error)))?;
            cells.push(if json {
                json::value_text(value, root, home)
            } else {
                text::cell_text(value, root, home)
            });
        }
        output.push(if json {
            json::object_text(&columns, &cells)
        } else {
            cells.join("\t")
        });
    }
    if json {
        Ok(format!("[{}]", output.join(",")))
    } else {
        Ok(output.join("\n"))
    }
}

/// A refusal: the cause, a newline and the table list.
///
/// Implements: rust-report/query-errors
fn refused(cause: &str) -> FeatureError {
    failed(format!("{REFUSED}{cause}\n{}", text::table_list()))
}

/// A `query` failure with one message.
///
/// Implements: rust-report/query-errors
fn failed(message: impl Into<String>) -> FeatureError {
    FeatureError::failed(COMMAND, message)
}

/// SQLite's own message for an error.
///
/// Implements: rust-report/query-errors
fn sqlite_message(error: &rusqlite::Error) -> String {
    match error {
        rusqlite::Error::SqlInputError { msg, .. } => msg.clone(),
        rusqlite::Error::SqliteFailure(_, Some(message)) => message.clone(),
        rusqlite::Error::SqliteFailure(inner, None) => inner.to_string(),
        other => other.to_string(),
    }
}
