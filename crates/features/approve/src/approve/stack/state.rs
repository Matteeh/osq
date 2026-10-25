//! Reading one folder's dependency state as TypeScript's `readDependencyState` does.

use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_kernel_config::Config;
use osq_kernel_vcs::{GitVcs, Vcs, stacked_root};

use super::super::failed;

/// What one folder reads as: landed, approved, archived or unapproved.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) enum State {
    /// The default branch holds the folder under `archive/`.
    Landed,
    /// The folder's branch or a copy on disk holds `.run/approved`.
    Approved(String),
    /// The folder's branch holds its archived copy with `.run/approved`.
    Archived(String),
    /// The folder awaits approval nowhere.
    Unapproved,
}

impl State {
    /// The approved hash when `approve` awaits this state, or none.
    ///
    /// Implements: rust-approve/stacked-approval
    pub(super) fn hash(&self) -> Option<&str> {
        match self {
            Self::Approved(hash) | Self::Archived(hash) => Some(hash),
            Self::Landed | Self::Unapproved => None,
        }
    }
}

/// Reads `folder`'s state and hash from the default branch, its branch and disk.
///
/// # Errors
///
/// Returns a `Failed` error with the command `approve` and the display of a
/// git error when a read fails.
///
/// Implements: rust-approve/stacked-approval
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
    if let Some(hash) = on_disk(config, repo, folder) {
        return Ok(State::Approved(hash));
    }
    Ok(State::Unapproved)
}

/// The state of a folder whose `osq/` branch exists.
///
/// Implements: rust-approve/stacked-approval
fn branch_state(
    vcs: &GitVcs,
    branch: &str,
    changes: &str,
    archive: &str,
) -> Result<State, FeatureError> {
    if let Some(hash) = show(vcs, branch, &format!("{archive}/.run/approved"))? {
        return Ok(State::Archived(hash.trim().to_owned()));
    }
    if let Some(hash) = show(vcs, branch, &format!("{changes}/.run/approved"))? {
        return Ok(State::Approved(hash.trim().to_owned()));
    }
    Ok(State::Unapproved)
}

/// Whether a folder's branch exists by exact name.
///
/// Implements: rust-approve/stacked-approval
fn branch_exists(vcs: &GitVcs, branch: &str) -> Result<bool, FeatureError> {
    Ok(vcs
        .list_branches(branch)
        .map_err(|error| failed(&error.to_string()))?
        .iter()
        .any(|found| found == branch))
}

/// One file's contents at `rev`, or none when `rev` has no such file.
///
/// Implements: rust-approve/stacked-approval
fn show(vcs: &GitVcs, rev: &str, path: &str) -> Result<Option<String>, FeatureError> {
    vcs.show(rev, path)
        .map_err(|error| failed(&error.to_string()))
}

/// Whether `path` exists at `rev`.
///
/// Implements: rust-approve/stacked-approval
fn exists(vcs: &GitVcs, rev: &str, path: &str) -> Result<bool, FeatureError> {
    vcs.path_exists(rev, path)
        .map_err(|error| failed(&error.to_string()))
}

/// The first approval marker a stacked copy, the checkout or its archive holds.
///
/// Implements: rust-approve/stacked-approval
fn on_disk(config: &Config, repo: &Path, folder: &str) -> Option<String> {
    let home = PathBuf::from(std::env::var("HOME").unwrap_or_default());
    let changes = repo.join("openspec").join("changes");
    let stacked = stacked_root(&config.vcs, repo, &home)
        .join(folder)
        .join("openspec/changes")
        .join(folder)
        .join(".run/approved");
    [
        stacked,
        changes.join(folder).join(".run/approved"),
        changes.join("archive").join(folder).join(".run/approved"),
    ]
    .into_iter()
    .find_map(|path| std::fs::read_to_string(path).ok())
    .map(|hash| hash.trim().to_owned())
}
