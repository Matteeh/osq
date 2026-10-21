//! The `[executor]` table.

use toml::Table;

use crate::blocks::value;
use crate::error::ConfigError;

use super::harness::{self, Harness};

/// The `executor` keys `osq.toml` may hold.
const KEYS: &[&str] = &["harness", "model"];

/// The harness and model the executor runs with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecutorConfig {
    /// The harness that runs a task.
    pub harness: Harness,
    /// The model the harness runs, absent when the harness chooses one.
    pub model: Option<String>,
}

impl Default for ExecutorConfig {
    fn default() -> Self {
        let harness = Harness::default();
        Self {
            harness,
            model: harness.default_model(),
        }
    }
}

/// Reads `osq.toml`'s `[executor]` table over the defaults.
///
/// # Errors
///
/// Returns the first unknown key, wrong type or refused value in reading order.
///
/// Implements: rust-config/role-settings
pub(crate) fn read_executor(table: &Table) -> Result<ExecutorConfig, ConfigError> {
    value::check_keys(table, KEYS, "executor")?;
    let harness = harness::read_harness(table, "executor.harness")?.unwrap_or_default();
    let model = match value::non_empty_string(table, "executor.model")? {
        Some(model) => Some(model),
        None => harness.default_model(),
    };
    Ok(ExecutorConfig { harness, model })
}
