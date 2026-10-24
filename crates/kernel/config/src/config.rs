//! The typed settings `osq.toml` holds and the readers of its file.

use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use crate::blocks::{
    self, AgyConfig, BannedWord, ClaudeConfig, CodexConfig, Gates, Limits, OpencodeConfig,
    PiConfig, Planning, Timeouts, VcsConfig,
};
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
    "pi",
    "agy",
    "opencode",
    "codex",
    "claude",
    "limits",
    "gates",
    "planning",
    "bannedWords",
];

/// The settings `osq.toml` holds.
#[derive(Debug, Clone, PartialEq)]
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
    /// The pi harness's settings.
    pub pi: PiConfig,
    /// The agy harness's settings.
    pub agy: AgyConfig,
    /// The opencode harness's settings.
    pub opencode: OpencodeConfig,
    /// The codex harness's settings.
    pub codex: CodexConfig,
    /// The claude harness's settings.
    pub claude: ClaudeConfig,
    /// Every lint limit osq applies.
    pub limits: Limits,
    /// The gates a run applies.
    pub gates: Gates,
    /// The plan report's measurement settings.
    pub planning: Planning,
    /// The words the project bans from its code.
    pub banned_words: Vec<BannedWord>,
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
            pi: PiConfig::default(),
            agy: AgyConfig::default(),
            opencode: OpencodeConfig::default(),
            codex: CodexConfig::default(),
            claude: ClaudeConfig::default(),
            limits: Limits::default(),
            gates: Gates::default(),
            planning: Planning::default(),
            banned_words: Vec::new(),
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
    let pi = match blocks::value::table(&table, "pi")? {
        Some(table) => blocks::pi::read_pi(table)?,
        None => PiConfig::default(),
    };
    let agy = match blocks::value::table(&table, "agy")? {
        Some(table) => blocks::harnesses::read_agy(table)?,
        None => AgyConfig::default(),
    };
    let opencode = match blocks::value::table(&table, "opencode")? {
        Some(table) => blocks::harnesses::read_opencode(table)?,
        None => OpencodeConfig::default(),
    };
    let codex = match blocks::value::table(&table, "codex")? {
        Some(table) => blocks::harnesses::read_codex(table)?,
        None => CodexConfig::default(),
    };
    let claude = match blocks::value::table(&table, "claude")? {
        Some(table) => blocks::harnesses::read_claude(table)?,
        None => ClaudeConfig::default(),
    };
    let limits = match blocks::value::table(&table, "limits")? {
        Some(table) => blocks::limits::read_limits(table)?,
        None => Limits::default(),
    };
    let gates = match blocks::value::table(&table, "gates")? {
        Some(table) => blocks::gates::read_gates(table)?,
        None => Gates::default(),
    };
    let planning = match blocks::value::table(&table, "planning")? {
        Some(table) => blocks::planning::read_planning(table)?,
        None => Planning::default(),
    };
    let banned_words = blocks::banned_words::read_banned_words(table.get("bannedWords"))?;
    Ok(Config {
        max_concurrency,
        timeouts,
        vcs,
        executor,
        planner,
        validator,
        pi,
        agy,
        opencode,
        codex,
        claude,
        limits,
        gates,
        planning,
        banned_words,
    })
}
