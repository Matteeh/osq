//! Doctor's locks, archives and done-marker change checks.
//!
//! The three lines are pure text; only this module reads change folders,
//! `/proc`, `HOME` and git (ADR 023).

use std::fs;
use std::path::{Component, Path, PathBuf};

use osq_kernel_config::{Config, VcsConfig};
use osq_kernel_storage::{
    ChangeEntry, Location, TreeCandidate, change_trees, list_changes, list_tree_changes,
    read_change_files,
};
use osq_kernel_vcs::{GitVcs, Vcs, Worktree, stacked_root};

/// Builds the `locks`, `archives` and `done-markers` lines for one root.
///
/// Implements: rust-doctor/doctor-change-checks
pub(super) fn change_lines(root: &Path, config: &Config) -> Vec<String> {
    let real = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let folders = list_folders(&real, config);
    vec![
        locks_line(&orphaned_locks(&real, &folders)),
        archives_line(&invalid_archives(&real, &folders)),
        done_line(&unverified_markers(&real, &folders)),
    ]
}

/// Lists the change folders, across worktrees and stacked approvals when git
/// works, else those of the root alone.
///
/// Implements: rust-doctor/doctor-change-checks
fn list_folders(root: &Path, config: &Config) -> Vec<ChangeEntry> {
    if config.vcs.enabled {
        if let Some(entries) = tree_folders(root, config) {
            return entries;
        }
    }
    list_changes(root)
}

/// Lists change folders across the repository's worktrees and stacked
/// approvals, or none when a git call fails or the root is no repository.
///
/// Implements: rust-doctor/doctor-change-checks
fn tree_folders(root: &Path, config: &Config) -> Option<Vec<ChangeEntry>> {
    let vcs = GitVcs::new(root).with_timeouts(&config.timeouts);
    let repo = vcs.root().ok()??;
    let worktrees = vcs.worktree_list().ok()?;
    let candidates: Vec<TreeCandidate> = worktrees.iter().map(candidate).collect();
    let stacked = stacked_folders(&config.vcs, &repo);
    let trees = change_trees(root, &candidates, &stacked);
    Some(list_tree_changes(&trees))
}

/// Turns one git worktree into a tree candidate.
///
/// Implements: rust-doctor/doctor-change-checks
fn candidate(worktree: &Worktree) -> TreeCandidate {
    TreeCandidate {
        path: PathBuf::from(&worktree.path),
        branch: worktree.branch.clone(),
    }
}

/// The folders directly under the stacked approvals root, or none when `HOME`
/// is unset or that folder cannot be read.
///
/// Implements: rust-doctor/doctor-change-checks
fn stacked_folders(config: &VcsConfig, repo_root: &Path) -> Vec<PathBuf> {
    let Some(home) = std::env::var_os("HOME") else {
        return Vec::new();
    };
    let stacked = stacked_root(config, repo_root, Path::new(&home));
    let Ok(entries) = fs::read_dir(stacked) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.path())
        .collect()
}

/// Every orphaned lock of every active folder, in listing order.
///
/// Implements: rust-doctor/doctor-change-checks
fn orphaned_locks(root: &Path, folders: &[ChangeEntry]) -> Vec<String> {
    let mut orphaned = Vec::new();
    for entry in folders
        .iter()
        .filter(|entry| entry.location == Location::Active)
    {
        for lock in read_change_files(&entry.path).locks {
            if !is_running(lock.pid) {
                orphaned.push(relative(root, &lock.path));
            }
        }
    }
    orphaned
}

/// Every archived folder that lacks a proposal or lacks tasks.
///
/// Implements: rust-doctor/doctor-change-checks
fn invalid_archives(root: &Path, folders: &[ChangeEntry]) -> Vec<String> {
    let mut invalid = Vec::new();
    for entry in folders
        .iter()
        .filter(|entry| entry.location == Location::Archived)
    {
        let files = read_change_files(&entry.path);
        if !files.has_proposal || !files.has_tasks {
            invalid.push(relative(root, &entry.path));
        }
    }
    invalid
}

/// Every unverified done marker of every active folder.
///
/// Implements: rust-doctor/doctor-change-checks
fn unverified_markers(root: &Path, folders: &[ChangeEntry]) -> Vec<String> {
    let mut unverified = Vec::new();
    for entry in folders
        .iter()
        .filter(|entry| entry.location == Location::Active)
    {
        for marker in read_change_files(&entry.path).done_markers {
            if !marker.verified {
                unverified.push(relative(root, &marker.path));
            }
        }
    }
    unverified
}

/// Whether a lock's pid still has a process entry.
///
/// Implements: rust-doctor/doctor-change-checks
fn is_running(pid: Option<i64>) -> bool {
    let Some(pid) = pid else {
        return false;
    };
    let Ok(pid) = u32::try_from(pid) else {
        return false;
    };
    Path::new("/proc").join(pid.to_string()).exists()
}

/// Formats the lock line from its orphaned paths.
///
/// Implements: rust-doctor/doctor-change-checks
fn locks_line(orphaned: &[String]) -> String {
    if orphaned.is_empty() {
        "[ok] locks: no orphaned locks".to_owned()
    } else {
        format!("[fail] locks: orphaned lock(s): {}", orphaned.join(", "))
    }
}

/// Formats the archive line from its invalid folders.
///
/// Implements: rust-doctor/doctor-change-checks
fn archives_line(invalid: &[String]) -> String {
    if invalid.is_empty() {
        "[ok] archives: all archives valid".to_owned()
    } else {
        format!(
            "[fail] archives: invalid archive(s): {}",
            invalid.join(", ")
        )
    }
}

/// Formats the done-marker line from its unverified markers.
///
/// Implements: rust-doctor/doctor-change-checks
fn done_line(unverified: &[String]) -> String {
    if unverified.is_empty() {
        "[ok] done-markers: all done markers verified".to_owned()
    } else {
        format!(
            "[fail] done-markers: unverified done marker placed by hand: {}",
            unverified.join(", ")
        )
    }
}

/// Writes a path relative to a root as Node's `path.relative` does.
///
/// Implements: rust-doctor/doctor-change-checks
fn relative(root: &Path, path: &Path) -> String {
    let root_parts: Vec<Component<'_>> = root.components().collect();
    let path_parts: Vec<Component<'_>> = path.components().collect();
    let shared = root_parts
        .iter()
        .zip(&path_parts)
        .take_while(|(left, right)| left == right)
        .count();
    let mut parts: Vec<String> = (shared..root_parts.len())
        .map(|_| "..".to_owned())
        .collect();
    parts.extend(
        path_parts[shared..]
            .iter()
            .map(|part| part.as_os_str().to_string_lossy().into_owned()),
    );
    parts.join("/")
}
