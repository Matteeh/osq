//! Listing the active changes delivery visits.

use std::path::{Path, PathBuf};

use osq_kernel_config::{Config, load_config};
use osq_kernel_storage::{
    ChangeEntry, Location, TreeCandidate, change_trees, list_changes, list_tree_changes,
};
use osq_kernel_vcs::{GitVcs, Vcs, Worktree, project_git_root};

use super::failure::ReactionFailure;

/// The active changes delivery visits, in listing order.
///
/// A config the project refuses, or a root whose git state cannot be read,
/// gives no changes.
///
/// Implements: rust-loop/delivered-changes
pub(crate) fn delivered_changes(root: &Path) -> Result<Vec<ChangeEntry>, ReactionFailure> {
    let Ok(config) = load_config(root) else {
        return Ok(Vec::new());
    };
    let entries = entries(root, &config)?;
    Ok(entries
        .into_iter()
        .filter(|entry| entry.location == Location::Active)
        .collect())
}

/// Lists every change of the root's own tree or its worktrees.
///
/// Implements: rust-loop/delivered-changes
fn entries(root: &Path, config: &Config) -> Result<Vec<ChangeEntry>, ReactionFailure> {
    if git_enabled_root(root, config) {
        return tree_entries(root, config);
    }
    Ok(list_changes(root))
}

/// Whether git is on and `root` is a repository's top level.
///
/// Implements: rust-loop/delivered-changes
fn git_enabled_root(root: &Path, config: &Config) -> bool {
    if !config.vcs.enabled {
        return false;
    }
    matches!(project_git_root(root, config), Ok(Some(_)))
}

/// Lists the changes of the root and its git worktrees.
///
/// Implements: rust-loop/delivered-changes
fn tree_entries(root: &Path, config: &Config) -> Result<Vec<ChangeEntry>, ReactionFailure> {
    let worktrees = GitVcs::new(root)
        .with_timeouts(&config.timeouts)
        .worktree_list()
        .map_err(|error| ReactionFailure::new("delivery", "", "*", error.to_string()))?;
    let candidates: Vec<TreeCandidate> = worktrees.iter().map(candidate).collect();
    Ok(list_tree_changes(&change_trees(root, &candidates, &[])))
}

/// Turns one git worktree into a tree candidate.
///
/// Implements: rust-loop/delivered-changes
fn candidate(worktree: &Worktree) -> TreeCandidate {
    TreeCandidate {
        path: PathBuf::from(&worktree.path),
        branch: worktree.branch.clone(),
    }
}
