//! Reading the change folders `report` counts, across the checkout or its trees.
//!
//! Implements: rust-report/report-changes

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_kernel_config::{Config, VcsConfig};
use osq_kernel_storage::{
    ChangeEntry, TreeCandidate, change_trees, list_changes, list_tree_changes,
};
use osq_kernel_vcs::{GitVcs, Vcs, Worktree, stacked_root};

use super::failed;

/// The open git reader of a root whose repository top is the root itself.
struct Git {
    /// The git program rooted at the project root.
    vcs: GitVcs,
    /// The repository's top level, symlinks resolved.
    repo_root: PathBuf,
}

/// Lists every active and archived change entry `report` counts.
///
/// # Errors
///
/// Returns [`FeatureError::failed`] when a git-backed listing fails.
///
/// Implements: rust-report/report-changes
pub(crate) fn entries(
    root: &Path,
    config: &Config,
    repo_root: Option<PathBuf>,
) -> Result<Vec<ChangeEntry>, FeatureError> {
    let Some(repo_root) = repo_root else {
        return Ok(list_changes(root));
    };
    let git = Git {
        vcs: GitVcs::new(root).with_timeouts(&config.timeouts),
        repo_root,
    };
    across_trees(root, config, &git)
}

/// Lists the changes across the root, its worktrees and its stacked folders.
///
/// # Errors
///
/// Returns [`FeatureError::failed`] when `git worktree list` fails.
fn across_trees(root: &Path, config: &Config, git: &Git) -> Result<Vec<ChangeEntry>, FeatureError> {
    let worktrees = git
        .vcs
        .worktree_list()
        .map_err(|error| failed(error.to_string()))?;
    let candidates: Vec<TreeCandidate> = worktrees.iter().map(candidate).collect();
    let stacked = stacked_folders(&git.repo_root, &config.vcs);
    Ok(list_tree_changes(&change_trees(
        root,
        &candidates,
        &stacked,
    )))
}

/// Turns one git worktree into a tree candidate.
fn candidate(worktree: &Worktree) -> TreeCandidate {
    TreeCandidate {
        path: PathBuf::from(&worktree.path),
        branch: worktree.branch.clone(),
    }
}

/// The folders directly under the stacked approvals root.
fn stacked_folders(repo_root: &Path, config: &VcsConfig) -> Vec<PathBuf> {
    let Some(home) = std::env::var_os("HOME") else {
        return Vec::new();
    };
    let stacked = stacked_root(config, repo_root, Path::new(&home));
    let Ok(entries) = fs::read_dir(&stacked) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.path())
        .collect()
}
