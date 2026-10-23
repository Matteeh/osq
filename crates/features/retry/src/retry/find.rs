//! Matching a query against active and archived change folders.

use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_kernel_config::Config;
use osq_kernel_storage::{
    ChangeEntry, ChangeTree, Location, TreeCandidate, change_trees, list_tree_changes,
};
use osq_kernel_vcs::{GitVcs, Vcs, Worktree};

use super::text;

/// An archived change in an osq worktree, its tree and the loaded config.
pub(crate) struct Archived {
    /// The archived change folder.
    pub(crate) entry: ChangeEntry,
    /// The worktree tree that holds it.
    pub(crate) tree: ChangeTree,
    /// The root's config.
    pub(crate) config: Config,
}

/// Finds the first active change whose name matches `query`.
///
/// Implements: rust-retry/retry-refusals
pub(crate) fn find_change<'a>(changes: &'a [ChangeEntry], query: &str) -> Option<&'a ChangeEntry> {
    changes
        .iter()
        .find(|entry| entry.location == Location::Active && matches(&entry.folder, query))
}

/// Finds the first archived worktree change whose name matches `query`.
///
/// # Errors
///
/// Returns a `Failed` error with the command `retry` when the worktree list
/// cannot be read.
///
/// Implements: rust-retry/archived-retry
pub(crate) fn find_archived(
    root: &Path,
    config: &Config,
    repo: Option<&Path>,
    query: &str,
) -> Result<Option<Archived>, FeatureError> {
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
    let found = entries.into_iter().find_map(|entry| {
        if entry.location != Location::Archived || !matches(&entry.folder, query) {
            return None;
        }
        let tree = trees
            .iter()
            .find(|tree| tree.folder.is_some() && entry.path.starts_with(&tree.root))?;
        Some((entry, tree.clone()))
    });
    Ok(found.map(|(entry, tree)| Archived {
        entry,
        tree,
        config: config.clone(),
    }))
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
