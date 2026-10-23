//! Where the stacked approvals live, without reading a file.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use osq_kernel_config::VcsConfig;

/// Expands a leading `~` in `root` to `home`, as TypeScript's `expandHome`
/// does: only `~` alone and a `~/` prefix expand.
fn expand_home(root: &str, home: &Path) -> PathBuf {
    if root == "~" {
        return home.to_path_buf();
    }
    if let Some(rest) = root.strip_prefix("~/") {
        return home.join(rest);
    }
    PathBuf::from(root)
}

/// The folder that holds one stacked approval per change:
/// `<worktree root>/<repo_root's last component>/.stacked`, with a leading
/// `~` in the worktree root replaced by `home`.
///
/// Implements: rust-vcs/stacked-approvals-folder
#[must_use]
pub fn stacked_root(vcs: &VcsConfig, repo_root: &Path, home: &Path) -> PathBuf {
    let root = expand_home(&vcs.worktree_root, home);
    let repo = repo_root.file_name().unwrap_or_else(|| OsStr::new(""));
    root.join(repo).join(".stacked")
}
