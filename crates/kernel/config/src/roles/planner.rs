//! The `[planner]` table.

use toml::Table;

use crate::blocks::value;
use crate::error::ConfigError;

use super::executor::ExecutorConfig;
use super::harness::{self, Harness};

/// The `planner` keys `osq.toml` may hold.
const KEYS: &[&str] = &["harness", "model", "agent"];

/// TypeScript's catalog default for an `opencode` planner's agent.
pub(crate) const OSQ_PLANNER_AGENT: &str = "osq-planner";

/// The `reason` text for a required planner key that is unset.
const IS_REQUIRED: &str = "is required";

/// The harness, model and agent the planner runs with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlannerConfig {
    /// The harness that plans a change.
    pub harness: Harness,
    /// The model the harness runs, absent when the harness chooses one.
    pub model: Option<String>,
    /// The agent the harness runs, absent when the harness uses none.
    pub agent: Option<String>,
}

impl PlannerConfig {
    /// The planner that follows `executor`, as TypeScript resolves it.
    ///
    /// Implements: rust-config/role-settings
    #[must_use]
    pub(crate) fn following(executor: &ExecutorConfig) -> Self {
        Self {
            harness: executor.harness,
            model: executor.model.clone(),
            agent: default_agent(executor.harness),
        }
    }
}

/// The agent a harness uses when the file names none.
fn default_agent(harness: Harness) -> Option<String> {
    if harness == Harness::Opencode {
        Some(OSQ_PLANNER_AGENT.to_owned())
    } else {
        None
    }
}

/// Reads `osq.toml`'s `[planner]` table, where no key has a default.
///
/// # Errors
///
/// Returns the first unknown key, wrong type, required key or refused value in
/// reading order.
///
/// Implements: rust-config/role-settings
pub(crate) fn read_planner(table: &Table) -> Result<PlannerConfig, ConfigError> {
    value::check_keys(table, KEYS, "planner")?;
    let harness = harness::read_harness(table, "planner.harness")?
        .ok_or_else(|| required("planner.harness"))?;
    let model = value::non_empty_string(table, "planner.model")?
        .ok_or_else(|| required("planner.model"))?;
    Ok(PlannerConfig {
        harness,
        model: Some(model),
        agent: read_agent(table, harness)?,
    })
}

/// The error for a planner key the file leaves out.
fn required(path: &str) -> ConfigError {
    ConfigError::InvalidValue {
        key: path.to_owned(),
        reason: IS_REQUIRED.to_owned(),
    }
}

/// Reads the optional `planner.agent` over the harness's default.
///
/// # Errors
///
/// Returns `ConfigError::WrongType` when the value is not a non-empty string
/// and `ConfigError::InvalidValue` when `harness` has no agents.
///
/// Implements: rust-config/role-settings
fn read_agent(table: &Table, harness: Harness) -> Result<Option<String>, ConfigError> {
    let Some(agent) = value::non_empty_string(table, "planner.agent")? else {
        return Ok(default_agent(harness));
    };
    if !harness.supports_planner_agent() {
        return Err(ConfigError::InvalidValue {
            key: "planner.agent".to_owned(),
            reason: format!("is not supported by the {} harness", harness.as_str()),
        });
    }
    Ok(Some(agent))
}
