//! Finding the change folder an id, prefix or path names.

use std::path::{Path, PathBuf};

use osq_core::FeatureError;
use osq_kernel_storage::{ChangeEntry, Location};

/// One change folder found by its id, prefix or path.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Found {
    /// The folder's name.
    pub(crate) folder: String,
    /// The folder's path.
    pub(crate) path: PathBuf,
    /// Where the folder sits.
    pub(crate) location: Location,
}

/// Resolves an id, prefix or path as TypeScript's `resolveSpecFolder` does.
///
/// # Errors
///
/// Returns [`FeatureError::failed`] for an id no change folder matches.
pub(crate) fn resolve(
    root: &Path,
    id: &str,
    entries: &[ChangeEntry],
) -> Result<Found, FeatureError> {
    let trimmed = id.trim();
    if trimmed.contains('/') || Path::new(trimmed).is_absolute() {
        let candidate = if Path::new(trimmed).is_absolute() {
            PathBuf::from(trimmed)
        } else {
            root.join(trimmed)
        };
        if candidate.is_dir() {
            return Ok(found(candidate, entries));
        }
    }
    for entry in entries {
        if matches_folder(&entry.folder, trimmed) {
            return Ok(Found {
                folder: entry.folder.clone(),
                path: entry.path.clone(),
                location: entry.location,
            });
        }
    }
    Err(FeatureError::failed(
        "show",
        format!("Spec \"{id}\" not found in specs or archive"),
    ))
}

/// Builds a found folder for an existing path, taking its location from the listing.
fn found(candidate: PathBuf, entries: &[ChangeEntry]) -> Found {
    let folder = candidate
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_owned();
    let location = entries
        .iter()
        .find(|entry| same_path(&entry.path, &candidate))
        .map_or(Location::Active, |entry| entry.location);
    Found {
        folder,
        path: candidate,
        location,
    }
}

/// Whether two paths name the same folder after resolving what exists.
fn same_path(left: &Path, right: &Path) -> bool {
    let left = std::fs::canonicalize(left).unwrap_or_else(|_| left.to_path_buf());
    let right = std::fs::canonicalize(right).unwrap_or_else(|_| right.to_path_buf());
    left == right
}

/// Whether a folder name matches a query as TypeScript's `matchesFolder` does.
fn matches_folder(folder: &str, query: &str) -> bool {
    let padded = parse_int(query).map_or_else(|| query.to_owned(), pad);
    folder == query
        || folder == padded
        || folder.starts_with(&format!("{query}-"))
        || folder.starts_with(&format!("{padded}-"))
        || folder.ends_with(&format!("-{query}"))
}

/// Pads an integer's text to three characters as JavaScript's `padStart` does.
fn pad(number: i64) -> String {
    let text = number.to_string();
    let zeros = 3_usize.saturating_sub(text.len());
    format!("{}{text}", "0".repeat(zeros))
}

/// The integer a query starts with, as JavaScript's `Number.parseInt` reads one.
fn parse_int(text: &str) -> Option<i64> {
    let mut characters = text.trim_start().chars().peekable();
    let mut sign = 1_i64;
    if matches!(characters.peek(), Some('+' | '-')) && characters.next() == Some('-') {
        sign = -1;
    }
    let mut digits = String::new();
    while let Some(character) = characters.peek() {
        if !character.is_ascii_digit() {
            break;
        }
        if let Some(character) = characters.next() {
            digits.push(character);
        }
    }
    digits.parse::<i64>().ok().map(|number| sign * number)
}
