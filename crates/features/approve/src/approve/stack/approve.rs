//! Recording a stacked approval as TypeScript's `recordStackedApproval` does.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_kernel_config::Config;
use osq_kernel_storage::ChangeEntry;
use osq_kernel_vcs::{GitVcs, Vcs, stacked_root};

use super::super::{failed, worktree};
use super::{Awaited, text};

/// Records `entry` as a stacked approval and returns the lines it prints.
///
/// # Errors
///
/// Returns a `Failed` error with the command `approve` for every git or file
/// failure.
///
/// Implements: rust-approve/stacked-approval
/// Implements: rust-approve/rejected-branch-claim
pub(crate) fn approve(
    root: &Path,
    entry: &ChangeEntry,
    seal: &str,
    config: &Config,
    repo: &Path,
    kept: Option<&str>,
    awaited: &[Awaited],
) -> Result<String, FeatureError> {
    let checkout = GitVcs::new(root).with_timeouts(&config.timeouts);
    let home = PathBuf::from(std::env::var("HOME").unwrap_or_default());
    let stacked = stacked_root(&config.vcs, repo, &home).join(&entry.folder);
    let target = stacked.join("openspec/changes").join(&entry.folder);
    worktree::copy::remove(&stacked).map_err(|error| failed(&error.to_string()))?;
    worktree::copy::replace(&entry.path, &target).map_err(|error| failed(&error.to_string()))?;
    worktree::markers::write_stacked(&target, seal, &checkout).map_err(|error| failed(&error))?;
    fs::write(target.join(".run/stacked-on"), text::stacked_on(awaited))
        .map_err(|error| failed(&error.to_string()))?;
    remove_checkout(&checkout, &entry.path, &entry.folder)?;
    Ok(text::approved(&entry.folder, seal, kept, awaited, &stacked))
}

/// Removes the checkout's change folder unless HEAD already holds it.
///
/// Implements: rust-approve/stacked-approval
fn remove_checkout(checkout: &GitVcs, path: &Path, folder: &str) -> Result<(), FeatureError> {
    let relative = format!("openspec/changes/{folder}");
    if checkout
        .path_exists("HEAD", &relative)
        .map_err(|error| failed(&error.to_string()))?
    {
        return Ok(());
    }
    worktree::copy::remove(path).map_err(|error| failed(&error.to_string()))
}
