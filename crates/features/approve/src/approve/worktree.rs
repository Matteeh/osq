//! Approving a change into its own branch and linked worktree.

pub(crate) mod copy;
pub(crate) mod markers;
mod path;
mod prepare;
mod record;
pub(crate) mod text;

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_kernel_config::{Config, Timeouts, VcsConfig};
use osq_kernel_storage::ChangeEntry;
use osq_kernel_vcs::{GitVcs, Vcs, VcsError, stacked_root};

use self::record::Recorder;
use super::failed;

/// Approves `entry` into its own branch and worktree under `repo`.
///
/// # Errors
///
/// Returns a `Failed` error with the command `approve` for every git or file
/// failure, and for a failed `vcs.prepare` after it rolls the writes back.
///
/// Implements: rust-approve/worktree-approval
/// Implements: rust-approve/rejected-branch-claim
pub(crate) fn approve(
    root: &Path,
    entry: &ChangeEntry,
    seal: &str,
    config: &Config,
    repo: &Path,
    kept: Option<&str>,
) -> Result<String, FeatureError> {
    let timeouts = config.timeouts;
    let checkout = GitVcs::new(root).with_timeouts(&timeouts);
    let recorder = Recorder::new(repo, &timeouts).map_err(|error| failed(&error))?;
    let head = checkout
        .head()
        .map_err(|error| failed(&error.to_string()))?;
    let base = head.sha;
    let folder = entry.folder.as_str();
    let branch = format!("osq/{folder}");
    let worktree = path::worktree(&config.vcs, repo, folder);
    create(&worktree, &branch, base.as_deref(), &checkout)?;
    recorder.record("worktree-add", root);
    if let Some(command) = &config.vcs.prepare
        && let Err(output) = prepare::run(&worktree, command, &timeouts)
    {
        let message = text::prepare_failed(&worktree, &branch, &output);
        return Err(rollback_error(
            root, &worktree, &branch, &recorder, &timeouts, &message,
        ));
    }
    seal_worktree(entry, seal, base.as_deref(), &worktree, &checkout)?;
    commit(&worktree, folder, config, &timeouts, &recorder)
        .map_err(|error| failed(&error.to_string()))?;
    remove_stacked(&config.vcs, repo, folder)?;
    remove_checkout(&checkout, &entry.path, &relative(folder))?;
    Ok(text::approved(folder, seal, kept, &worktree, &branch))
}

/// Creates the worktree's parent folders, its branch and the worktree itself.
///
/// Implements: rust-approve/worktree-approval
fn create(
    worktree: &Path,
    branch: &str,
    base: Option<&str>,
    checkout: &GitVcs,
) -> Result<(), FeatureError> {
    if let Some(parent) = worktree.parent() {
        fs::create_dir_all(parent).map_err(|error| failed(&error.to_string()))?;
    }
    checkout
        .create_branch(branch, base.unwrap_or("HEAD"))
        .map_err(|error| failed(&error.to_string()))?;
    checkout
        .worktree_add(&worktree.to_string_lossy(), branch)
        .map_err(|error| failed(&error.to_string()))
}

/// Replaces the worktree's change folder with the checkout's copy and seals it.
///
/// Implements: rust-approve/worktree-approval
fn seal_worktree(
    entry: &ChangeEntry,
    seal: &str,
    base: Option<&str>,
    worktree: &Path,
    checkout: &GitVcs,
) -> Result<(), FeatureError> {
    let target = worktree.join(relative(&entry.folder));
    copy::replace(&entry.path, &target).map_err(|error| failed(&error.to_string()))?;
    markers::write(&target, seal, base, checkout).map_err(|error| failed(&error))
}

/// Commits the sealed change folder in the worktree and records the commit.
///
/// Implements: rust-approve/worktree-approval
fn commit(
    worktree: &Path,
    folder: &str,
    config: &Config,
    timeouts: &Timeouts,
    recorder: &Recorder,
) -> Result<(), VcsError> {
    let vcs = GitVcs::new(worktree).with_timeouts(timeouts);
    let author = config.vcs.author.as_deref().unwrap_or_default();
    let message = format!("osq: {} approved", text::change_id(folder));
    let relative = relative(folder);
    vcs.commit(&[relative.as_str()], &message, author)?;
    recorder.record("commit", worktree);
    Ok(())
}

/// Commits a steered worktree change and records the commit for its root.
///
/// # Errors
///
/// Returns the display of the git error that cannot name the tree record or
/// commit the change.
///
/// Implements: rust-approve/steered-approval
pub(super) fn commit_recorded(
    checkout: &Path,
    worktree: &Path,
    folder: &str,
    config: &Config,
) -> Result<(), String> {
    let timeouts = &config.timeouts;
    let recorder = Recorder::new(checkout, timeouts)?;
    commit(worktree, folder, config, timeouts, &recorder).map_err(|error| error.to_string())
}

/// Removes the stacked approval's folder for `folder` when it exists.
///
/// Implements: rust-approve/worktree-approval
fn remove_stacked(vcs: &VcsConfig, repo: &Path, folder: &str) -> Result<(), FeatureError> {
    let home = PathBuf::from(std::env::var("HOME").unwrap_or_default());
    let stacked = stacked_root(vcs, repo, &home).join(folder);
    copy::remove(&stacked).map_err(|error| failed(&error.to_string()))
}

/// Removes the checkout's change folder unless HEAD already holds it.
///
/// Implements: rust-approve/worktree-approval
fn remove_checkout(checkout: &GitVcs, path: &Path, relative: &str) -> Result<(), FeatureError> {
    if checkout
        .path_exists("HEAD", relative)
        .map_err(|error| failed(&error.to_string()))?
    {
        return Ok(());
    }
    copy::remove(path).map_err(|error| failed(&error.to_string()))
}

/// Rolls the failed prepare back, adding any rollback failure to `message`.
///
/// Implements: rust-approve/worktree-approval
fn rollback_error(
    root: &Path,
    worktree: &Path,
    branch: &str,
    recorder: &Recorder,
    timeouts: &Timeouts,
    message: &str,
) -> FeatureError {
    match rollback(root, worktree, branch, recorder, timeouts) {
        Ok(()) => failed(message),
        Err(error) => failed(&format!("{message}\nrollback failed: {error}")),
    }
}

/// Removes the worktree, prunes it, records the prune and deletes the branch.
///
/// Implements: rust-approve/worktree-approval
fn rollback(
    root: &Path,
    worktree: &Path,
    branch: &str,
    recorder: &Recorder,
    timeouts: &Timeouts,
) -> Result<(), String> {
    copy::remove(worktree).map_err(|error| error.to_string())?;
    let checkout = GitVcs::new(root).with_timeouts(timeouts);
    checkout
        .worktree_prune()
        .map_err(|error| error.to_string())?;
    recorder.record("worktree-prune", root);
    checkout
        .delete_branch(branch)
        .map_err(|error| error.to_string())
}

/// The path of a change folder relative to the repository root.
fn relative(folder: &str) -> String {
    format!("openspec/changes/{folder}")
}
