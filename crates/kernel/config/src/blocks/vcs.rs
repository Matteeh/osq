//! The `[vcs]` table and its TypeScript defaults.

use toml::{Table, Value};

use crate::error::ConfigError;

use super::value::{self, A_STRING};

/// The `vcs` keys `osq.toml` may hold.
const KEYS: &[&str] = &[
    "enabled",
    "author",
    "worktreeRoot",
    "defaultBranch",
    "prepare",
    "afterLand",
    "manualEdits",
];

/// TypeScript's default for `vcs.enabled`, since osq makes no git writes.
const DEFAULT_VCS_ENABLED: bool = false;
/// TypeScript's `DEFAULT_WORKTREE_ROOT`.
const DEFAULT_WORKTREE_ROOT: &str = "~/.osq/worktrees";
/// TypeScript's default for `vcs.manualEdits`.
const DEFAULT_MANUAL_EDITS: ManualEdits = ManualEdits::Keep;

/// The `reason` text for an author that is not `Name <email>`.
const MUST_LOOK_LIKE_AUTHOR: &str = "must look like \"Name <email>\"";
/// The `reason` text for an enabled `vcs` block with no author.
const AUTHOR_REQUIRED: &str = "is required when vcs.enabled is true";
/// The `reason` text for a manual-edits value outside `keep` and `block`.
const MUST_BE_KEEP_OR_BLOCK: &str = "must be \"keep\" or \"block\"";

/// What osq does with edits made outside a task's scope.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManualEdits {
    /// Keep the edits, so a human reviews them.
    Keep,
    /// Refuse the edits.
    Block,
}

/// The version control settings `osq.toml`'s `[vcs]` table holds.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VcsConfig {
    /// Whether osq may write to git.
    pub enabled: bool,
    /// The identity every osq commit carries, as written.
    pub author: Option<String>,
    /// Where linked worktrees live.
    pub worktree_root: String,
    /// The branch approval must start from, absent while unset.
    pub default_branch: Option<String>,
    /// The command that runs before osq commits.
    pub prepare: Option<String>,
    /// The command that runs in the checkout after a land.
    pub after_land: Option<String>,
    /// What osq does with edits outside a task's scope.
    pub manual_edits: ManualEdits,
}

impl Default for VcsConfig {
    fn default() -> Self {
        Self {
            enabled: DEFAULT_VCS_ENABLED,
            author: None,
            worktree_root: DEFAULT_WORKTREE_ROOT.to_owned(),
            default_branch: None,
            prepare: None,
            after_land: None,
            manual_edits: DEFAULT_MANUAL_EDITS,
        }
    }
}

/// Reads `osq.toml`'s `[vcs]` table over the defaults.
///
/// # Errors
///
/// Returns the first unknown key, wrong type or refused value in reading order.
///
/// Implements: rust-config/version-control-settings
pub(crate) fn read_vcs(table: &Table) -> Result<VcsConfig, ConfigError> {
    value::check_keys(table, KEYS, "vcs")?;
    let enabled = value::boolean(table, "vcs.enabled")?.unwrap_or(DEFAULT_VCS_ENABLED);
    let author = author(table)?;
    if enabled && author.is_none() {
        return Err(ConfigError::InvalidValue {
            key: "vcs.author".to_owned(),
            reason: AUTHOR_REQUIRED.to_owned(),
        });
    }
    let defaults = VcsConfig::default();
    Ok(VcsConfig {
        enabled,
        author,
        worktree_root: value::non_empty_string(table, "vcs.worktreeRoot")?
            .unwrap_or(defaults.worktree_root),
        default_branch: value::non_empty_string(table, "vcs.defaultBranch")?,
        prepare: value::non_empty_string(table, "vcs.prepare")?,
        after_land: value::non_empty_string(table, "vcs.afterLand")?,
        manual_edits: manual_edits(table)?,
    })
}

/// Reads the optional `vcs.author`, kept as written.
///
/// # Errors
///
/// Returns `ConfigError::WrongType` when the value is not a string and
/// `ConfigError::InvalidValue` when it is not `Name <email>`.
///
/// Implements: rust-config/version-control-settings
fn author(table: &Table) -> Result<Option<String>, ConfigError> {
    let Some(value) = table.get("author") else {
        return Ok(None);
    };
    let Value::String(author) = value else {
        return Err(ConfigError::WrongType {
            key: "vcs.author".to_owned(),
            expected: A_STRING,
        });
    };
    if !looks_like_author(author) {
        return Err(ConfigError::InvalidValue {
            key: "vcs.author".to_owned(),
            reason: MUST_LOOK_LIKE_AUTHOR.to_owned(),
        });
    }
    Ok(Some(author.clone()))
}

/// Whether `author` is a name, a space, and a non-empty email in angle
/// brackets, as TypeScript's `^\S.*\s<[^<>]+>$` says.
#[must_use]
fn looks_like_author(author: &str) -> bool {
    let Some(before_end) = author.strip_suffix('>') else {
        return false;
    };
    let Some(open) = before_end.rfind('<') else {
        return false;
    };
    let email = &before_end[open + 1..];
    if email.is_empty() || email.contains('>') {
        return false;
    }
    let name = &before_end[..open];
    let Some(last) = name.chars().last() else {
        return false;
    };
    if !last.is_whitespace() {
        return false;
    }
    author
        .chars()
        .next()
        .is_some_and(|first| !first.is_whitespace())
}

/// Reads the optional `vcs.manualEdits` over `keep`.
///
/// # Errors
///
/// Returns `ConfigError::WrongType` when the value is not a string and
/// `ConfigError::InvalidValue` when it is neither `keep` nor `block`.
///
/// Implements: rust-config/version-control-settings
fn manual_edits(table: &Table) -> Result<ManualEdits, ConfigError> {
    let Some(value) = table.get("manualEdits") else {
        return Ok(DEFAULT_MANUAL_EDITS);
    };
    let Value::String(mode) = value else {
        return Err(ConfigError::WrongType {
            key: "vcs.manualEdits".to_owned(),
            expected: A_STRING,
        });
    };
    match mode.as_str() {
        "keep" => Ok(ManualEdits::Keep),
        "block" => Ok(ManualEdits::Block),
        _ => Err(ConfigError::InvalidValue {
            key: "vcs.manualEdits".to_owned(),
            reason: MUST_BE_KEEP_OR_BLOCK.to_owned(),
        }),
    }
}
