//! Removing a landed change's worktree after the checkouts have moved.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use osq_kernel_config::{Timeouts, VcsConfig};
use osq_kernel_vcs::{Vcs, stacked_root};

use super::git_vcs;

/// What one cleanup attempted, the line it prints, and whether it failed.
pub(crate) struct Outcome {
    /// The cleanup's line, or none when there was nothing to remove.
    pub(crate) line: Option<String>,
    /// Whether a cleanup step failed.
    pub(crate) failed: bool,
}

/// Removes the change's worktree and prunes git's records, in that order.
///
/// Implements: rust-land/land-cleanup
pub(crate) fn run(
    repo_root: &Path,
    settings: &VcsConfig,
    timeouts: &Timeouts,
    folder: &str,
) -> Outcome {
    let target = worktree_path(settings, repo_root, folder);
    if !target.is_dir() && !is_listed(repo_root, timeouts, &target) {
        return Outcome {
            line: None,
            failed: false,
        };
    }
    let result = copy_logs(repo_root, &target, folder)
        .and_then(|()| remove_folder(&target))
        .and_then(|()| prune(repo_root, timeouts));
    let shown = target.display();
    match result {
        Ok(()) => Outcome {
            line: Some(format!("Removed worktree {shown}")),
            failed: false,
        },
        Err(cause) => Outcome {
            line: Some(format!("Could not remove worktree {shown}: {cause}")),
            failed: true,
        },
    }
}

/// The worktree's folder: `<vcs.worktreeRoot>/<repo>/<folder>`.
///
/// Implements: rust-land/land-cleanup
fn worktree_path(settings: &VcsConfig, repo_root: &Path, folder: &str) -> PathBuf {
    let home = PathBuf::from(std::env::var("HOME").unwrap_or_default());
    let stacked = stacked_root(settings, repo_root, &home);
    let parent = stacked
        .parent()
        .map_or_else(|| stacked.clone(), Path::to_path_buf);
    parent.join(folder)
}

/// Whether git's worktree list names `target`.
///
/// Implements: rust-land/land-cleanup
fn is_listed(repo_root: &Path, timeouts: &Timeouts, target: &Path) -> bool {
    git_vcs(repo_root, timeouts)
        .worktree_list()
        .is_ok_and(|entries| {
            entries
                .iter()
                .any(|entry| same_path(Path::new(&entry.path), target))
        })
}

/// Whether two paths name the same folder, following links when they exist.
///
/// Implements: rust-land/land-cleanup
fn same_path(left: &Path, right: &Path) -> bool {
    let left = fs::canonicalize(left).unwrap_or_else(|_| left.to_path_buf());
    let right = fs::canonicalize(right).unwrap_or_else(|_| right.to_path_buf());
    left == right
}

/// Copies the worktree's archived logs into the checkout, keeping files there.
///
/// Implements: rust-land/land-cleanup
fn copy_logs(repo_root: &Path, target: &Path, folder: &str) -> Result<(), String> {
    let archive = Path::new("openspec")
        .join("changes")
        .join("archive")
        .join(folder);
    let checkout = repo_root.join(&archive);
    if !checkout.is_dir() {
        return Ok(());
    }
    let source = target.join(&archive).join(".run").join("logs");
    if !source.is_dir() {
        return Ok(());
    }
    let destination = checkout.join(".run").join("logs");
    copy_tree(&source, &destination).map_err(|error| error.to_string())
}

/// Copies every file under `from` into `to`, leaving existing files as they are.
///
/// Implements: rust-land/land-cleanup
fn copy_tree(from: &Path, to: &Path) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else if !target.exists() {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

/// Deletes `target` with every file in it, when it still exists.
///
/// Implements: rust-land/land-cleanup
fn remove_folder(target: &Path) -> Result<(), String> {
    if !target.exists() {
        return Ok(());
    }
    fs::remove_dir_all(target).map_err(|error| error.to_string())
}

/// Drops git's records of worktrees whose folder no longer exists.
///
/// Implements: rust-land/land-cleanup
fn prune(repo_root: &Path, timeouts: &Timeouts) -> Result<(), String> {
    git_vcs(repo_root, timeouts)
        .worktree_prune()
        .map_err(|error| error.to_string())
}
