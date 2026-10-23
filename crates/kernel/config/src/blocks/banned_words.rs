//! The `bannedWords` list and the checks TypeScript applies to it.

use toml::{Table, Value};

use crate::error::ConfigError;

use super::value;

/// The `bannedWords` entry keys `osq.toml` may hold.
const KEYS: &[&str] = &["word", "paths"];

/// TypeScript's single error reason for a faulty `bannedWords` list.
const MUST_BE_LIST: &str = "must be a list of { word, paths } entries";

/// A word a project bans from its code and the globs the ban covers.
///
/// Implements: rust-config/banned-words
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BannedWord {
    /// The banned word, trimmed.
    pub word: String,
    /// The globs the ban covers, trimmed and in file order.
    pub paths: Vec<String>,
}

/// Reads `osq.toml`'s raw `bannedWords` value, absent when the key is unset.
///
/// # Errors
///
/// Returns `ConfigError::UnknownKey` for an unknown entry key and
/// `ConfigError::InvalidValue` for every other fault.
///
/// Implements: rust-config/banned-words
pub(crate) fn read_banned_words(raw: Option<&Value>) -> Result<Vec<BannedWord>, ConfigError> {
    let Some(raw) = raw else {
        return Ok(Vec::new());
    };
    let Value::Array(entries) = raw else {
        return Err(list_error());
    };
    entries.iter().map(entry).collect()
}

/// Reads one `bannedWords` entry, checking its keys first.
///
/// # Errors
///
/// Returns `ConfigError::UnknownKey` for an unknown key and
/// `ConfigError::InvalidValue` when the entry is not a table or lacks a
/// valid `word` or `paths`.
fn entry(raw: &Value) -> Result<BannedWord, ConfigError> {
    let Value::Table(table) = raw else {
        return Err(list_error());
    };
    value::check_keys(table, KEYS, "bannedWords")?;
    Ok(BannedWord {
        word: word(table)?,
        paths: paths(table)?,
    })
}

/// Reads the entry's non-empty trimmed `word`.
///
/// # Errors
///
/// Returns the list error when `word` is missing, not a string or empty.
fn word(table: &Table) -> Result<String, ConfigError> {
    match table.get("word") {
        Some(Value::String(word)) if !word.trim().is_empty() => Ok(word.trim().to_owned()),
        _ => Err(list_error()),
    }
}

/// Reads the entry's non-empty `paths`, each trimmed and in file order.
///
/// # Errors
///
/// Returns the list error when `paths` is missing, not a non-empty array of
/// non-empty strings.
fn paths(table: &Table) -> Result<Vec<String>, ConfigError> {
    let Some(Value::Array(paths)) = table.get("paths") else {
        return Err(list_error());
    };
    if paths.is_empty() {
        return Err(list_error());
    }
    paths
        .iter()
        .map(|path| match path {
            Value::String(path) if !path.trim().is_empty() => Ok(path.trim().to_owned()),
            _ => Err(list_error()),
        })
        .collect()
}

/// The `InvalidValue` every shape fault of `bannedWords` reports.
fn list_error() -> ConfigError {
    ConfigError::InvalidValue {
        key: "bannedWords".to_owned(),
        reason: MUST_BE_LIST.to_owned(),
    }
}
