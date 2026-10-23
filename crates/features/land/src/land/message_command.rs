//! Running `message`: settings, the archived worktree change and its land
//! message.

use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_config::load_config;
use osq_kernel_storage::read_land_facts;
use osq_kernel_vcs::Vcs;

use super::{change_archive, checks, failed_in, find, git_vcs, message, text, worktree_changes};

/// The command every failure names.
const MESSAGE: &str = "message";

/// Runs `message` for one query, returning the land message text.
///
/// # Errors
///
/// Returns a `Failed` error with the command `message` for every failure
/// "Message command" names.
///
/// Implements: rust-land/message-command
pub(crate) fn run(root: &Path, query: &str) -> Result<String, FeatureError> {
    let config = load_config(root).map_err(|error| failed_in(MESSAGE, error.to_string()))?;
    let timeouts = config.timeouts;
    if !config.vcs.enabled {
        return Err(failed_in(MESSAGE, text::MESSAGE_NEEDS_GIT));
    }
    let vcs = git_vcs(root, &timeouts);
    if vcs
        .root()
        .map_err(|error| failed_in(MESSAGE, error.to_string()))?
        .is_none()
    {
        return Err(failed_in(MESSAGE, text::MESSAGE_NEEDS_GIT));
    }
    let worktrees = worktree_changes(&vcs, root, MESSAGE)?;
    if let Some(change) = find::active_change(&worktrees, query) {
        return Err(failed_in(MESSAGE, text::not_archived(&change.folder)));
    }
    let Some(change) = find::archived_change(&worktrees, query) else {
        return Err(failed_in(MESSAGE, text::no_archived(query)));
    };
    let facts = read_land_facts(&change_archive(change, &change.folder));
    if let Some(message) = checks::stacked_message(&change.folder, &facts) {
        return Err(failed_in(MESSAGE, message));
    }
    Ok(message::format(
        &change.folder,
        &facts,
        change.head.as_deref(),
    ))
}
