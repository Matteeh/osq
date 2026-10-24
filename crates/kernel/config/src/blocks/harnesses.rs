//! The harness tables `osq.toml` holds besides `[pi]` and their settings.

use toml::Table;

use crate::error::ConfigError;

use super::value;

/// The `agy` keys `osq.toml` may hold, in reading order.
const AGY_KEYS: &[&str] = &["dangerouslySkipPermissions"];

/// The `opencode` keys `osq.toml` may hold, in reading order.
const OPENCODE_KEYS: &[&str] = &["bin", "agent"];

/// The `codex` keys `osq.toml` may hold, in reading order.
const CODEX_KEYS: &[&str] = &["bin"];

/// The `claude` keys `osq.toml` may hold, in reading order.
const CLAUDE_KEYS: &[&str] = &["bin", "sandbox"];

/// TypeScript's default for `opencode.agent`.
const DEFAULT_OPENCODE_AGENT: &str = "osq-coder";

/// The agy harness's settings from `osq.toml`'s `[agy]` table.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AgyConfig {
    /// Whether agy approves every tool call without asking.
    pub dangerously_skip_permissions: bool,
}

/// The opencode harness's settings from `osq.toml`'s `[opencode]` table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpencodeConfig {
    /// The opencode program, absent while unset.
    pub bin: Option<String>,
    /// The agent opencode runs.
    pub agent: String,
}

impl Default for OpencodeConfig {
    fn default() -> Self {
        Self {
            bin: None,
            agent: DEFAULT_OPENCODE_AGENT.to_owned(),
        }
    }
}

/// The codex harness's settings from `osq.toml`'s `[codex]` table.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CodexConfig {
    /// The codex program, absent while unset.
    pub bin: Option<String>,
}

/// The claude harness's settings from `osq.toml`'s `[claude]` table.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ClaudeConfig {
    /// The claude program, absent while unset.
    pub bin: Option<String>,
    /// Whether claude's Bash tool runs sandboxed without network.
    pub sandbox: bool,
}

/// Reads `osq.toml`'s `[agy]` table over the defaults.
///
/// # Errors
///
/// Returns the first unknown key, wrong type or refused value in reading order.
///
/// Implements: rust-config/harness-settings
pub(crate) fn read_agy(table: &Table) -> Result<AgyConfig, ConfigError> {
    value::check_keys(table, AGY_KEYS, "agy")?;
    Ok(AgyConfig {
        dangerously_skip_permissions: value::boolean(table, "agy.dangerouslySkipPermissions")?
            .unwrap_or_default(),
    })
}

/// Reads `osq.toml`'s `[opencode]` table over the defaults.
///
/// # Errors
///
/// Returns the first unknown key, wrong type or refused value in reading order.
///
/// Implements: rust-config/harness-settings
pub(crate) fn read_opencode(table: &Table) -> Result<OpencodeConfig, ConfigError> {
    let defaults = OpencodeConfig::default();
    value::check_keys(table, OPENCODE_KEYS, "opencode")?;
    Ok(OpencodeConfig {
        bin: value::non_empty_string(table, "opencode.bin")?,
        agent: value::non_empty_string(table, "opencode.agent")?.unwrap_or(defaults.agent),
    })
}

/// Reads `osq.toml`'s `[codex]` table over the defaults.
///
/// # Errors
///
/// Returns the first unknown key, wrong type or refused value in reading order.
///
/// Implements: rust-config/harness-settings
pub(crate) fn read_codex(table: &Table) -> Result<CodexConfig, ConfigError> {
    value::check_keys(table, CODEX_KEYS, "codex")?;
    Ok(CodexConfig {
        bin: value::non_empty_string(table, "codex.bin")?,
    })
}

/// Reads `osq.toml`'s `[claude]` table over the defaults.
///
/// # Errors
///
/// Returns the first unknown key, wrong type or refused value in reading order.
///
/// Implements: rust-config/harness-settings
pub(crate) fn read_claude(table: &Table) -> Result<ClaudeConfig, ConfigError> {
    value::check_keys(table, CLAUDE_KEYS, "claude")?;
    Ok(ClaudeConfig {
        bin: value::non_empty_string(table, "claude.bin")?,
        sandbox: value::boolean(table, "claude.sandbox")?.unwrap_or_default(),
    })
}
