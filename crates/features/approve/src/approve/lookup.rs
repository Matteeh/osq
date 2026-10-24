//! Listing the changes a query may name, each with the tree that holds it.

use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_kernel_config::Config;
use osq_kernel_storage::{
    ChangeEntry, ChangeTree, TreeCandidate, change_trees, list_changes, list_tree_changes,
};
use osq_kernel_vcs::{GitVcs, Vcs, Worktree};

use super::failed;

/// One change folder and the tree it lives in, if any.
pub(crate) struct Located {
    /// The change folder itself.
    pub(crate) entry: ChangeEntry,
    /// The tree that holds it, or none when git is off.
    pub(crate) tree: Option<ChangeTree>,
}

/// Lists every change folder the root's trees hold, with its tree.
///
/// # Errors
///
/// Returns a `Failed` error with the command `approve` when the worktree
/// listing fails.
///
/// Implements: rust-approve/approve-lookup
pub(crate) fn list(
    root: &Path,
    config: &Config,
    repo: Option<&Path>,
) -> Result<Vec<Located>, FeatureError> {
    if repo.is_none() {
        return Ok(list_changes(root)
            .into_iter()
            .map(|entry| Located { entry, tree: None })
            .collect());
    }
    let vcs = GitVcs::new(root).with_timeouts(&config.timeouts);
    let candidates = vcs
        .worktree_list()
        .map_err(|error| failed(&error.to_string()))?
        .into_iter()
        .filter(active_approved)
        .map(candidate)
        .collect::<Vec<TreeCandidate>>();
    let trees = change_trees(root, &candidates, &[]);
    Ok(list_tree_changes(&trees)
        .into_iter()
        .map(|entry| Located {
            tree: tree_for(&trees, &entry).cloned(),
            entry,
        })
        .collect())
}

/// Whether a worktree checks out an osq branch with its active change approved.
///
/// Implements: rust-approve/approve-lookup
fn active_approved(worktree: &Worktree) -> bool {
    let Some(branch) = worktree.branch.as_deref() else {
        return false;
    };
    let Some(folder) = branch.strip_prefix("osq/") else {
        return false;
    };
    Path::new(&worktree.path)
        .join("openspec")
        .join("changes")
        .join(folder)
        .join(".run")
        .join("approved")
        .is_file()
}

/// Turns one git worktree into a tree candidate.
///
/// Implements: rust-approve/approve-lookup
fn candidate(worktree: Worktree) -> TreeCandidate {
    TreeCandidate {
        path: PathBuf::from(worktree.path),
        branch: worktree.branch,
    }
}

/// The tree whose change folder is `entry`, or the root's own tree.
///
/// Implements: rust-approve/approve-lookup
fn tree_for<'a>(trees: &'a [ChangeTree], entry: &ChangeEntry) -> Option<&'a ChangeTree> {
    trees.iter().find(|tree| {
        entry
            .path
            .starts_with(tree.root.join("openspec").join("changes"))
    })
}
