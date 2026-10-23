//! The `[gates]` table and its TypeScript defaults.

use toml::Table;

use crate::error::ConfigError;

use super::value;

/// The `gates` keys `osq.toml` may hold, in reading order.
const KEYS: &[&str] = &["commitRetries"];

/// TypeScript's default for `gates.commitRetries`.
const DEFAULT_COMMIT_RETRIES: u64 = 2;

/// The gates a run applies, as `osq.toml`'s `[gates]` table holds them.
///
/// Implements: rust-config/gate-settings
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Gates {
    /// The catch-ups a run may try after a `commit_failed` halt.
    pub commit_retries: u64,
}

impl Default for Gates {
    fn default() -> Self {
        Self {
            commit_retries: DEFAULT_COMMIT_RETRIES,
        }
    }
}

/// Reads `osq.toml`'s `[gates]` table over the defaults.
///
/// # Errors
///
/// Returns the first unknown key, wrong type or refused value in reading order.
///
/// Implements: rust-config/gate-settings
pub(crate) fn read_gates(table: &Table) -> Result<Gates, ConfigError> {
    value::check_keys(table, KEYS, "gates")?;
    let commit_retries = value::non_negative_integer(table, "gates.commitRetries")?
        .unwrap_or(DEFAULT_COMMIT_RETRIES);
    Ok(Gates { commit_retries })
}
