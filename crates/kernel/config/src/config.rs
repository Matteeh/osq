//! The typed settings `osq.toml` holds and the readers of its file.

use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use crate::blocks::{self, Timeouts, VcsConfig};
use crate::error::ConfigError;
use crate::roles::{self, ExecutorConfig, PlannerConfig, ValidatorConfig};

/// TypeScript's default for `maxConcurrency`.
const DEFAULT_MAX_CONCURRENCY: u64 = 1;

/// The top-level keys `osq.toml` may hold.
const TOP_LEVEL_KEYS: &[&str] = &[
    "maxConcurrency",
    "timeouts",
    "vcs",
    "executor",
    "planner",
    "validator",
];

/// The settings `osq.toml` holds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Config {
    /// How many tasks osq runs at once.
    pub max_concurrency: u64,
    /// Every timeout osq applies.
    pub timeouts: Timeouts,
    /// The version control settings.
    pub vcs: VcsConfig,
    /// The harness and model that execute a task.
    pub executor: ExecutorConfig,
    /// The harness, model and agent that plan a change.
    pub planner: PlannerConfig,
    /// The validator's settings, absent when osq runs no validator.
    pub validator: Option<ValidatorConfig>,
}

impl Default for Config {
    fn default() -> Self {
        let executor = ExecutorConfig::default();
        Self {
            max_concurrency: DEFAULT_MAX_CONCURRENCY,
            timeouts: Timeouts::default(),
            vcs: VcsConfig::default(),
            planner: PlannerConfig::following(&executor),
            executor,
            validator: None,
        }
    }
}

/// Reads `<root>/osq.toml` into a `Config`, giving the defaults when absent.
///
/// # Errors
///
/// Returns `ConfigError::Read` when the file exists but cannot be read as
/// UTF-8 text, and whatever `parse_config` returns for its text.
///
/// Implements: rust-config/config-file
pub fn load_config(root: &Path) -> Result<Config, ConfigError> {
    let path = root.join("osq.toml");
    match fs::read_to_string(&path) {
        Ok(text) => parse_config(&text),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(Config::default()),
        Err(error) => Err(ConfigError::Read {
            path,
            message: error.to_string(),
        }),
    }
}

/// Turns `osq.toml` text into a `Config`, one table at a time.
///
/// # Errors
///
/// Returns `ConfigError::Syntax` when the text is not TOML, and the first
/// unknown key, wrong type or refused value in reading order otherwise.
///
/// Implements: rust-config/config-file
pub fn parse_config(text: &str) -> Result<Config, ConfigError> {
    let table: toml::Table =
        text.parse()
            .map_err(|error: toml::de::Error| ConfigError::Syntax {
                message: error.to_string(),
            })?;
    blocks::value::check_keys(&table, TOP_LEVEL_KEYS, "")?;
    let max_concurrency = blocks::value::positive_integer(&table, "maxConcurrency")?
        .unwrap_or(DEFAULT_MAX_CONCURRENCY);
    let timeouts = match blocks::value::table(&table, "timeouts")? {
        Some(table) => blocks::timeouts::read_timeouts(table)?,
        None => Timeouts::default(),
    };
    let vcs = match blocks::value::table(&table, "vcs")? {
        Some(table) => blocks::vcs::read_vcs(table)?,
        None => VcsConfig::default(),
    };
    let executor = match blocks::value::table(&table, "executor")? {
        Some(table) => roles::executor::read_executor(table)?,
        None => ExecutorConfig::default(),
    };
    let planner = match blocks::value::table(&table, "planner")? {
        Some(table) => roles::planner::read_planner(table)?,
        None => PlannerConfig::following(&executor),
    };
    let validator = match blocks::value::table(&table, "validator")? {
        Some(table) => Some(roles::validator::read_validator(table)?),
        None => None,
    };
    Ok(Config {
        max_concurrency,
        timeouts,
        vcs,
        executor,
        planner,
        validator,
    })
}
