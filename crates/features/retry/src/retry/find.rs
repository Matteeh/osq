//! Matching a query against active and archived change folders.

use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_kernel_config::Config;
use osq_kernel_storage::{
    ChangeEntry, ChangeTree, Location, TreeCandidate, change_trees, list_changes, list_tree_changes,
};
use osq_kernel_vcs::{GitVcs, Vcs, Worktree};

use super::text;

/// A change folder and the tree that holds it.
pub(crate) struct Located {
    /// The change folder.
    pub(crate) entry: ChangeEntry,
    /// The tree that holds it.
    pub(crate) tree: ChangeTree,
}

/// A project's trees and every change folder they hold.
pub(crate) struct Trees {
    /// The trees, the project root's own first.
    pub(crate) trees: Vec<ChangeTree>,
    /// Every change folder, each from the tree that owns it.
    pub(crate) entries: Vec<ChangeEntry>,
}

/// Lists the project's trees and changes when git is on, or none when it is off.
///
/// # Errors
///
/// Returns a `Failed` error with the command `retry` with the `VcsError`'s
/// display when the worktree list cannot be read.
///
/// Implements: rust-retry/active-worktree-retry
pub(crate) fn trees(
    root: &Path,
    config: &Config,
    repo: Option<&Path>,
) -> Result<Option<Trees>, FeatureError> {
    if repo.is_none() {
        return Ok(None);
    }
    let vcs = GitVcs::new(root).with_timeouts(&config.timeouts);
    let worktrees = vcs
        .worktree_list()
        .map_err(|error| text::failed(error.to_string()))?;
    let candidates: Vec<TreeCandidate> = worktrees.iter().map(candidate).collect();
    let trees = change_trees(root, &candidates, &[]);
    let entries = list_tree_changes(&trees);
    Ok(Some(Trees { trees, entries }))
}

/// Finds the first active change whose name matches `query`.
///
/// Implements: rust-retry/active-worktree-retry
pub(crate) fn find_active(root: &Path, listed: Option<&Trees>, query: &str) -> Option<Located> {
    if let Some(trees) = listed {
        return active_in(trees, query);
    }
    let entries = list_changes(root);
    let entry = entries
        .iter()
        .find(|entry| entry.location == Location::Active && matches(&entry.folder, query))?;
    Some(Located {
        entry: entry.clone(),
        tree: ChangeTree {
            root: root.to_path_buf(),
            folder: None,
        },
    })
}

/// Finds the first active change of a listed tree set whose name matches.
///
/// Implements: rust-retry/active-worktree-retry
fn active_in(trees: &Trees, query: &str) -> Option<Located> {
    let entry = trees
        .entries
        .iter()
        .find(|entry| entry.location == Location::Active && matches(&entry.folder, query))?;
    let tree = trees
        .trees
        .iter()
        .find(|tree| tree.folder.as_deref() == Some(entry.folder.as_str()))
        .or_else(|| trees.trees.first())?;
    Some(Located {
        entry: entry.clone(),
        tree: tree.clone(),
    })
}

/// Finds the first archived worktree change whose name matches `query`.
///
/// Implements: rust-retry/archived-retry
pub(crate) fn find_archived(trees: Option<&Trees>, query: &str) -> Option<Located> {
    let trees = trees?;
    let entry = trees
        .entries
        .iter()
        .find(|entry| entry.location == Location::Archived && matches(&entry.folder, query))?;
    let tree = trees
        .trees
        .iter()
        .find(|tree| tree.folder.is_some() && entry.path.starts_with(&tree.root))?;
    Some(Located {
        entry: entry.clone(),
        tree: tree.clone(),
    })
}

/// Turns one git worktree into a tree candidate.
///
/// Implements: rust-retry/archived-retry
fn candidate(worktree: &Worktree) -> TreeCandidate {
    TreeCandidate {
        path: PathBuf::from(&worktree.path),
        branch: worktree.branch.clone(),
    }
}

/// Whether a folder name matches a query as TypeScript's `matchesFolder` does.
///
/// Implements: rust-retry/retry-refusals
/// Implements: rust-retry/archived-retry
pub(crate) fn matches(folder: &str, query: &str) -> bool {
    let trimmed = query.trim();
    let padded = padded(trimmed);
    matches_prefix(folder, trimmed) || matches_prefix(folder, &padded)
}

/// Whether `folder` equals `prefix` or starts with it followed by a dash.
///
/// Implements: rust-retry/retry-refusals
fn matches_prefix(folder: &str, prefix: &str) -> bool {
    folder == prefix || starts_with_dash(folder, prefix)
}

/// The leading digits of `text` padded to three digits, or `text` without any.
///
/// Implements: rust-retry/retry-refusals
fn padded(text: &str) -> String {
    let digits: String = text.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        return text.to_owned();
    }
    let value = digits.trim_start_matches('0');
    if value.is_empty() {
        return "000".to_owned();
    }
    format!("{value:0>3}")
}

/// Whether `folder` starts with `prefix` followed by a dash.
///
/// Implements: rust-retry/retry-refusals
fn starts_with_dash(folder: &str, prefix: &str) -> bool {
    folder
        .strip_prefix(prefix)
        .is_some_and(|rest| rest.starts_with('-'))
}
