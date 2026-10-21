//! The `Harness` enum and the defaults TypeScript gives each harness.

use toml::{Table, Value};

use crate::blocks::value::A_STRING;
use crate::error::ConfigError;

/// The `reason` text for a harness name outside the catalog.
const MUST_BE_A_HARNESS: &str = "must be one of: agy, opencode, mock, codex, pi, claude";

/// TypeScript's `DEFAULT_CONFIG.agy.model`.
pub(crate) const DEFAULT_AGY_MODEL: &str = "gemini-3.8-flash-high";
/// TypeScript's `DEFAULT_CONFIG.opencode.model`.
pub(crate) const DEFAULT_OPENCODE_MODEL: &str = "deepseek/deepseek-flash";

/// A harness osq can start for a role.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Harness {
    /// The `agy` harness.
    #[default]
    Agy,
    /// The `opencode` harness.
    Opencode,
    /// The `mock` harness.
    Mock,
    /// The `codex` harness.
    Codex,
    /// The `pi` harness.
    Pi,
    /// The `claude` harness.
    Claude,
}

impl Harness {
    /// The name the harness is written as, both in `osq.toml` and in errors.
    ///
    /// Implements: rust-config/role-settings
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Agy => "agy",
            Self::Opencode => "opencode",
            Self::Mock => "mock",
            Self::Codex => "codex",
            Self::Pi => "pi",
            Self::Claude => "claude",
        }
    }

    /// The model TypeScript's defaults give the harness, absent when none.
    ///
    /// Implements: rust-config/role-settings
    #[must_use]
    pub(crate) fn default_model(self) -> Option<String> {
        match self {
            Self::Agy => Some(DEFAULT_AGY_MODEL.to_owned()),
            Self::Opencode => Some(DEFAULT_OPENCODE_MODEL.to_owned()),
            Self::Mock | Self::Codex | Self::Pi | Self::Claude => None,
        }
    }

    /// Whether the harness accepts a planner `agent`, as its catalog entry says.
    ///
    /// Implements: rust-config/role-settings
    #[must_use]
    pub(crate) const fn supports_planner_agent(self) -> bool {
        matches!(self, Self::Agy | Self::Opencode | Self::Mock)
    }
}

/// Reads the optional harness at the dotted `path`, absent when it is unset.
///
/// # Errors
///
/// Returns `ConfigError::WrongType` when the value is not a string and
/// `ConfigError::InvalidValue` when the trimmed name is not a harness.
///
/// Implements: rust-config/role-settings
pub(crate) fn read_harness(table: &Table, path: &str) -> Result<Option<Harness>, ConfigError> {
    let Some(value) = table.get(super::key_of(path)) else {
        return Ok(None);
    };
    let Value::String(raw) = value else {
        return Err(ConfigError::WrongType {
            key: path.to_owned(),
            expected: A_STRING,
        });
    };
    match raw.trim() {
        "agy" => Ok(Some(Harness::Agy)),
        "opencode" => Ok(Some(Harness::Opencode)),
        "mock" => Ok(Some(Harness::Mock)),
        "codex" => Ok(Some(Harness::Codex)),
        "pi" => Ok(Some(Harness::Pi)),
        "claude" => Ok(Some(Harness::Claude)),
        _ => Err(ConfigError::InvalidValue {
            key: path.to_owned(),
            reason: MUST_BE_A_HARNESS.to_owned(),
        }),
    }
}
