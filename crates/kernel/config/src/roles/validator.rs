//! The `[validator]` table.

use std::time::Duration;

use toml::Table;

use crate::blocks::value;
use crate::error::ConfigError;

use super::harness::{self, Harness};

/// The `validator` keys `osq.toml` may hold.
const KEYS: &[&str] = &["enabled", "harness", "model", "timeoutSeconds"];

/// TypeScript's default for `validator.enabled`.
const DEFAULT_VALIDATOR_ENABLED: bool = true;
/// TypeScript's `DEFAULT_VALIDATOR_TIMEOUT_SECONDS`.
const DEFAULT_VALIDATOR_TIMEOUT_SECONDS: u64 = 900;

/// The `reason` text for a validator key an enabled validator needs.
const REQUIRED_WHILE_ENABLED: &str = "is required when validator.enabled is true";

/// The harness, model and timeout the validator runs with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatorConfig {
    /// Whether osq runs a validator at all.
    pub enabled: bool,
    /// The harness that validates, absent while the validator is off.
    pub harness: Option<Harness>,
    /// The model the harness runs, absent while the validator is off.
    pub model: Option<String>,
    /// How long one validator run may take.
    pub timeout: Duration,
}

/// Reads `osq.toml`'s `[validator]` table over the defaults.
///
/// # Errors
///
/// Returns the first unknown key, wrong type, required key or refused value in
/// reading order.
///
/// Implements: rust-config/role-settings
pub(crate) fn read_validator(table: &Table) -> Result<ValidatorConfig, ConfigError> {
    value::check_keys(table, KEYS, "validator")?;
    let enabled = value::boolean(table, "validator.enabled")?.unwrap_or(DEFAULT_VALIDATOR_ENABLED);
    let harness = harness::read_harness(table, "validator.harness")?;
    if harness.is_none() && enabled {
        return Err(required("validator.harness"));
    }
    let model = value::non_empty_string(table, "validator.model")?;
    if model.is_none() && enabled {
        return Err(required("validator.model"));
    }
    let timeout = value::positive_integer(table, "validator.timeoutSeconds")?.map_or(
        Duration::from_secs(DEFAULT_VALIDATOR_TIMEOUT_SECONDS),
        Duration::from_secs,
    );
    Ok(ValidatorConfig {
        enabled,
        harness,
        model,
        timeout,
    })
}

/// The error for a validator key an enabled validator needs.
fn required(path: &str) -> ConfigError {
    ConfigError::InvalidValue {
        key: path.to_owned(),
        reason: REQUIRED_WHILE_ENABLED.to_owned(),
    }
}
