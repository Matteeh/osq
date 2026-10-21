//! Choosing the next change number from the checkout's change folders and,
//! with vcs enabled, every worktree, stacked approval and `osq/` branch.

use std::path::{Path, PathBuf};

use osq_kernel_config::{Config, VcsConfig, load_config};
use osq_kernel_storage::{TreeCandidate, change_trees, list_tree_changes};
use osq_kernel_vcs::{GitVcs, Vcs, Worktree, stacked_root};

/// The branch prefix every osq change branch carries.
const BRANCH_PREFIX: &str = "osq/";

/// The highest leading number of the checkout's entries and, with vcs enabled,
/// every worktree, stacked approval and `osq/` branch, plus one, padded.
///
/// # Errors
///
/// Returns the display of the first config or git error.
///
/// Implements: rust-plan/next-change-number
pub(super) fn next(root: &Path) -> Result<String, String> {
    let config = load_config(root).map_err(|error| error.to_string())?;
    let mut highest = checkout_highest(root);
    if config.vcs.enabled {
        highest = highest.max(trees_highest(root, &config)?);
    }
    Ok(format!("{:03}", highest + 1))
}

/// The highest leading number of any entry under the checkout's change folders.
///
/// Implements: rust-plan/next-change-number
fn checkout_highest(root: &Path) -> u128 {
    let changes = root.join("openspec").join("changes");
    let mut highest = 0_u128;
    for folder in [
        changes.clone(),
        changes.join("archive"),
        changes.join("rejected"),
    ] {
        let Ok(entries) = std::fs::read_dir(folder) else {
            continue;
        };
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if let Some(number) = leading_number(name) {
                    highest = highest.max(number);
                }
            }
        }
    }
    highest
}

/// The highest leading number of the trees and branches git knows.
///
/// Implements: rust-plan/next-change-number
fn trees_highest(root: &Path, config: &Config) -> Result<u128, String> {
    let vcs = GitVcs::new(root).with_timeouts(&config.timeouts);
    let worktrees = vcs.worktree_list().map_err(|error| error.to_string())?;
    let branches = vcs
        .list_branches(BRANCH_PREFIX)
        .map_err(|error| error.to_string())?;
    let candidates: Vec<TreeCandidate> = worktrees.into_iter().map(candidate).collect();
    let stacked = stacked_folders(&vcs, root, &config.vcs)?;
    let mut highest = 0_u128;
    for entry in list_tree_changes(&change_trees(root, &candidates, &stacked)) {
        if let Some(number) = leading_number(&entry.folder) {
            highest = highest.max(number);
        }
    }
    for branch in branches {
        if let Some(number) = branch.strip_prefix(BRANCH_PREFIX).and_then(leading_number) {
            highest = highest.max(number);
        }
    }
    Ok(highest)
}

/// Turns one git worktree into a tree candidate.
///
/// Implements: rust-plan/next-change-number
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

/// Reads an entry name's leading digits into their value.
///
/// Implements: rust-plan/next-change-number
fn leading_number(name: &str) -> Option<u128> {
    let digits: String = name.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}
