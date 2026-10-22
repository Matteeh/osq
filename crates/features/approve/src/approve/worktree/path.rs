//! The worktree's folder, with the home folder the settings expand.

use std::path::{Path, PathBuf};

use osq_kernel_config::VcsConfig;
use osq_kernel_vcs::stacked_root;

/// Where the worktree of `folder` lives: the parent of the stacked root, joined
/// with the change folder, with `HOME`, empty when unset, expanding a `~`.
///
/// Implements: rust-approve/worktree-approval
#[must_use]
pub(crate) fn worktree(vcs: &VcsConfig, repo: &Path, folder: &str) -> PathBuf {
    let home = PathBuf::from(std::env::var("HOME").unwrap_or_default());
    let stacked = stacked_root(vcs, repo, &home);
    let parent = stacked
        .parent()
        .map_or_else(|| stacked.clone(), Path::to_path_buf);
    parent.join(folder)
}
