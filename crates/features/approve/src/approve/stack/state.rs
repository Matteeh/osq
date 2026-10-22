//! Reading one folder's dependency state as TypeScript's `readDependencyState` does.

use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_kernel_config::Config;
use osq_kernel_vcs::{GitVcs, Vcs, stacked_root};

use super::super::failed;

/// What one folder reads as: landed, approved, archived or unapproved.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum State {
    /// The default branch holds the folder under `archive/`.
    Landed,
    /// The folder's branch or a copy on disk holds `.run/approved`.
    Approved,
    /// The folder's branch holds its archived copy with `.run/approved`.
    Archived,
    /// The folder awaits approval nowhere.
    Unapproved,
}

impl State {
    /// Whether `approve` would await this state as a stacked dependency.
    ///
    /// Implements: rust-approve/stacked-approval-refusal
    pub(super) fn awaits(self) -> bool {
        matches!(self, Self::Approved | Self::Archived)
    }
}

/// Reads `folder`'s state from the default branch, its branch and then disk.
///
/// # Errors
///
/// Returns a `Failed` error with the command `approve` and the display of a
/// git error when a read fails.
///
/// Implements: rust-approve/stacked-approval-refusal
pub(super) fn read(
    vcs: &GitVcs,
    config: &Config,
    repo: &Path,
    folder: &str,
) -> Result<State, FeatureError> {
    let changes = format!("openspec/changes/{folder}");
    let archive = format!("openspec/changes/archive/{folder}");
    let fallback = config.vcs.default_branch.as_deref().unwrap_or("main");
    let default = vcs
        .default_branch(fallback)
        .map_err(|error| failed(&error.to_string()))?;
    if exists(vcs, &default, &archive)? {
        return Ok(State::Landed);
    }
    let branch = format!("osq/{folder}");
    if branch_exists(vcs, &branch)? {
        return branch_state(vcs, &branch, &changes, &archive);
    }
    if on_disk(config, repo, folder) {
        return Ok(State::Approved);
    }
    Ok(State::Unapproved)
}

/// The state of a folder whose `osq/` branch exists.
///
/// Implements: rust-approve/stacked-approval-refusal
fn branch_state(
    vcs: &GitVcs,
    branch: &str,
    changes: &str,
    archive: &str,
) -> Result<State, FeatureError> {
    if exists(vcs, branch, &format!("{archive}/.run/approved"))? {
        return Ok(State::Archived);
    }
    if exists(vcs, branch, &format!("{changes}/.run/approved"))? {
        return Ok(State::Approved);
    }
    Ok(State::Unapproved)
}

/// Whether a folder's branch exists by exact name.
///
/// Implements: rust-approve/stacked-approval-refusal
fn branch_exists(vcs: &GitVcs, branch: &str) -> Result<bool, FeatureError> {
    Ok(vcs
        .list_branches(branch)
        .map_err(|error| failed(&error.to_string()))?
        .iter()
        .any(|found| found == branch))
}

/// Whether `path` exists at `rev`.
///
/// Implements: rust-approve/stacked-approval-refusal
fn exists(vcs: &GitVcs, rev: &str, path: &str) -> Result<bool, FeatureError> {
    vcs.path_exists(rev, path)
        .map_err(|error| failed(&error.to_string()))
}

/// Whether a stacked copy or the checkout holds the folder's approval marker.
///
/// Implements: rust-approve/stacked-approval-refusal
fn on_disk(config: &Config, repo: &Path, folder: &str) -> bool {
    let home = PathBuf::from(std::env::var("HOME").unwrap_or_default());
    let changes = repo.join("openspec").join("changes");
    let stacked = stacked_root(&config.vcs, repo, &home)
        .join(folder)
        .join("openspec/changes")
        .join(folder)
        .join(".run/approved");
    stacked.exists()
        || changes.join(folder).join(".run/approved").exists()
        || changes
            .join("archive")
            .join(folder)
            .join(".run/approved")
            .exists()
}
