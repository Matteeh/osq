//! Finding a change in the project root's osq worktrees when git is on.

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_kernel_config::Config;
use osq_kernel_storage::{
    ChangeEntry, ChangeTree, Location, TreeCandidate, change_trees, list_tree_changes,
};
use osq_kernel_vcs::{GitVcs, Vcs, Worktree, project_git_root};

use super::{find, text};

/// The change an id names and the root of the tree that holds it.
pub(crate) struct Found {
    /// The active change folder.
    pub(crate) entry: ChangeEntry,
    /// The root of the tree that holds the change.
    pub(crate) root: PathBuf,
}

/// Whether git is on at `root`, as the vcs kernel decides for the root.
///
/// # Errors
///
/// Returns a `Failed` error for a root below its repository's top level.
///
/// Implements: rust-run/worktree-run
pub(crate) fn git_on(root: &Path, config: &Config) -> Result<bool, FeatureError> {
    let repo = project_git_root(root, config).map_err(|error| failed(error.to_string()))?;
    Ok(repo.is_some())
}

/// Finds the first active change the id names in the root's trees.
///
/// # Errors
///
/// Returns a `Failed` error with the display of the first git error, and for
/// an id no active change matches.
///
/// Implements: rust-run/worktree-run
pub(crate) fn find(root: &Path, config: &Config, id: &str) -> Result<Found, FeatureError> {
    let trees = trees(root, config)?;
    let entry = list_tree_changes(&trees)
        .into_iter()
        .find(|entry| entry.location == Location::Active && find::names(entry, id))
        .ok_or_else(|| failed(text::not_found(id, &changes(root))))?;
    let tree = trees
        .iter()
        .filter(|tree| entry.path.starts_with(&tree.root))
        .max_by_key(|tree| tree.root.components().count())
        .ok_or_else(|| failed(text::not_found(id, &changes(root))))?;
    Ok(Found {
        entry,
        root: tree.root.clone(),
    })
}

/// The project root's trees, with its worktrees and no stacked approvals.
///
/// Implements: rust-run/worktree-run
fn trees(root: &Path, config: &Config) -> Result<Vec<ChangeTree>, FeatureError> {
    let vcs = GitVcs::new(root).with_timeouts(&config.timeouts);
    let worktrees = vcs
        .worktree_list()
        .map_err(|error| failed(error.to_string()))?;
    let candidates: Vec<TreeCandidate> = worktrees.into_iter().map(candidate).collect();
    Ok(change_trees(root, &candidates, &[]))
}

/// Turns one git worktree into a tree candidate.
///
/// Implements: rust-run/worktree-run
fn candidate(worktree: Worktree) -> TreeCandidate {
    TreeCandidate {
        path: PathBuf::from(worktree.path),
        branch: worktree.branch,
    }
}

/// Whether the change lives in an osq worktree: a tree other than the root, or
/// the root itself when it is a linked worktree rather than the main checkout.
///
/// Implements: rust-run/verified-task-commit
/// Implements: rust-run/worktree-checks
pub(crate) fn is_worktree(root: &Path, tree_root: &Path) -> bool {
    let checkout = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let tree = fs::canonicalize(tree_root).unwrap_or_else(|_| tree_root.to_path_buf());
    tree != checkout || root.join(".git").is_file()
}

/// The changes folder a not-found message names.
fn changes(root: &Path) -> PathBuf {
    root.join("openspec").join("changes")
}

/// Builds the failed error for a lookup step.
fn failed(message: String) -> FeatureError {
    FeatureError::failed("run", message)
}
