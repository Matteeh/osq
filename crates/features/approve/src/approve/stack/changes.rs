//! Listing the changes held by the root, its worktrees and its stacked approvals.

use std::path::{Path, PathBuf};

use osq_kernel_config::Config;
use osq_kernel_storage::{ChangeEntry, TreeCandidate, change_trees, list_tree_changes};
use osq_kernel_vcs::{GitVcs, Vcs, stacked_root};

use super::super::failed;

/// Every change folder of the root, its worktrees and its stacked approvals.
///
/// Implements: rust-approve/stacked-approval-refusal
pub(super) fn list(
    root: &Path,
    config: &Config,
    vcs: &GitVcs,
) -> Result<Vec<ChangeEntry>, osq_core::FeatureError> {
    let candidates = vcs
        .worktree_list()
        .map_err(|error| failed(&error.to_string()))?
        .into_iter()
        .map(candidate)
        .collect::<Vec<TreeCandidate>>();
    let stacked = stacked_folders(root, config, vcs)?;
    Ok(list_tree_changes(&change_trees(
        root,
        &candidates,
        &stacked,
    )))
}

/// Turns one git worktree into a tree candidate.
///
/// Implements: rust-approve/stacked-approval-refusal
fn candidate(worktree: osq_kernel_vcs::Worktree) -> TreeCandidate {
    TreeCandidate {
        path: PathBuf::from(worktree.path),
        branch: worktree.branch,
    }
}

/// The folders directly under the stacked approvals root, or none when the
/// home is unset or the root cannot be read.
///
/// Implements: rust-approve/stacked-approval-refusal
fn stacked_folders(
    root: &Path,
    config: &Config,
    vcs: &GitVcs,
) -> Result<Vec<PathBuf>, osq_core::FeatureError> {
    let Some(home) = std::env::var_os("HOME") else {
        return Ok(Vec::new());
    };
    let repo = vcs
        .root()
        .map_err(|error| failed(&error.to_string()))?
        .unwrap_or_else(|| root.to_path_buf());
    let stacked = stacked_root(&config.vcs, &repo, Path::new(&home));
    let Ok(entries) = std::fs::read_dir(&stacked) else {
        return Ok(Vec::new());
    };
    Ok(entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.path())
        .collect())
}
