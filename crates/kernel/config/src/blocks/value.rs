//! The readers every `osq.toml` table shares.
//!
//! Each reader takes the dotted path of the key it reads and names that path
//! in every error, so a nested key such as `timeouts.gitSeconds` is reported
//! as it is written in the file.

use toml::{Table, Value};

use crate::error::ConfigError;

/// The `expected` text for a key that must be a table.
pub(crate) const A_TABLE: &str = "a table";
/// The `expected` text for a key that must be an integer.
pub(crate) const AN_INTEGER: &str = "an integer";
/// The `expected` text for a key that must be a boolean.
pub(crate) const A_BOOLEAN: &str = "a boolean";
/// The `expected` text for a key that must be a string.
pub(crate) const A_STRING: &str = "a string";
/// The `reason` text for an integer below one.
pub(crate) const MUST_BE_POSITIVE: &str = "must be a positive integer";
/// The `reason` text for an integer below zero.
pub(crate) const MUST_BE_NON_NEGATIVE: &str = "must be a non-negative integer";
/// The `reason` text for a string that is empty after trimming.
pub(crate) const MUST_BE_NON_EMPTY: &str = "must be a non-empty string";
/// The `reason` text for a price that is missing, not a number or out of range.
pub(crate) const MUST_BE_FINITE_NON_NEGATIVE: &str = "must be a finite non-negative number";

/// The name `path`'s table holds its key under, the last dotted segment.
fn key_of(path: &str) -> &str {
    match path.rsplit_once('.') {
        Some((_, key)) => key,
        None => path,
    }
}

/// Joins a table's `prefix` to the `key` it holds, giving the dotted path.
fn dotted(prefix: &str, key: &str) -> String {
    if prefix.is_empty() {
        key.to_owned()
    } else {
        format!("{prefix}.{key}")
    }
}

/// Reports the first unknown key of `table` in byte order.
///
/// `known` names the keys the table allows, and `prefix` is its dotted path,
/// empty at the top level.
///
/// # Errors
///
/// Returns `ConfigError::UnknownKey` for the first key `known` does not name.
///
/// Implements: rust-config/config-errors
pub(crate) fn check_keys(table: &Table, known: &[&str], prefix: &str) -> Result<(), ConfigError> {
    for key in table.keys() {
        if !known.contains(&key.as_str()) {
            return Err(ConfigError::UnknownKey {
                key: dotted(prefix, key),
            });
        }
    }
    Ok(())
}

/// Reads the table at the dotted `path`, absent when the key is unset.
///
/// # Errors
///
/// Returns `ConfigError::WrongType` when the value is not a table.
///
/// Implements: rust-config/config-errors
pub(crate) fn table<'a>(table: &'a Table, path: &str) -> Result<Option<&'a Table>, ConfigError> {
    match table.get(key_of(path)) {
        None => Ok(None),
        Some(Value::Table(inner)) => Ok(Some(inner)),
        Some(_) => Err(ConfigError::WrongType {
            key: path.to_owned(),
            expected: A_TABLE,
        }),
    }
}

/// Reads the positive integer at the dotted `path`, absent when it is unset.
///
/// # Errors
///
/// Returns `ConfigError::WrongType` when the value is not a TOML integer and
/// `ConfigError::InvalidValue` when it is below one.
///
/// Implements: rust-config/config-errors
pub(crate) fn positive_integer(table: &Table, path: &str) -> Result<Option<u64>, ConfigError> {
    let Some(value) = table.get(key_of(path)) else {
        return Ok(None);
    };
    let Value::Integer(raw) = value else {
        return Err(ConfigError::WrongType {
            key: path.to_owned(),
            expected: AN_INTEGER,
        });
    };
    let value = u64::try_from(*raw).unwrap_or_default();
    if value < 1 {
        return Err(ConfigError::InvalidValue {
            key: path.to_owned(),
            reason: MUST_BE_POSITIVE.to_owned(),
        });
    }
    Ok(Some(value))
}

/// Reads the non-negative integer at the dotted `path`, absent when unset.
///
/// # Errors
///
/// Returns `ConfigError::WrongType` when the value is not a TOML integer and
/// `ConfigError::InvalidValue` when it is below zero.
///
/// Implements: rust-config/gate-settings
pub(crate) fn non_negative_integer(table: &Table, path: &str) -> Result<Option<u64>, ConfigError> {
    let Some(value) = table.get(key_of(path)) else {
        return Ok(None);
    };
    let Value::Integer(raw) = value else {
        return Err(ConfigError::WrongType {
            key: path.to_owned(),
            expected: AN_INTEGER,
        });
    };
    u64::try_from(*raw)
        .map(Some)
        .map_err(|_| ConfigError::InvalidValue {
            key: path.to_owned(),
            reason: MUST_BE_NON_NEGATIVE.to_owned(),
        })
}

/// Reads the required finite non-negative number at the dotted `path`.
///
/// A TOML integer and a TOML float are both numbers here.
///
/// # Errors
///
/// Returns `ConfigError::InvalidValue` when the key is missing, is not a TOML
/// integer or float, or is negative, infinite or NaN.
///
/// Implements: rust-config/planning-settings
pub(crate) fn finite_non_negative(table: &Table, path: &str) -> Result<f64, ConfigError> {
    let number = match table.get(key_of(path)) {
        Some(Value::Float(value)) => Some(*value),
        Some(Value::Integer(value)) => value.to_string().parse::<f64>().ok(),
        _ => None,
    };
    match number {
        Some(value) if value.is_finite() && value >= 0.0 => Ok(value),
        _ => Err(ConfigError::InvalidValue {
            key: path.to_owned(),
            reason: MUST_BE_FINITE_NON_NEGATIVE.to_owned(),
        }),
    }
}

/// Reads the boolean at the dotted `path`, absent when it is unset.
///
/// # Errors
///
/// Returns `ConfigError::WrongType` when the value is not a TOML boolean.
///
/// Implements: rust-config/config-errors
pub(crate) fn boolean(table: &Table, path: &str) -> Result<Option<bool>, ConfigError> {
    match table.get(key_of(path)) {
        None => Ok(None),
        Some(Value::Boolean(value)) => Ok(Some(*value)),
        Some(_) => Err(ConfigError::WrongType {
            key: path.to_owned(),
            expected: A_BOOLEAN,
        }),
    }
}

/// Reads the trimmed non-empty string at the dotted `path`, absent when unset.
///
/// # Errors
///
/// Returns `ConfigError::WrongType` when the value is not a TOML string and
/// `ConfigError::InvalidValue` when it is empty after trimming.
///
/// Implements: rust-config/config-errors
pub(crate) fn non_empty_string(table: &Table, path: &str) -> Result<Option<String>, ConfigError> {
    let Some(value) = table.get(key_of(path)) else {
        return Ok(None);
    };
    let Value::String(raw) = value else {
        return Err(ConfigError::WrongType {
            key: path.to_owned(),
            expected: A_STRING,
        });
    };
    let value = raw.trim();
    if value.is_empty() {
        return Err(ConfigError::InvalidValue {
            key: path.to_owned(),
            reason: MUST_BE_NON_EMPTY.to_owned(),
        });
    }
    Ok(Some(value.to_owned()))
}
