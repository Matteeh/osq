//! Listing the active, archived and rejected change folders of a project.
//!
//! Implements: rust-storage/change-listing

use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};

/// The `changes` directory under `openspec/`.
const CHANGES: &str = "changes";

/// The directory holding archived changes.
const ARCHIVE: &str = "archive";

/// The directory holding rejected changes.
const REJECTED: &str = "rejected";

/// Where a change folder sits under `openspec/changes/`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Location {
    /// A change directly under `changes/`.
    Active,
    /// A change under `changes/archive/`.
    Archived,
    /// A change under `changes/rejected/`.
    Rejected,
}

/// One change folder: its name, where it sits and where it is on disk.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ChangeEntry {
    /// The folder's name, such as `001-alpha`.
    pub folder: String,
    /// Where the folder sits.
    pub location: Location,
    /// The folder's path.
    pub path: PathBuf,
}

/// Lists every change folder under `project_root/openspec/changes/`.
///
/// Active folders come first, then `archive/`, then `rejected/`, each sorted
/// by leading number and then by name. A missing changes directory lists none.
///
/// Implements: rust-storage/change-listing
#[must_use]
pub fn list_changes(project_root: &Path) -> Vec<ChangeEntry> {
    let changes = project_root.join("openspec").join(CHANGES);
    let mut entries = Vec::new();
    collect(&changes, Location::Active, &mut entries);
    collect(&changes.join(ARCHIVE), Location::Archived, &mut entries);
    collect(&changes.join(REJECTED), Location::Rejected, &mut entries);
    entries
}

/// Appends one location's change folders, sorted, to `entries`.
fn collect(dir: &Path, location: Location, entries: &mut Vec<ChangeEntry>) {
    let mut names = directory_names(dir);
    names.retain(|name| is_change_name(name, location));
    names.sort_by(|left, right| compare_names(left, right));
    for name in names {
        entries.push(ChangeEntry {
            path: dir.join(&name),
            folder: name,
            location,
        });
    }
}

/// The names of the directories directly under one directory.
fn directory_names(dir: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names = Vec::new();
    for entry in entries.flatten() {
        if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
            if let Ok(name) = entry.file_name().into_string() {
                names.push(name);
            }
        }
    }
    names
}

/// Whether a directory name is a change folder of one location.
fn is_change_name(name: &str, location: Location) -> bool {
    let hidden = name.starts_with('_') || name.starts_with('.');
    if location == Location::Active {
        !hidden && name != ARCHIVE && name != REJECTED
    } else {
        !hidden
    }
}

/// Orders two folder names by leading number first, then by name.
fn compare_names(left: &str, right: &str) -> Ordering {
    match (leading_number(left), leading_number(right)) {
        (Some(a), Some(b)) => a.cmp(&b).then_with(|| left.cmp(right)),
        _ => left.cmp(right),
    }
}

/// The number a folder name leads with, or `None` when it leads with no digit.
fn leading_number(name: &str) -> Option<u128> {
    let digits: String = name.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}
