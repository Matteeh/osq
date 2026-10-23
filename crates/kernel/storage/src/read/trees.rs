//! Listing the changes held by a project's worktrees and stacked folders.
//!
//! Implements: rust-storage/change-trees
//! Implements: rust-storage/change-listing-across-trees

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use super::listing::{
    ARCHIVE, ChangeEntry, Location, REJECTED, changes_dir, compare_names, list_entries,
};

/// One worktree a project's changes may live in.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TreeCandidate {
    /// The worktree's path.
    pub path: PathBuf,
    /// The branch the worktree has checked out.
    pub branch: Option<String>,
}

/// One tree changes live in, and the change folder it names.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ChangeTree {
    /// The tree's root.
    pub root: PathBuf,
    /// The change folder the tree names, or none for the project root.
    pub folder: Option<String>,
}

/// The trees changes live in: the project root, its osq worktrees, then its
/// stacked approvals that no worktree names.
///
/// Implements: rust-storage/change-trees
#[must_use]
pub fn change_trees(
    project_root: &Path,
    worktrees: &[TreeCandidate],
    stacked: &[PathBuf],
) -> Vec<ChangeTree> {
    let mut trees = vec![ChangeTree {
        root: project_root.to_path_buf(),
        folder: None,
    }];
    let root_real = real_path(project_root);
    let mut named = HashSet::new();
    for worktree in worktrees {
        let Some(branch) = worktree.branch.as_deref() else {
            continue;
        };
        let Some(folder) = branch.strip_prefix("osq/") else {
            continue;
        };
        if real_path(&worktree.path) == root_real {
            continue;
        }
        let tree = ChangeTree {
            root: worktree.path.clone(),
            folder: Some(folder.to_owned()),
        };
        if !holds_change(&tree, folder) {
            continue;
        }
        named.insert(folder.to_owned());
        trees.push(tree);
    }
    for path in stacked {
        let Some(folder) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if named.contains(folder) {
            continue;
        }
        trees.push(ChangeTree {
            root: path.clone(),
            folder: Some(folder.to_owned()),
        });
    }
    trees
}

/// Every change folder of every tree, each from the tree that owns it.
///
/// Implements: rust-storage/change-listing-across-trees
#[must_use]
pub fn list_tree_changes(trees: &[ChangeTree]) -> Vec<ChangeEntry> {
    let named: HashSet<&str> = trees
        .iter()
        .filter_map(|tree| tree.folder.as_deref())
        .collect();
    let mut entries = Vec::new();
    for tree in trees {
        let mut own = list_entries(&tree.root);
        if let Some(folder) = tree.folder.as_deref() {
            own.retain(|entry| entry.folder == folder);
            if let Some(first) = trees.first() {
                own.retain(|entry| !landed_copy(first, entry));
            }
        } else {
            own.retain(|entry| {
                entry.location != Location::Active || !named.contains(entry.folder.as_str())
            });
        }
        entries.extend(own);
    }
    entries.sort_by(|left, right| {
        location_rank(left.location)
            .cmp(&location_rank(right.location))
            .then_with(|| compare_names(&left.folder, &right.folder))
    });
    entries
}

/// Resolves a path's symlinks, falling back to the path as given.
fn real_path(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

/// Whether a tree holds a change folder as a worktree tree does.
fn holds_change(tree: &ChangeTree, folder: &str) -> bool {
    let changes = changes_dir(&tree.root);
    let approved = changes.join(folder).join(".run").join("approved");
    let archived = changes.join(ARCHIVE).join(folder);
    let rejected = changes.join(REJECTED).join(folder);
    [approved, archived, rejected]
        .iter()
        .any(|candidate| fs::metadata(candidate).is_ok())
}

/// Whether the first tree holds the same landed folder in the same place.
fn landed_copy(first: &ChangeTree, entry: &ChangeEntry) -> bool {
    let changes = changes_dir(&first.root);
    match entry.location {
        Location::Active => false,
        Location::Archived => changes.join(ARCHIVE).join(&entry.folder).is_dir(),
        Location::Rejected => changes.join(REJECTED).join(&entry.folder).is_dir(),
    }
}

/// Where a location sorts among the three.
fn location_rank(location: Location) -> u8 {
    match location {
        Location::Active => 0,
        Location::Archived => 1,
        Location::Rejected => 2,
    }
}
