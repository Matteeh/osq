//! Proves where stacked approvals live for each `worktreeRoot` form.

use std::path::{Path, PathBuf};

use osq_kernel_config::VcsConfig;
use osq_kernel_vcs::stacked_root;

/// Proves every row of "Stacked folder paths".
///
/// Covers: rust-vcs/stacked-folder-paths
#[test]
fn stacked_folder_paths() {
    let rows = [
        ("~/.osq/worktrees", "/home/me/.osq/worktrees/osq/.stacked"),
        ("~", "/home/me/osq/.stacked"),
        ("/srv/trees", "/srv/trees/osq/.stacked"),
        ("~other/trees", "~other/trees/osq/.stacked"),
    ];
    let repo = Path::new("/work/osq");
    let home = Path::new("/home/me");
    for (worktree_root, folder) in rows {
        let config = VcsConfig {
            worktree_root: worktree_root.to_owned(),
            ..VcsConfig::default()
        };
        assert_eq!(
            stacked_root(&config, repo, home),
            PathBuf::from(folder),
            "for {worktree_root:?}"
        );
    }
}
