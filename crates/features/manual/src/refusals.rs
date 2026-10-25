//! The refusals `manual` checks before it writes anything.

use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_config::{Config, ManualEdits};
use osq_kernel_vcs::{GitVcs, StatusEntry, Vcs, project_git_root};

use crate::paths;

/// The refusal for `vcs.manualEdits = "block"`, naming the file Rust reads.
const BLOCKED: &str =
    "vcs.manualEdits is \"block\" in osq.toml; plan a change for these edits instead";

/// The refusal when git is off or the root is in no repository.
const NEEDS_VCS: &str = "osq manual needs vcs.enabled and a git checkout";

/// The refusal for a comment that is empty after trimming.
const NEEDS_COMMENT: &str = "osq manual needs a comment: osq manual \"<why>\"";

/// The refusal when no selected entry is left outside the changes folder.
const NOTHING_TO_KEEP: &str =
    "nothing to keep: the checkout has no uncommitted edits outside openspec/changes";

/// Builds the `Failed` error every refusal uses.
fn failed(message: impl Into<String>) -> FeatureError {
    FeatureError::failed("manual", message)
}

/// The working tree's entries and the ones a keep touches.
pub(crate) struct Selection {
    /// Every status entry the refusals read.
    pub(crate) status: Vec<StatusEntry>,
    /// The entries a keep writes and commits.
    pub(crate) kept: Vec<StatusEntry>,
}

/// Checks every refusal in the requirement's order and gives the selection.
///
/// # Errors
///
/// Returns the first refusal in the requirement's order.
///
/// Implements: rust-manual/manual-refusals
pub(crate) fn check(
    root: &Path,
    config: &Config,
    comment: &str,
    named: &[String],
) -> Result<Selection, FeatureError> {
    if config.vcs.manual_edits == ManualEdits::Block {
        return Err(failed(BLOCKED));
    }
    let git_root = project_git_root(root, config).map_err(|error| failed(error.to_string()))?;
    let Some(git_root) = git_root else {
        return Err(failed(NEEDS_VCS));
    };
    if comment.trim().is_empty() {
        return Err(failed(NEEDS_COMMENT));
    }
    if let Some(message) = paths::refused_named_path(named) {
        return Err(failed(message));
    }
    let status = GitVcs::new(git_root)
        .with_timeouts(&config.timeouts)
        .status()
        .map_err(|error| failed(error.to_string()))?;
    for candidate in named {
        if !status
            .iter()
            .any(|entry| paths::names_entry(candidate, entry))
        {
            return Err(failed(format!("{candidate} has no uncommitted edits")));
        }
    }
    let kept: Vec<StatusEntry> = paths::select_entries(&status, named)
        .into_iter()
        .filter(|entry| !paths::is_under_changes(&entry.path))
        .collect();
    if kept.is_empty() {
        return Err(failed(NOTHING_TO_KEEP));
    }
    Ok(Selection { status, kept })
}
