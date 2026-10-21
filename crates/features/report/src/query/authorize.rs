//! The authorizer that allows one read-only select and refuses every other statement.

use std::fmt::Write as _;
use std::sync::{Arc, Mutex};

use osq_core::FeatureError;
use rusqlite::fallible_iterator::FallibleIterator;
use rusqlite::hooks::{AuthAction, AuthContext, Authorization};
use rusqlite::{Batch, Connection, Statement};

use super::text;
use super::{failed, refused, sqlite_message};

/// The cause for a denied write.
const WRITE: &str = "the statement would write to the database";
/// The cause for a denied pragma.
const PRAGMA: &str = "the statement would run a pragma";
/// The cause for a denied attach or detach.
const ATTACH: &str = "the statement would attach a database";
/// The cause prefix for a denied read outside the sixteen tables.
const HIDDEN: &str = "the statement would read a table osq does not expose (";
/// The cause for any other denied action.
const OTHER: &str = "the statement is not a read-only SELECT over the history tables";
/// The cause for a second statement after the first.
const SECOND_STATEMENT: &str = "the input holds a second statement after the first";

/// The first action the authorizer denied, owned for the caller.
#[derive(Clone, Debug, PartialEq, Eq)]
enum Denial {
    /// An insert, update or delete.
    Write,
    /// A pragma.
    Pragma,
    /// An attach or detach.
    Attach,
    /// A read of a table outside the sixteen.
    Read {
        /// The table whose read was denied.
        table: String,
    },
    /// Any other denied action.
    Other,
}

impl Denial {
    /// The denial one denied authorizer action describes.
    ///
    /// Implements: rust-report/query-denial-causes
    /// Implements: rust-report/query-other-denials
    fn of(action: AuthAction<'_>) -> Self {
        match action {
            AuthAction::Insert { .. } | AuthAction::Update { .. } | AuthAction::Delete { .. } => {
                Self::Write
            }
            AuthAction::Pragma { .. } => Self::Pragma,
            AuthAction::Attach { .. } | AuthAction::Detach { .. } => Self::Attach,
            AuthAction::Read { table_name, .. } => Self::Read {
                table: table_name.to_owned(),
            },
            _ => Self::Other,
        }
    }
}

/// An empty in-memory database holding only the sixteen history tables.
///
/// Implements: rust-report/query-refusals
pub(super) fn schema_database() -> Result<Connection, FeatureError> {
    let connection =
        Connection::open_in_memory().map_err(|error| failed(sqlite_message(&error)))?;
    connection
        .execute_batch(&schema_sql())
        .map_err(|error| failed(sqlite_message(&error)))?;
    Ok(connection)
}

/// The `CREATE TABLE` statements that give the schema database its sixteen tables.
///
/// Implements: rust-report/query-refusals
fn schema_sql() -> String {
    text::table_list()
        .lines()
        .fold(String::new(), |mut sql, line| {
            let (name, columns) = line
                .split_once('(')
                .expect("a table list line holds a table name");
            let columns = columns
                .strip_suffix(')')
                .expect("a table list line ends with a parenthesis");
            write!(sql, "CREATE TABLE {name} ({columns});")
                .expect("writing to a string cannot fail");
            sql
        })
}

/// Prepares only the first statement of `select` under the read-only authorizer.
///
/// Returns `None` when the argument holds no statement. A prepare failure after
/// a denial gives the first denial's cause, any other prepare failure SQLite's
/// message, and a select longer than its prepared statement the second-statement
/// refusal; each is followed by a newline and the table list.
///
/// Implements: rust-report/query-refusals
/// Implements: rust-report/query-denial-causes
/// Implements: rust-report/query-other-denials
/// Implements: rust-report/query-second-statement
pub(super) fn prepare<'c>(
    connection: &'c Connection,
    select: &str,
) -> Result<Option<Statement<'c>>, FeatureError> {
    let first = Arc::new(Mutex::new(None));
    install_authorizer(connection, &first)?;
    let mut batch = Batch::new(connection, select);
    let statement = match batch.next() {
        Ok(Some(statement)) => statement,
        Ok(None) => return Ok(None),
        Err(error) => return Err(prepare_failure(&first, &error)),
    };
    let sql = statement.expanded_sql().unwrap_or_default();
    if without_trailing_semicolon(select).len() > without_trailing_semicolon(&sql).len() {
        return Err(refused(SECOND_STATEMENT));
    }
    Ok(Some(statement))
}

/// Installs the authorizer, remembering the first action it denies.
///
/// Implements: rust-report/query-refusals
fn install_authorizer(
    connection: &Connection,
    first: &Arc<Mutex<Option<Denial>>>,
) -> Result<(), FeatureError> {
    let seen = Arc::clone(first);
    connection
        .authorizer(Some(move |context: AuthContext<'_>| {
            let action = context.action;
            if allowed(action) {
                return Authorization::Allow;
            }
            let mut denial = seen.lock().expect("the authorizer lock is not poisoned");
            if denial.is_none() {
                *denial = Some(Denial::of(action));
            }
            Authorization::Deny
        }))
        .map_err(|error| failed(sqlite_message(&error)))
}

/// Whether the authorizer allows one action.
///
/// Implements: rust-report/query-refusals
fn allowed(action: AuthAction<'_>) -> bool {
    match action {
        AuthAction::Select | AuthAction::Function { .. } | AuthAction::Recursive => true,
        AuthAction::Read { table_name, .. } => exposed(table_name),
        _ => false,
    }
}

/// Whether `table` is one of the sixteen history tables.
///
/// Implements: rust-report/query-refusals
fn exposed(table: &str) -> bool {
    text::table_list()
        .lines()
        .filter_map(|line| line.split_once('(').map(|(name, _columns)| name))
        .any(|name| name == table)
}

/// The refusal for a prepare that failed, preferring the first denial.
///
/// Implements: rust-report/query-denial-causes
/// Implements: rust-report/query-other-denials
fn prepare_failure(first: &Arc<Mutex<Option<Denial>>>, error: &rusqlite::Error) -> FeatureError {
    let denial = first
        .lock()
        .expect("the authorizer lock is not poisoned")
        .clone();
    let cause = denial
        .as_ref()
        .map_or_else(|| sqlite_message(error), denial_cause);
    refused(&cause)
}

/// The cause of one denial, without the refusal prefix or the table list.
///
/// Implements: rust-report/query-denial-causes
/// Implements: rust-report/query-other-denials
fn denial_cause(denial: &Denial) -> String {
    match denial {
        Denial::Write => WRITE.to_owned(),
        Denial::Pragma => PRAGMA.to_owned(),
        Denial::Attach => ATTACH.to_owned(),
        Denial::Read { table } => format!("{HIDDEN}{table})"),
        Denial::Other => OTHER.to_owned(),
    }
}

/// Trims trailing whitespace and then at most one trailing `;`.
///
/// Implements: rust-report/query-second-statement
fn without_trailing_semicolon(text: &str) -> &str {
    let trimmed = text.trim_end();
    trimmed.strip_suffix(';').unwrap_or(trimmed)
}
