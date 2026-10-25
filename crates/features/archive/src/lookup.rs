//! Finding the change an archive argument names across a root and its worktrees.

use std::path::{Path, PathBuf};

use osq_core::{ChangeId, parse_change_id};
use osq_kernel_config::Config;
use osq_kernel_storage::{
    ChangeEntry, ChangeTree, Location, TreeCandidate, change_trees, list_changes, list_tree_changes,
};
use osq_kernel_vcs::{GitVcs, Vcs, Worktree};

/// The change the argument names, and the root of the tree it sits in.
pub(crate) struct Found {
    /// The active change folder.
    pub(crate) entry: ChangeEntry,
    /// The root of the tree that holds the change.
    pub(crate) tree_root: PathBuf,
    /// Whether the tree names the change folder, so the archive commits there.
    pub(crate) worktree: bool,
}

/// Finds the first active change the argument names in the root's trees.
///
/// # Errors
///
/// Returns the display of the first git error, the display of the error for an
/// argument core refuses, or `no active change` when no active folder the id
/// names exists.
///
/// Implements: rust-archive/change-lookup
pub(crate) fn find(
    root: &Path,
    config: &Config,
    git_on: bool,
    argument: &str,
) -> Result<Found, String> {
    let id = parse_change_id(argument, false).map_err(|error| error.to_string())?;
    if !git_on {
        return find_root(root, argument, &id);
    }
    let trees = trees(root, config)?;
    let entry = list_tree_changes(&trees)
        .into_iter()
        .find(|entry| entry.location == Location::Active && id.names(&entry.folder))
        .ok_or_else(|| no_change(argument))?;
    let tree = trees
        .iter()
        .find(|tree| entry.path.starts_with(&tree.root))
        .ok_or_else(|| no_change(argument))?;
    Ok(Found {
        worktree: tree.folder.is_some(),
        tree_root: tree.root.clone(),
        entry,
    })
}

/// Finds the first active change directly under the root.
///
/// Implements: rust-archive/change-lookup
fn find_root(root: &Path, argument: &str, id: &ChangeId) -> Result<Found, String> {
    list_changes(root)
        .into_iter()
        .find(|entry| entry.location == Location::Active && id.names(&entry.folder))
        .map(|entry| Found {
            entry,
            tree_root: root.to_path_buf(),
            worktree: false,
        })
        .ok_or_else(|| no_change(argument))
}

/// The project root's trees, with its worktrees and no stacked approvals.
///
/// Implements: rust-archive/change-lookup
fn trees(root: &Path, config: &Config) -> Result<Vec<ChangeTree>, String> {
    let vcs = GitVcs::new(root).with_timeouts(&config.timeouts);
    let worktrees = vcs.worktree_list().map_err(|error| error.to_string())?;
    let candidates: Vec<TreeCandidate> = worktrees.into_iter().map(candidate).collect();
    Ok(change_trees(root, &candidates, &[]))
}

/// Turns one git worktree into a tree candidate.
///
/// Implements: rust-archive/change-lookup
fn candidate(worktree: Worktree) -> TreeCandidate {
    TreeCandidate {
        path: PathBuf::from(worktree.path),
        branch: worktree.branch,
    }
}

/// The refusal for an argument no active change folder matches.
///
/// Implements: rust-archive/change-lookup
fn no_change(argument: &str) -> String {
    format!("no active change {argument}")
}
