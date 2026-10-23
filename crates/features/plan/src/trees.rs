//! The trees a project's changes live in, built from git and its config.

use std::path::{Path, PathBuf};

use osq_kernel_config::{Config, VcsConfig};
use osq_kernel_storage::{ChangeTree, TreeCandidate, change_trees};
use osq_kernel_vcs::{GitVcs, Vcs, Worktree, stacked_root};

/// The trees changes live in, with the git at the root they came from.
pub(crate) struct TreeSet {
    /// The git at the root the trees were built from.
    pub(crate) vcs: GitVcs,
    /// The project root, then its worktrees, then its stacked approvals.
    pub(crate) trees: Vec<ChangeTree>,
}

/// Lists the project root's trees and worktrees, and stacked approvals when
/// `stacked` is true.
///
/// # Errors
///
/// Returns the display of the first git error.
///
/// Implements: rust-plan/next-change-number
/// Implements: rust-plan/steering-lookup
pub(crate) fn list(root: &Path, config: &Config, stacked: bool) -> Result<TreeSet, String> {
    let vcs = GitVcs::new(root).with_timeouts(&config.timeouts);
    let worktrees = vcs.worktree_list().map_err(|error| error.to_string())?;
    let candidates: Vec<TreeCandidate> = worktrees.into_iter().map(candidate).collect();
    let stacked = if stacked {
        stacked_folders(&vcs, root, &config.vcs)?
    } else {
        Vec::new()
    };
    Ok(TreeSet {
        trees: change_trees(root, &candidates, &stacked),
        vcs,
    })
}

/// Turns one git worktree into a tree candidate.
///
/// Implements: rust-plan/next-change-number
/// Implements: rust-plan/steering-lookup
fn candidate(worktree: Worktree) -> TreeCandidate {
    TreeCandidate {
        path: PathBuf::from(worktree.path),
        branch: worktree.branch,
    }
}

/// The folders directly under the stacked approvals root, or none when the
/// home is unset or the root cannot be read.
///
/// Implements: rust-plan/next-change-number
fn stacked_folders(vcs: &GitVcs, root: &Path, config: &VcsConfig) -> Result<Vec<PathBuf>, String> {
    let Some(home) = std::env::var_os("HOME") else {
        return Ok(Vec::new());
    };
    let repo_root = vcs
        .root()
        .map_err(|error| error.to_string())?
        .unwrap_or_else(|| root.to_path_buf());
    let stacked = stacked_root(config, &repo_root, Path::new(&home));
    let Ok(entries) = std::fs::read_dir(&stacked) else {
        return Ok(Vec::new());
    };
    Ok(entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.path())
        .collect())
}
