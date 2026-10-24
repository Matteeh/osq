//! Choosing the next change number from the checkout's change folders and,
//! with vcs enabled, every worktree, stacked approval and `osq/` branch.

use std::path::Path;

use osq_kernel_config::Config;
use osq_kernel_storage::list_tree_changes;
use osq_kernel_vcs::Vcs;

use crate::trees;

/// The branch prefix every osq change branch carries.
const BRANCH_PREFIX: &str = "osq/";

/// The highest leading number of the checkout's entries and, with a repository
/// top level, every worktree, stacked approval and `osq/` branch, plus one,
/// padded.
///
/// # Errors
///
/// Returns the display of the first git error.
///
/// Implements: rust-plan/next-change-number
pub(crate) fn next(
    root: &Path,
    config: &Config,
    git_root: Option<&Path>,
) -> Result<String, String> {
    let mut highest = checkout_highest(root);
    if let Some(repo) = git_root {
        highest = highest.max(trees_highest(repo, config)?);
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
            if let Some(name) = entry.file_name().to_str()
                && let Some(number) = leading_number(name)
            {
                highest = highest.max(number);
            }
        }
    }
    highest
}

/// The highest leading number of the trees and branches git knows.
///
/// Implements: rust-plan/next-change-number
fn trees_highest(repo: &Path, config: &Config) -> Result<u128, String> {
    let tree_set = trees::list(repo, config, true)?;
    let branches = tree_set
        .vcs
        .list_branches(BRANCH_PREFIX)
        .map_err(|error| error.to_string())?;
    let mut highest = 0_u128;
    for entry in list_tree_changes(&tree_set.trees) {
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
