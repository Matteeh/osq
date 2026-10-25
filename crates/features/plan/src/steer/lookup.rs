//! Finding the change a steering id names.

use std::path::{Path, PathBuf};

use osq_core::{FeatureError, parse_change_id};
use osq_kernel_config::{Config, load_config};
use osq_kernel_storage::{ChangeEntry, ChangeTree, list_changes, list_tree_changes};
use osq_kernel_vcs::project_git_root;

use crate::trees;

/// One change the lookup may steer, with the root of the tree it sits in.
pub(crate) struct Found {
    /// The change folder.
    pub(crate) entry: ChangeEntry,
    /// The root of the tree the change sits in.
    pub(crate) tree_root: PathBuf,
    /// Whether the tree names the change folder.
    pub(crate) named: bool,
}

/// Reads the root's config and lists every change the lookup may steer, with
/// the repository's top level when git is on.
///
/// # Errors
///
/// Returns the display of the first config or git error, and the nested-root
/// refusal when the root is not its repository's top level.
///
/// Implements: rust-plan/steering-lookup
pub(crate) fn candidates(
    root: &Path,
) -> Result<(Config, Option<PathBuf>, Vec<Found>), FeatureError> {
    let config =
        load_config(root).map_err(|error| FeatureError::failed("plan", error.to_string()))?;
    let git_root = project_git_root(root, &config)
        .map_err(|error| FeatureError::failed("plan", error.to_string()))?;
    let Some(repo) = git_root.as_deref() else {
        let found = list_changes(root)
            .into_iter()
            .map(|entry| Found {
                entry,
                tree_root: root.to_path_buf(),
                named: false,
            })
            .collect();
        return Ok((config, None, found));
    };
    let tree_set = trees::list(repo, &config, false)
        .map_err(|message| FeatureError::failed("plan", message))?;
    Ok((config, git_root, found_in(&tree_set.trees)))
}

/// Every change of every tree, each with the tree that holds it.
///
/// Implements: rust-plan/steering-lookup
fn found_in(trees: &[ChangeTree]) -> Vec<Found> {
    let mut found = Vec::new();
    for entry in list_tree_changes(trees) {
        let Some(tree) = trees.iter().find(|tree| entry.path.starts_with(&tree.root)) else {
            continue;
        };
        found.push(Found {
            named: tree.folder.as_deref() == Some(entry.folder.as_str()),
            tree_root: tree.root.clone(),
            entry,
        });
    }
    found
}

/// Whether a query core reads as a change id names `folder`.
///
/// Implements: rust-plan/steering-lookup
pub(crate) fn matches(folder: &str, query: &str) -> bool {
    parse_change_id(query, false).is_ok_and(|id| id.names(folder))
}
