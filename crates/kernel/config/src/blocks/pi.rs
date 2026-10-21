//! The `[pi]` table and its typed settings.

use toml::Table;

use crate::error::ConfigError;

use super::value;

/// The `pi` keys `osq.toml` may hold, in reading order.
const KEYS: &[&str] = &["bin", "provider", "model", "thinking"];

/// The pi harness's settings from `osq.toml`'s `[pi]` table.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PiConfig {
    /// The pi program, absent while unset.
    pub bin: Option<String>,
    /// The provider pi runs through, absent while unset.
    pub provider: Option<String>,
    /// The model pi runs, absent while unset.
    pub model: Option<String>,
    /// The thinking level pi runs at, absent while unset.
    pub thinking: Option<String>,
}

/// Reads `osq.toml`'s `[pi]` table.
///
/// # Errors
///
/// Returns the first unknown key, wrong type or refused value in reading order.
///
/// Implements: rust-config/pi-settings
pub(crate) fn read_pi(table: &Table) -> Result<PiConfig, ConfigError> {
    value::check_keys(table, KEYS, "pi")?;
    Ok(PiConfig {
        bin: value::non_empty_string(table, "pi.bin")?,
        provider: value::non_empty_string(table, "pi.provider")?,
        model: value::non_empty_string(table, "pi.model")?,
        thinking: value::non_empty_string(table, "pi.thinking")?,
    })
}
