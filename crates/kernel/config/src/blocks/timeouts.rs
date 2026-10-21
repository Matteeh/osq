//! The `[timeouts]` table and its TypeScript defaults.

use std::time::Duration;

use toml::Table;

use crate::error::ConfigError;

use super::value;

/// The `timeouts` keys `osq.toml` may hold.
const KEYS: &[&str] = &[
    "staleLockSeconds",
    "taskTimeoutSeconds",
    "verifyTimeoutSeconds",
    "harnessPreflightSeconds",
    "harnessKillGracePeriodMs",
    "gitSeconds",
    "gitCommitSeconds",
    "gitRemoteSeconds",
];

/// TypeScript's default for `timeouts.staleLockSeconds`, in seconds.
const DEFAULT_STALE_LOCK_SECONDS: u64 = 2700;
/// TypeScript's default for `timeouts.taskTimeoutSeconds`, in seconds.
const DEFAULT_TASK_TIMEOUT_SECONDS: u64 = 1800;
/// TypeScript's default for `timeouts.verifyTimeoutSeconds`, in seconds.
const DEFAULT_VERIFY_TIMEOUT_SECONDS: u64 = 600;
/// TypeScript's default for `timeouts.harnessPreflightSeconds`, in seconds.
const DEFAULT_HARNESS_PREFLIGHT_SECONDS: u64 = 10;
/// TypeScript's default for `timeouts.harnessKillGracePeriodMs`, in milliseconds.
const DEFAULT_HARNESS_KILL_GRACE_MILLIS: u64 = 5000;
/// TypeScript's `DEFAULT_GIT_SECONDS`, in seconds.
const DEFAULT_GIT_SECONDS: u64 = 10;
/// TypeScript's `DEFAULT_GIT_COMMIT_SECONDS`, in seconds.
const DEFAULT_GIT_COMMIT_SECONDS: u64 = 120;
/// TypeScript's `DEFAULT_GIT_REMOTE_SECONDS`, in seconds.
const DEFAULT_GIT_REMOTE_SECONDS: u64 = 120;

/// Every timeout osq applies, as `osq.toml`'s `[timeouts]` table holds them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Timeouts {
    /// How long a stale `.run` lock is honoured.
    pub stale_lock: Duration,
    /// How long one task may run.
    pub task_timeout: Duration,
    /// How long a task's verify may run.
    pub verify_timeout: Duration,
    /// How long a harness preflight may take.
    pub harness_preflight: Duration,
    /// How long a killed harness has to exit.
    pub harness_kill_grace: Duration,
    /// How long one git read may take.
    pub git: Duration,
    /// How long one commit osq makes may take.
    pub git_commit: Duration,
    /// How long a remote fetch or push may take.
    pub git_remote: Duration,
}

impl Default for Timeouts {
    fn default() -> Self {
        Self {
            stale_lock: Duration::from_secs(DEFAULT_STALE_LOCK_SECONDS),
            task_timeout: Duration::from_secs(DEFAULT_TASK_TIMEOUT_SECONDS),
            verify_timeout: Duration::from_secs(DEFAULT_VERIFY_TIMEOUT_SECONDS),
            harness_preflight: Duration::from_secs(DEFAULT_HARNESS_PREFLIGHT_SECONDS),
            harness_kill_grace: Duration::from_millis(DEFAULT_HARNESS_KILL_GRACE_MILLIS),
            git: Duration::from_secs(DEFAULT_GIT_SECONDS),
            git_commit: Duration::from_secs(DEFAULT_GIT_COMMIT_SECONDS),
            git_remote: Duration::from_secs(DEFAULT_GIT_REMOTE_SECONDS),
        }
    }
}

/// Reads `osq.toml`'s `[timeouts]` table over the defaults.
///
/// # Errors
///
/// Returns the first unknown key, wrong type or refused value in reading order.
///
/// Implements: rust-config/timeouts-and-concurrency
pub(crate) fn read_timeouts(table: &Table) -> Result<Timeouts, ConfigError> {
    value::check_keys(table, KEYS, "timeouts")?;
    let defaults = Timeouts::default();
    Ok(Timeouts {
        stale_lock: seconds(table, "timeouts.staleLockSeconds", defaults.stale_lock)?,
        task_timeout: seconds(table, "timeouts.taskTimeoutSeconds", defaults.task_timeout)?,
        verify_timeout: seconds(
            table,
            "timeouts.verifyTimeoutSeconds",
            defaults.verify_timeout,
        )?,
        harness_preflight: seconds(
            table,
            "timeouts.harnessPreflightSeconds",
            defaults.harness_preflight,
        )?,
        harness_kill_grace: millis(
            table,
            "timeouts.harnessKillGracePeriodMs",
            defaults.harness_kill_grace,
        )?,
        git: seconds(table, "timeouts.gitSeconds", defaults.git)?,
        git_commit: seconds(table, "timeouts.gitCommitSeconds", defaults.git_commit)?,
        git_remote: seconds(table, "timeouts.gitRemoteSeconds", defaults.git_remote)?,
    })
}

/// Reads one `[timeouts]` key as seconds, falling back to `default`.
///
/// # Errors
///
/// Returns `ConfigError::WrongType` or `ConfigError::InvalidValue` per the
/// shared integer rule.
///
/// Implements: rust-config/timeouts-and-concurrency
fn seconds(table: &Table, path: &str, default: Duration) -> Result<Duration, ConfigError> {
    value::positive_integer(table, path).map(|value| value.map_or(default, Duration::from_secs))
}

/// Reads one `[timeouts]` key as milliseconds, falling back to `default`.
///
/// # Errors
///
/// Returns `ConfigError::WrongType` or `ConfigError::InvalidValue` per the
/// shared integer rule.
///
/// Implements: rust-config/timeouts-and-concurrency
fn millis(table: &Table, path: &str, default: Duration) -> Result<Duration, ConfigError> {
    value::positive_integer(table, path).map(|value| value.map_or(default, Duration::from_millis))
}
