//! Running `sync`: settings, the archived worktree change, its dirt and the
//! sync commit.

use std::path::Path;

use osq_core::FeatureError;
use osq_kernel_config::load_config;
use osq_kernel_storage::read_land_facts;
use osq_kernel_vcs::{Vcs, project_git_root};

use super::sync::{self, Caller};
use super::{
    change_archive, checks, failed_in, find, git_vcs, land_default_branch, text, worktree_changes,
};

/// The command every failure names.
const SYNC: &str = "sync";

/// Runs `sync` for one query, returning its output text.
///
/// # Errors
///
/// Returns a `Failed` error with the command `sync` for every failure "Sync
/// command" names.
///
/// Implements: rust-land/sync-command
/// Implements: rust-vcs/project-root-check
pub(crate) fn run(root: &Path, query: &str) -> Result<String, FeatureError> {
    let config = load_config(root).map_err(|error| failed_in(SYNC, error.to_string()))?;
    let repo =
        project_git_root(root, &config).map_err(|error| failed_in(SYNC, error.to_string()))?;
    let (timeouts, settings, limits) = (config.timeouts, config.vcs, config.limits);
    if repo.is_none() {
        return Err(failed_in(SYNC, text::SYNC_NEEDS_GIT));
    }
    let vcs = git_vcs(root, &timeouts);
    let worktrees = worktree_changes(&vcs, root, SYNC)?;
    let Some(change) = find::archived_change(&worktrees, query) else {
        return Err(refusal(&worktrees, query));
    };
    let facts = read_land_facts(&change_archive(change, &change.folder));
    if let Some(message) = checks::stacked_sync(&change.folder, &facts) {
        return Err(failed_in(SYNC, message));
    }
    let status = git_vcs(&change.path, &timeouts)
        .status()
        .map_err(|error| failed_in(SYNC, error.to_string()))?;
    let archived = format!("openspec/changes/archive/{}", change.folder);
    if let Some(message) = checks::unclean_sync(&change.path, &status, &archived) {
        return Err(failed_in(SYNC, message));
    }
    let default_branch = land_default_branch(&vcs, &settings, SYNC)?;
    let synced = sync::run(
        &change.path,
        &change.folder,
        &default_branch,
        &settings,
        &timeouts,
        &limits,
        Caller {
            command: SYNC,
            records: false,
        },
    )?;
    Ok(if synced.is_some() {
        text::synced(&change.folder, &default_branch)
    } else {
        text::already_has(&change.folder, &default_branch)
    })
}

/// The refusal for a query that names no archived worktree change.
///
/// Implements: rust-land/sync-command
fn refusal(worktrees: &[find::WorktreeChange], query: &str) -> FeatureError {
    if let Some(change) = find::active_change(worktrees, query) {
        return failed_in(SYNC, text::sync_not_archived(&change.folder));
    }
    failed_in(SYNC, text::no_change(query))
}
